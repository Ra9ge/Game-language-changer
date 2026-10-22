const fs = require('fs')
const path = require('path')
const { collect } = require('./extract.cjs')

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const BATCH_CHARS = 3500
const BATCH_ITEMS = 60
const WORKERS = 4
const TAG_SPLIT = /(<\/?#?[A-Za-z0-9][^<>\n]{0,80}>|<\/>)/
const LETTER = /\p{L}/u

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

const sleep = ms => new Promise(r => setTimeout(r, ms))
let pauseUntil = 0

async function google(text, from, to, signal) {
  const body = new URLSearchParams({ q: text })
  const sl = !from || from === 'auto' ? 'auto' : from
  const url = `${ENDPOINT}?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(to)}&dt=t`
  let lastError = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = pauseUntil - Date.now()
    if (wait > 0) await sleep(wait)
    if (signal?.aborted) throw new Error('aborted')
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        body,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'Mozilla/5.0' }
      })
    } catch (err) {
      if (signal?.aborted) throw err
      lastError = err
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (res.ok) {
      const data = await res.json()
      return (data[0] || []).map(part => part[0] || '').join('')
    }
    lastError = new Error(`Google ${res.status}`)
    if (res.status !== 429 && res.status < 500) throw lastError
    // too many requests: every worker waits, not just this one
    pauseUntil = Math.max(pauseUntil, Date.now() + 4000 * (attempt + 1))
  }
  throw lastError || new Error('Google is not responding')
}

async function translateLines(batch, from, to, signal) {
  if (batch.length === 1) return [(await google(batch[0], from, to, signal)).trim()]
  const joined = await google(batch.join('\n'), from, to, signal)
  const lines = joined.replace(/\n+$/, '').split('\n')
  if (lines.length === batch.length) return lines.map(l => l.trim())
  const half = Math.ceil(batch.length / 2)
  return [...(await translateLines(batch.slice(0, half), from, to, signal)), ...(await translateLines(batch.slice(half), from, to, signal))]
}

const TAG_LIST = new RegExp(TAG_SPLIT.source, 'g')
const tagsOf = s => (s.match(TAG_LIST) || []).join('')
const hasTags = s => TAG_SPLIT.test(s)

// Splits a line into rich text tags and text. Used when the translator broke the tags
// of a whole line: then only the text between tags is translated.
function split(original) {
  const parts = original.split(TAG_SPLIT)
  const slots = []
  for (let i = 0; i < parts.length; i += 2) {
    const core = parts[i].trim()
    if (core && LETTER.test(core)) slots.push({ index: i, core })
  }
  return { parts, slots }
}

function assemble({ parts, slots }, translated) {
  const out = [...parts]
  for (const { index, core } of slots) {
    const value = translated.get(core)
    if (value == null) return null
    const lead = parts[index].match(/^\s*/)[0]
    const trail = parts[index].match(/\s*$/)[0]
    out[index] = `${lead}${value}${trail}`
  }
  return out.join('')
}

// A translation is usable when it is not empty and kept every rich text tag in place.
const usable = (original, value) => Boolean(value && value.trim()) && (!hasTags(original) || tagsOf(original) === tagsOf(value))

function batches(items, maxItems = BATCH_ITEMS) {
  const out = []
  let current = []
  let size = 0
  for (const item of items) {
    if (item.includes('\n') || item.length > BATCH_CHARS) {
      out.push([item])
      continue
    }
    if (current.length && (size + item.length > BATCH_CHARS || current.length >= maxItems)) {
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

// Translates many texts with a few workers. Failed batches are tried again with smaller
// batches after a pause. Calls onResult(text, translation) for every text that came back.
async function translateMany(items, { from, to, signal, onResult, onBatch, maxFailures = 400 }) {
  let succeeded = 0
  const run = async (queue, workers, allowedFailures) => {
    const failed = []
    const worker = async () => {
      while (queue.length && !signal?.aborted) {
        const batch = queue.shift()
        try {
          const result = await translateLines(batch, from, to, signal)
          batch.forEach((text, i) => onResult(text, (result[i] || '').trim()))
          succeeded += batch.length
        } catch (err) {
          if (signal?.aborted) return
          failed.push(...batch)
          if (failed.length > allowedFailures && succeeded === 0) throw err
        }
        onBatch?.()
      }
    }
    await Promise.all(Array.from({ length: workers }, worker))
    return failed
  }
  let failed = await run(batches(items), WORKERS, maxFailures)
  for (let pass = 0; pass < 2 && failed.length && !signal?.aborted; pass++) {
    await sleep(5000 * (pass + 1))
    failed = await run(batches(failed, pass === 0 ? 15 : 1), 2, Infinity)
  }
  return failed
}

async function translateBySegments(text, from, to, signal) {
  const shape = split(text)
  if (!shape.slots.length) return text
  const cores = [...new Set(shape.slots.map(s => s.core))]
  const result = await translateLines(cores, from, to, signal)
  return assemble(shape, new Map(cores.map((c, i) => [c, result[i] || c]))) ?? text
}

// One line, used by the live translator while the game runs.
async function translateText(text, from, to, signal) {
  if (!LETTER.test(text)) return text
  const [whole] = await translateLines([text], from, to, signal)
  if (usable(text, whole)) return whole
  return hasTags(text) ? translateBySegments(text, from, to, signal) : text
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
  const todo = strings.filter(s => !known.has(s) && !s.startsWith('//') && !s.startsWith('#') && LETTER.test(s))
  if (!fs.existsSync(file)) fs.writeFileSync(file, '﻿// Unity Game Language Changer\n', 'utf8')

  let written = 0
  let done = 0
  const total = todo.length
  const save = (original, value) => {
    done++
    if (value === original) return
    fs.appendFileSync(file, `${encode(original)}=${encode(value)}\n`, 'utf8')
    written++
  }
  const progress = () => report({ phase: 'translate', done, total })

  // whole lines first: the translator sees the full sentence, tags included
  const broken = []
  report({ phase: 'translate', done, total })
  await translateMany(todo, {
    from,
    to,
    signal,
    onBatch: progress,
    onResult: (original, value) => {
      if (usable(original, value)) save(original, value)
      else if (hasTags(original)) broken.push(original)
      else done++
    }
  })

  // lines where tags got lost: translate the text between tags and put the tags back
  if (broken.length && !signal?.aborted) {
    const shapes = new Map(broken.map(o => [o, split(o)]))
    const cores = [...new Set([...shapes.values()].flatMap(s => s.slots.map(x => x.core)))]
    const translated = new Map()
    await translateMany(cores, { from, to, signal, onResult: (core, value) => translated.set(core, value || core), maxFailures: Infinity })
    for (const [original, shape] of shapes) {
      const value = assemble(shape, translated)
      if (value != null) save(original, value)
    }
    progress()
  }
  return { found: strings.length, translated: written, skipped: strings.length - todo.length, failed: total - done }
}

module.exports = { pretranslate, translateText, knownKeys, encode, decodeKey }
