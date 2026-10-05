const fs = require('fs')
const path = require('path')
const { collect } = require('./extract.cjs')

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const BATCH_CHARS = 3500
const BATCH_ITEMS = 60
const WORKERS = 4

const encode = s => s.replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/\r/g, '\\r').replace(/\n/g, '\\n')

function decodeKey(line) {
  let out = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '\\' && i + 1 < line.length) {
      const n = line[++i]
      out += n === 'n' ? '\n' : n === 'r' ? '\r' : n
      continue
    }
    if (c === '=') return out
    out += c
  }
  return null
}

function knownKeys(dir) {
  const keys = new Set()
  let files = []
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'))
  } catch {}
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      if (!line || line.startsWith('//')) continue
      const key = decodeKey(line)
      if (key) keys.add(key)
    }
  }
  return keys
}

async function google(text, from, to, signal) {
  const body = new URLSearchParams({ q: text })
  const url = `${ENDPOINT}?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t`
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      body,
      signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'Mozilla/5.0' }
    })
    if (res.ok) {
      const data = await res.json()
      return (data[0] || []).map(part => part[0] || '').join('')
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`Google ${res.status}`)
    await new Promise(r => setTimeout(r, 2500 * (attempt + 1)))
  }
  throw new Error('Google is not responding')
}

function batches(items) {
  const out = []
  let current = []
  let size = 0
  for (const item of items) {
    if (item.includes('\n')) {
      out.push([item])
      continue
    }
    if (current.length && (size + item.length > BATCH_CHARS || current.length >= BATCH_ITEMS)) {
      out.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += item.length + 1
  }
  if (current.length) out.push(current)
  return out
}

async function translateBatch(batch, from, to, signal) {
  if (batch.length === 1) return [await google(batch[0], from, to, signal)]
  const joined = await google(batch.join('\n'), from, to, signal)
  const lines = joined.split('\n')
  if (lines.length === batch.length) return lines
  const half = Math.ceil(batch.length / 2)
  return [...(await translateBatch(batch.slice(0, half), from, to, signal)), ...(await translateBatch(batch.slice(half), from, to, signal))]
}

async function pretranslate(game, appInfo, { from, to, signal, report, limit }) {
  const dir = path.join(game.root, 'BepInEx', 'Translation', to, 'Text')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'pretranslated.txt')

  report({ phase: 'scan', done: 0, total: 0 })
  const strings = await collect(game, appInfo, from, {
    signal,
    limit,
    onProgress: (done, total) => report({ phase: 'scan', done, total })
  })
  const known = knownKeys(dir)
  const todo = strings.filter(s => !known.has(s))
  if (!fs.existsSync(file)) fs.writeFileSync(file, '﻿// Unity Game Language Changer\n', 'utf8')

  const queue = batches(todo)
  let done = 0
  let written = 0
  let failed = 0
  report({ phase: 'translate', done, total: todo.length })

  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const batch = queue.shift()
      try {
        const result = await translateBatch(batch, from, to, signal)
        const lines = []
        batch.forEach((original, i) => {
          const translated = (result[i] || '').trim()
          if (translated && translated !== original && !original.startsWith('//') && !original.startsWith('#')) {
            lines.push(`${encode(original)}=${encode(translated)}`)
          }
        })
        if (lines.length) fs.appendFileSync(file, `${lines.join('\n')}\n`, 'utf8')
        written += lines.length
      } catch (err) {
        if (signal?.aborted) return
        failed += batch.length
        if (failed > 400 && written === 0) throw err
      }
      done += batch.length
      report({ phase: 'translate', done, total: todo.length })
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))
  return { found: strings.length, translated: written, skipped: strings.length - todo.length, failed }
}

module.exports = { pretranslate, knownKeys, encode, decodeKey }
