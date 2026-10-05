import { ReactNode, useEffect, useMemo, useState } from 'react'
import { IconBrandGithub, IconCheck, IconDeviceDesktop, IconSparkles, IconTrash } from '@tabler/icons-react'
import { Accent, api, Keys, Settings } from '../api'
import { Key, useI18n } from '../i18n'
import { LANGUAGES, localName } from '../languages'
import { TRANSLATORS, findTranslator, KeyField } from '../translators'
import { Flag } from './Flag'
import { Select } from './Select'
import { Switch } from './Switch'

export const REPO_URL = 'https://github.com/Ra9ge/Game-language-changer'

const FONTS = ['', 'Arial', 'Segoe UI', 'Tahoma', 'Verdana', 'Calibri', 'Georgia', 'Times New Roman', 'Trebuchet MS']
const ACCENTS: Accent[] = ['red', 'violet', 'blue', 'green', 'orange', 'pink']
const HOTKEYS: [string, Key][] = [
  ['Alt + T', 'hotkey.t'],
  ['Alt + R', 'hotkey.r'],
  ['Alt + U', 'hotkey.u'],
  ['Alt + F', 'hotkey.f'],
  ['Alt + 0', 'hotkey.0'],
  ['Alt + Q', 'hotkey.q']
]
const KEY_LABELS: Record<KeyField, Key> = {
  deepl: 'settings.deepl',
  yandex: 'settings.yandex',
  baiduId: 'settings.baiduId',
  baiduSecret: 'settings.baiduSecret'
}

function Row({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-title">{title}</div>
        {text && <div className="setting-sub">{text}</div>}
      </div>
      {children}
    </div>
  )
}

