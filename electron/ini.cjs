const fs = require('fs')
const path = require('path')

function parseLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return null
  const section = trimmed.match(/^\[(.+)\]$/)
  if (section) return { section: section[1] }
  const eq = line.indexOf('=')
  if (eq < 0) return null
  return { key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() }
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^﻿/, '') : ''
}

function get(text, section, key) {
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const p = parseLine(line)
    if (!p) continue
    if (p.section) current = p.section
    else if (current === section && p.key === key) return p.value
  }
  return undefined
}

function set(text, section, values, spaced = false) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text ? text.split(/\r?\n/) : []
  const pending = new Map(Object.entries(values))
  const join = spaced ? ' = ' : '='
  let current = null
  let anchor = -1

  for (let i = 0; i < lines.length; i++) {
    const p = parseLine(lines[i])
    if (!p) continue
    if (p.section) {
      current = p.section
      if (current === section && anchor < 0) anchor = i
      continue
    }
    if (current !== section) continue
    anchor = i
    if (pending.has(p.key)) {
      const head = lines[i].slice(0, lines[i].indexOf('=')).replace(/\s+$/, '')
      lines[i] = `${head}${join}${pending.get(p.key)}`
      pending.delete(p.key)
    }
  }

  if (pending.size) {
    const extra = [...pending].map(([k, v]) => `${k}${join}${v}`)
    if (anchor >= 0) {
      lines.splice(anchor + 1, 0, ...extra)
    } else {
      if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('')
      lines.push(`[${section}]`, ...extra)
    }
  }
  return lines.join(eol)
}

function update(file, sections, spaced = false) {
  let text = read(file)
  for (const [section, values] of Object.entries(sections)) text = set(text, section, values, spaced)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8')
}

module.exports = { read, get, set, update }
