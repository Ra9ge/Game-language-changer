const BEPINEX5 = '5.4.23.5'
const BEPINEX_BE = { build: 788, commit: '5b766a3' }
const XUNITY = '5.6.2'
const FONT_ARCHIVE = {
  name: 'TMP_Font_AssetBundles_2025-12-08.7z',
  url: 'https://github.com/bbepis/XUnity.AutoTranslator/releases/download/v5.5.0/TMP_Font_AssetBundles_2025-12-08.7z'
}

const gh = (repo, tag, file) => `https://github.com/${repo}/releases/download/${tag}/${file}`

function bepinex(backend, arch, latest) {
  if (backend === 'il2cpp') {
    const build = latest?.beBuild ?? BEPINEX_BE.build
    const commit = latest?.beCommit ?? BEPINEX_BE.commit
    const file = `BepInEx-Unity.IL2CPP-win-${arch}-6.0.0-be.${build}+${commit}.zip`
    return {
      key: `bepinex-il2cpp-${arch}-${build}`,
      title: `BepInEx 6 (IL2CPP, ${arch})`,
      version: `be.${build}`,
      file,
      url: `https://builds.bepinex.dev/projects/bepinex_be/${build}/${encodeURIComponent(file)}`
    }
  }
  const version = latest?.bepinex5 ?? BEPINEX5
  const file = `BepInEx_win_${arch}_${version}.zip`
  return {
    key: `bepinex-mono-${arch}-${version}`,
    title: `BepInEx 5 (Mono, ${arch})`,
    version,
    file,
    url: gh('BepInEx/BepInEx', `v${version}`, file)
  }
}

function xunity(backend, latest) {
  const version = latest?.xunity ?? XUNITY
  const file = backend === 'il2cpp' ? `XUnity.AutoTranslator-BepInEx-IL2CPP-${version}.zip` : `XUnity.AutoTranslator-BepInEx-${version}.zip`
  return {
    key: `xunity-${backend}-${version}`,
    title: 'XUnity.AutoTranslator',
    version,
    file,
    url: gh('bbepis/XUnity.AutoTranslator', latest?.xunityTag ?? `v${version}`, file)
  }
}

function fontBundleFor(unityVersion) {
  const major = parseInt(String(unityVersion || '').split('.')[0], 10)
  if (!major) return null
  if (major >= 6000) return 'arialuni_sdf_u6000'
  if (major >= 2022) return 'arialuni_sdf_u2022'
  if (major === 2021) return 'arialuni_sdf_u2021'
  if (major >= 2019) return 'arialuni_sdf_u2019'
  if (major === 2018) return 'arialuni_sdf_u2018'
  return 'arialuni_sdf-u55to2017'
}

async function resolveLatest(fetchJson, fetchText) {
  const result = {}
  try {
    const releases = await fetchJson('https://api.github.com/repos/BepInEx/BepInEx/releases?per_page=20')
    const stable = releases.find(r => !r.prerelease && /^v5\./.test(r.tag_name))
    if (stable) result.bepinex5 = stable.tag_name.slice(1)
  } catch {}
  try {
    const release = await fetchJson('https://api.github.com/repos/bbepis/XUnity.AutoTranslator/releases/latest')
    const asset = release?.assets?.find(a => /^XUnity\.AutoTranslator-BepInEx-[\d.]+\.zip$/.test(a.name))
    if (asset) {
      result.xunity = asset.name.match(/BepInEx-([\d.]+)\.zip$/)[1]
      result.xunityTag = release.tag_name
    }
  } catch {}
  try {
    const html = await fetchText('https://builds.bepinex.dev/projects/bepinex_be')
    const match = html.match(/bepinex_be\/(\d+)\/BepInEx-Unity\.IL2CPP-win-x64-6\.0\.0-be\.\d+%2B([0-9a-f]+)\.zip/)
    if (match) {
      result.beBuild = Number(match[1])
      result.beCommit = match[2]
    }
  } catch {}
  return result
}

module.exports = { bepinex, xunity, fontBundleFor, resolveLatest, FONT_ARCHIVE, pinned: { BEPINEX5, BEPINEX_BE, XUNITY } }