const formatSize = (bytes: number, lang: string) => {
  const en = lang === 'en'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${en ? 'KB' : 'КБ'}`
  return `${(bytes / 1024 / 1024).toFixed(1)} ${en ? 'MB' : 'МБ'}`
}

interface Props {
  settings: Settings
  version: string
  acrylic: boolean
  onChange: (next: Partial<Settings>) => void
  onToast: (title: string) => void
}

export function SettingsView({ settings, version, acrylic, onChange, onToast }: Props) {
  const { t, lang } = useI18n()
  const [cache, setCache] = useState<number | null>(null)
  const translator = findTranslator(settings.endpoint)

  useEffect(() => {
    api.cache.size().then(setCache)
  }, [])

  const languageOptions = useMemo(
    () => [
      {
        value: 'auto',
        label: t('autoDetect'),
        icon: (
          <span className="flag flag-empty">
            <IconSparkles size={11} />
          </span>
        )
      },
      ...LANGUAGES.map(l => ({ value: l.code, label: localName(l.code, lang), hint: l.native, search: l.native, icon: <Flag code={l.code} /> }))
    ],
    [lang, t]
  )

  const setKey = (field: keyof Keys, value: string) => onChange({ keys: { ...settings.keys, [field]: value } })
  const toggle = (field: keyof Settings, title: Key, text: Key) => (
    <Row title={t(title)} text={t(text)}>
      <Switch label={t(title)} checked={Boolean(settings[field])} onChange={value => onChange({ [field]: value })} />
    </Row>
  )

  return (
    <div className="settings">
      <div className="settings-column">
        <section className="panel">
          <h2>{t('settings.translation')}</h2>
          <Row title={t('settings.translator')} text={translator.keys.length ? t('settings.translator.key') : t('settings.translator.free')}>
            <Select
              value={settings.endpoint}
              align="right"
              options={TRANSLATORS.map(tr => ({ value: tr.id, label: tr.name, hint: tr.keys.length ? 'API' : undefined }))}
              onChange={endpoint => onChange({ endpoint })}
            />
          </Row>
          {translator.keys.map(field => (
            <Row key={field} title={t(KEY_LABELS[field])}>
              <input
                className="text-input"
                type="password"
                spellCheck={false}
                placeholder={t('settings.keyPlaceholder')}
                value={settings.keys[field]}
                onChange={e => setKey(field, e.target.value)}
              />
            </Row>
          ))}
          {toggle('pretranslate', 'settings.pretranslate', 'settings.pretranslate.text')}
          <Row title={t('settings.source')} text={t('settings.source.text')}>
            <Select
              value={settings.sourceLang}
              align="right"
              searchable
              searchPlaceholder={t('searchLanguage')}
              options={languageOptions}
              onChange={sourceLang => onChange({ sourceLang })}
            />
          </Row>
          <Row title={t('settings.maxChars')} text={t('settings.maxChars.text')}>
            <Select
              value={String(settings.maxChars)}
              align="right"
              options={['500', '1000', '1500', '2500'].map(v => ({ value: v, label: v }))}
              onChange={v => onChange({ maxChars: Number(v) })}
            />
          </Row>
        </section>

        <section className="panel">
          <h2>{t('settings.fonts')}</h2>
          {toggle('fontFix', 'settings.fontFix', 'settings.fontFix.text')}
          <Row title={t('settings.uguiFont')} text={t('settings.uguiFont.text')}>
            <Select
              value={settings.uguiFont}
              align="right"
              options={FONTS.map(f => ({ value: f, label: f || t('settings.uguiFont.default') }))}
              onChange={uguiFont => onChange({ uguiFont })}
            />
          </Row>
        </section>

        <section className="panel">
          <h2>{t('settings.extra')}</h2>
          {toggle('textures', 'settings.textures', 'settings.textures.text')}
          {toggle('console', 'settings.console', 'settings.console.text')}
          {toggle('latest', 'settings.latest', 'settings.latest.text')}
          {toggle('keepTranslations', 'settings.keep', 'settings.keep.text')}
        </section>
      </div>

      <div className="settings-column">
        <section className="panel">
          <h2>{t('settings.appearance')}</h2>
          <Row title={t('settings.accent')} text={t('settings.accent.text')}>
            <div className="swatches">
              {ACCENTS.map(accent => (
                <button
                  type="button"
                  key={accent}
                  className={`swatch swatch-${accent}`}
                  aria-label={accent}
                  aria-pressed={settings.accent === accent}
                  onClick={() => onChange({ accent })}
                >
                  {settings.accent === accent && <IconCheck size={13} stroke={3} />}
                </button>
              ))}
            </div>
          </Row>
          {acrylic && toggle('transparency', 'settings.transparency', 'settings.transparency.text')}
        </section>

        <section className="panel">
          <h2>{t('settings.launch')}</h2>
          {toggle('askShortcut', 'settings.askShortcut', 'settings.askShortcut.text')}
          {toggle('minimizeOnLaunch', 'settings.minimize', 'settings.minimize.text')}
          {toggle('watchLaunch', 'settings.watch', 'settings.watch.text')}
        </section>

        <section className="panel">
          <h2>{t('settings.hotkeys')}</h2>
          <div className="hotkeys">
            {HOTKEYS.map(([combo, label]) => (
              <div className="hotkey" key={combo}>
                <kbd>{combo}</kbd>
                <span>{t(label)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>{t('settings.app')}</h2>
          <Row title={t('settings.uiLang')} text={t('settings.uiLang.text')}>
            <Select
              value={settings.uiLang}
              align="right"
              options={[
                {
                  value: 'system',
                  label: t('settings.uiLang.system'),
                  icon: (
                    <span className="flag flag-empty">
                      <IconDeviceDesktop size={11} />
                    </span>
                  )
                },
                { value: 'ru', label: 'Русский', icon: <Flag code="ru" /> },
                { value: 'uk', label: 'Українська', icon: <Flag code="uk" /> },
                { value: 'en', label: 'English', icon: <Flag code="en" /> }
              ]}
              onChange={uiLang => onChange({ uiLang: uiLang as Settings['uiLang'] })}
            />
          </Row>
          <Row title={t('settings.cache')} text={cache === null ? '…' : formatSize(cache, lang)}>
            <button
              type="button"
              className="button small"
              onClick={async () => {
                await api.cache.clear()
                setCache(0)
                onToast(t('toast.cacheCleared'))
              }}
            >
              <IconTrash size={15} />
              {t('settings.cache.clear')}
            </button>
          </Row>
          <Row title={t('settings.about')} text={t('settings.version', { v: version })}>
            <button type="button" className="button small" onClick={() => api.app.openUrl(REPO_URL)}>
              <IconBrandGithub size={15} />
              GitHub
            </button>
          </Row>
        </section>
      </div>
    </div>
  )
}
