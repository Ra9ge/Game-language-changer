const fs = require('fs')
const path = require('path')

const headers = { 'User-Agent': 'UnityGameLanguageChanger', Accept: '*/*' }

async function fetchJson(url) {
  const res = await fetch(url, { headers: { ...headers, Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function fetchText(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

async function downloadOnce(url, target, onProgress, signal) {
  const res = await fetch(url, { headers, redirect: 'follow', signal })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  const temp = `${target}.part`
  const out = fs.createWriteStream(temp)
  let received = 0
  let lastReport = 0
  try {
    for await (const chunk of res.body) {
      received += chunk.length
      if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve))
      const now = Date.now()
      if (onProgress && now - lastReport > 120) {
        lastReport = now
        onProgress(received, total)
      }
    }
    await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())))
  } catch (err) {
    out.destroy()
    fs.rmSync(temp, { force: true })
    throw err
  }
  if (total && received !== total) {
    fs.rmSync(temp, { force: true })
    throw new Error(`Incomplete download ${received}/${total}`)
  }
  fs.renameSync(temp, target)
  onProgress?.(received, total || received)
}

async function download(url, target, { onProgress, signal, attempts = 3, validate } = {}) {
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    if (!validate || validate(target)) return target
    fs.rmSync(target, { force: true })
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      await downloadOnce(url, target, onProgress, signal)
      if (validate && !validate(target)) throw new Error('Downloaded file is damaged')
      return target
    } catch (err) {
      lastError = err
      if (signal?.aborted) break
      await new Promise(resolve => setTimeout(resolve, 1200 * (i + 1)))
    }
  }
  throw lastError
}

module.exports = { fetchJson, fetchText, download }
