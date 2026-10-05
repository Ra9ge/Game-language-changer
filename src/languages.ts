export interface Language {
  code: string
  native: string
  flag: string | null
}

export const LANGUAGES: Language[] = [
  { code: 'ru', native: 'Русский', flag: 'ru' },
  { code: 'uk', native: 'Українська', flag: 'ua' },
  { code: 'en', native: 'English', flag: 'gb' },
  { code: 'be', native: 'Беларуская', flag: 'by' },
  { code: 'kk', native: 'Қазақша', flag: 'kz' },
  { code: 'de', native: 'Deutsch', flag: 'de' },
  { code: 'fr', native: 'Français', flag: 'fr' },
  { code: 'es', native: 'Español', flag: 'es' },
  { code: 'pt', native: 'Português', flag: 'pt' },
  { code: 'it', native: 'Italiano', flag: 'it' },
  { code: 'pl', native: 'Polski', flag: 'pl' },
  { code: 'tr', native: 'Türkçe', flag: 'tr' },
  { code: 'ja', native: '日本語', flag: 'jp' },
  { code: 'zh-CN', native: '简体中文', flag: 'cn' },
  { code: 'zh-TW', native: '繁體中文', flag: 'tw' },
  { code: 'ko', native: '한국어', flag: 'kr' },
  { code: 'af', native: 'Afrikaans', flag: 'za' },
  { code: 'sq', native: 'Shqip', flag: 'al' },
  { code: 'am', native: 'አማርኛ', flag: 'et' },
  { code: 'ar', native: 'العربية', flag: 'sa' },
  { code: 'hy', native: 'Հայերեն', flag: 'am' },
  { code: 'az', native: 'Azərbaycan', flag: 'az' },
  { code: 'eu', native: 'Euskara', flag: 'es-pv' },
  { code: 'bn', native: 'বাংলা', flag: 'bd' },
  { code: 'bs', native: 'Bosanski', flag: 'ba' },
  { code: 'bg', native: 'Български', flag: 'bg' },
  { code: 'ca', native: 'Català', flag: 'es-ct' },
  { code: 'ceb', native: 'Cebuano', flag: 'ph' },
  { code: 'co', native: 'Corsu', flag: 'fr' },
  { code: 'hr', native: 'Hrvatski', flag: 'hr' },
  { code: 'cs', native: 'Čeština', flag: 'cz' },
  { code: 'da', native: 'Dansk', flag: 'dk' },
  { code: 'nl', native: 'Nederlands', flag: 'nl' },
  { code: 'eo', native: 'Esperanto', flag: null },
  { code: 'et', native: 'Eesti', flag: 'ee' },
  { code: 'fi', native: 'Suomi', flag: 'fi' },
  { code: 'fy', native: 'Frysk', flag: 'nl' },
  { code: 'gl', native: 'Galego', flag: 'es-ga' },
  { code: 'ka', native: 'ქართული', flag: 'ge' },
  { code: 'el', native: 'Ελληνικά', flag: 'gr' },
  { code: 'gu', native: 'ગુજરાતી', flag: 'in' },
  { code: 'ht', native: 'Kreyòl ayisyen', flag: 'ht' },
  { code: 'ha', native: 'Hausa', flag: 'ng' },
  { code: 'haw', native: 'ʻŌlelo Hawaiʻi', flag: 'us' },
  { code: 'he', native: 'עברית', flag: 'il' },
  { code: 'hi', native: 'हिन्दी', flag: 'in' },
  { code: 'hmn', native: 'Hmoob', flag: null },
  { code: 'hu', native: 'Magyar', flag: 'hu' },
  { code: 'is', native: 'Íslenska', flag: 'is' },
  { code: 'ig', native: 'Igbo', flag: 'ng' },
  { code: 'id', native: 'Bahasa Indonesia', flag: 'id' },
  { code: 'ga', native: 'Gaeilge', flag: 'ie' },
  { code: 'jw', native: 'Basa Jawa', flag: 'id' },
  { code: 'kn', native: 'ಕನ್ನಡ', flag: 'in' },
  { code: 'km', native: 'ខ្មែរ', flag: 'kh' },
  { code: 'ku', native: 'Kurdî', flag: 'iq' },
  { code: 'ky', native: 'Кыргызча', flag: 'kg' },
  { code: 'lo', native: 'ລາວ', flag: 'la' },
  { code: 'la', native: 'Latina', flag: 'va' },
  { code: 'lv', native: 'Latviešu', flag: 'lv' },
  { code: 'lt', native: 'Lietuvių', flag: 'lt' },
  { code: 'lb', native: 'Lëtzebuergesch', flag: 'lu' },
  { code: 'mk', native: 'Македонски', flag: 'mk' },
  { code: 'mg', native: 'Malagasy', flag: 'mg' },
  { code: 'ms', native: 'Bahasa Melayu', flag: 'my' },
  { code: 'ml', native: 'മലയാളം', flag: 'in' },
  { code: 'mt', native: 'Malti', flag: 'mt' },
  { code: 'mi', native: 'Māori', flag: 'nz' },
  { code: 'mr', native: 'मराठी', flag: 'in' },
  { code: 'mn', native: 'Монгол', flag: 'mn' },
  { code: 'my', native: 'မြန်မာ', flag: 'mm' },
  { code: 'ne', native: 'नेपाली', flag: 'np' },
  { code: 'no', native: 'Norsk', flag: 'no' },
  { code: 'ny', native: 'Chichewa', flag: 'mw' },
  { code: 'ps', native: 'پښتو', flag: 'af' },
  { code: 'fa', native: 'فارسی', flag: 'ir' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', flag: 'in' },
  { code: 'ro', native: 'Română', flag: 'ro' },
  { code: 'sm', native: 'Gagana Samoa', flag: 'ws' },
  { code: 'gd', native: 'Gàidhlig', flag: 'gb-sct' },
  { code: 'sr', native: 'Српски', flag: 'rs' },
  { code: 'st', native: 'Sesotho', flag: 'ls' },
  { code: 'sn', native: 'chiShona', flag: 'zw' },
  { code: 'sd', native: 'سنڌي', flag: 'pk' },
  { code: 'si', native: 'සිංහල', flag: 'lk' },
  { code: 'sk', native: 'Slovenčina', flag: 'sk' },
  { code: 'sl', native: 'Slovenščina', flag: 'si' },
  { code: 'so', native: 'Soomaali', flag: 'so' },
  { code: 'su', native: 'Basa Sunda', flag: 'id' },
  { code: 'sw', native: 'Kiswahili', flag: 'ke' },
  { code: 'sv', native: 'Svenska', flag: 'se' },
  { code: 'tl', native: 'Filipino', flag: 'ph' },
  { code: 'tg', native: 'Тоҷикӣ', flag: 'tj' },
  { code: 'ta', native: 'தமிழ்', flag: 'lk' },
  { code: 'te', native: 'తెలుగు', flag: 'in' },
  { code: 'th', native: 'ไทย', flag: 'th' },
  { code: 'ur', native: 'اردو', flag: 'pk' },
  { code: 'uz', native: 'Oʻzbekcha', flag: 'uz' },
  { code: 'vi', native: 'Tiếng Việt', flag: 'vn' },
  { code: 'cy', native: 'Cymraeg', flag: 'gb-wls' },
  { code: 'xh', native: 'isiXhosa', flag: 'za' },
  { code: 'yi', native: 'ייִדיש', flag: null },
  { code: 'yo', native: 'Yorùbá', flag: 'ng' },
  { code: 'zu', native: 'isiZulu', flag: 'za' }
]

const LATIN = new Set([
  'af',
  'sq',
  'az',
  'eu',
  'bs',
  'ca',
  'ceb',
  'co',
  'hr',
  'cs',
  'da',
  'nl',
  'en',
  'eo',
  'et',
  'fi',
  'fr',
  'fy',
  'gl',
  'de',
  'ht',
  'ha',
  'haw',
  'hmn',
  'hu',
  'is',
  'ig',
  'id',
  'ga',
  'it',
  'jw',
  'ku',
  'la',
  'lv',
  'lt',
  'lb',
  'mg',
  'ms',
  'mt',
  'mi',
  'no',
  'ny',
  'pl',
  'pt',
  'ro',
  'sm',
  'gd',
  'st',
  'sn',
  'sk',
  'sl',
  'so',
  'es',
  'su',
  'sw',
  'sv',
  'tl',
  'tr',
  'uz',
  'vi',
  'cy',
  'xh',
  'yo',
  'zu'
])

export const needsFont = (code: string) => !LATIN.has(code)

export const fontWorks = (backend: string | null, unityVersion: string | null) => !(backend === 'il2cpp' && parseInt(unityVersion || '0', 10) >= 6000)

export const POPULAR = ['ru', 'uk', 'en', 'kk', 'be', 'de', 'es', 'pt', 'tr', 'pl']

const byCode = new Map(LANGUAGES.map(l => [l.code, l]))

export const findLanguage = (code?: string | null) => (code ? byCode.get(code) : undefined)

const displayNames = new Map<string, Intl.DisplayNames>()

export function localName(code: string, ui: string) {
  const fixed = code === 'jw' ? 'jv' : code
  try {
    let names = displayNames.get(ui)
    if (!names) {
      names = new Intl.DisplayNames([ui], { type: 'language' })
      displayNames.set(ui, names)
    }
    const name = names.of(fixed) || code
    return name.charAt(0).toLocaleUpperCase(ui) + name.slice(1)
  } catch {
    return findLanguage(code)?.native || code
  }
}

export function matches(lang: Language, query: string, ui: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [lang.code, lang.native, localName(lang.code, ui), localName(lang.code, 'en')].some(s => s.toLowerCase().includes(q))
}
