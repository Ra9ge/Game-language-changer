const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const { encode, decodeKey } = require('./pretranslate.cjs')

const SPECIAL = /^_(Substitutions|Preprocessors|Postprocessors)\.txt$/i

const textDir = (root, lang) => path.join(root, 'BepInEx', 'Translation', lang, 'Text')

function decodeValue(line) {
  let escaped = false
  for (let i = 0; i < line.length; i++) {
    if (escaped) {
      escaped = false
      continue
    }
    if (line[i] === '\\') escaped = true
    else if (line[i] === '=') return decodeKey(`${line.slice(i + 1)}=`)
  }
  return null
}

function files(root, lang) {
  const dir = textDir(root, lang)
  try {
    return fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.txt') && !SPECIAL.test(f))
      .sort((a, b) => Number(a.startsWith('_')) - Number(b.startsWith('_')))
      .map(f => path.join(dir, f))
  } catch {
    return []
  }
}

function load(root, lang) {
  const seen = new Map()
  for (const file of files(root, lang)) {
    const name = path.basename(file)
    for (const line of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      if (!line || line.startsWith('//')) continue
      const key = decodeKey(line)
      const value = decodeValue(line)
      if (key && value !== null && !seen.has(key)) seen.set(key, { key, value, file: name })
    }
  }
  return [...seen.values()]
}

function save(root, lang, edits) {
  const pending = new Map(edits.map(e => [e.key, e.value]))
  for (const file of files(root, lang)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i] || lines[i].startsWith('//')) continue
      const key = decodeKey(lines[i].replace(/^﻿/, ''))
      if (key !== null && pending.has(key)) {
        const bom = lines[i].startsWith('﻿') ? '﻿' : ''
        lines[i] = `${bom}${encode(key)}=${encode(pending.get(key))}`
        changed = true
      }
    }
    if (changed) fs.writeFileSync(file, lines.join('\n'), 'utf8')
  }
  return load(root, lang).length
}

function exportPack(root, target) {
  const zip = new AdmZip()
  zip.addLocalFolder(path.join(root, 'BepInEx', 'Translation'))
  zip.writeZip(target)
  return target
}

function importPack(root, source) {
  const zip = new AdmZip(source)
  const dest = path.join(root, 'BepInEx', 'Translation')
  fs.mkdirSync(dest, { recursive: true })
  zip.extractAllTo(dest, true)
  return zip.getEntries().filter(e => !e.isDirectory).length
}

module.exports = { load, save, exportPack, importPack }
