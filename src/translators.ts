export type KeyField = 'deepl' | 'yandex' | 'baiduId' | 'baiduSecret'

const list = (codes: string) => codes.split(' ')

export interface Translator {
  id: string
  name: string
  keys: KeyField[]
  languages?: string[]
}

export const TRANSLATORS: Translator[] = [
  { id: 'GoogleTranslateV2', name: 'Google', keys: [] },
  { id: 'GoogleTranslate', name: 'Google Classic', keys: [] },
  {
    id: 'BingTranslate',
    name: 'Bing',
    keys: [],
    languages: list(
      'af ar bn bs bg ca zh-CN zh-TW hr cs da nl en et fi fr de el ht he hi hu is id it ja sw ko lv lt mg ms mt no fa pl pt ro ru sm sr sk sl es sv ta te th tr uk ur vi cy'
    )
  },
  {
    id: 'DeepLTranslate',
    name: 'DeepL',
    keys: [],
    languages: list('ar bg cs da de el en es et fi fr hu id it ja ko lt lv no nl pl pt ro ru sk sl sv tr uk zh-CN')
  },
  {
    id: 'DeepLTranslateLegitimate',
    name: 'DeepL API',
    keys: ['deepl'],
    languages: list('ar bg cs da de el en es et fi fr hu id it ja ko lt lv no nl pl pt ro ru sk sl sv tr uk zh-CN')
  },
  {
    id: 'PapagoTranslate',
    name: 'Papago',
    keys: [],
    languages: list('en ko zh-CN zh-TW es fr ru vi th id de ja hi pt')
  },
  {
    id: 'YandexTranslate',
    name: 'Yandex',
    keys: ['yandex'],
    languages: list(
      'az sq am en ar hy af eu be bn my bg bs cy hu vi ht gl nl el ka gu da he yi id ga it is es kk kn ca ky zh-CN ko xh km lo la lv lt lb mg ms ml mt mk mi mr mn de ne no pa fa pl pt ro ru ceb sr si sk sl sw su tg th tl ta te tr uz uk ur fi fr hi hr cs sv gd et eo jw ja'
    )
  },
  { id: 'BaiduTranslate', name: 'Baidu', keys: ['baiduId', 'baiduSecret'] }
]

export const findTranslator = (id: string) => TRANSLATORS.find(t => t.id === id) || TRANSLATORS[0]

export function supports(id: string, ...codes: string[]) {
  const t = findTranslator(id)
  return !t.languages || codes.every(c => t.languages!.includes(c))
}
