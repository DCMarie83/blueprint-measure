import { useEffect, useState } from 'react'
import i18n, { setLanguage, SUPPORTED } from '../lib/i18n'
import styles from './LanguageToggle.module.css'

// Segmented EN | ES control on brand tokens, sized for a header utility slot.
//
// Reads NO React context on purpose: it talks straight to the i18n instance, so
// it is safe to mount on public pages that live OUTSIDE every app provider
// (login, signup, portal, crew link, checkout). It only calls setLanguage().
//
// onPersist(lang) is optional and fires AFTER the local apply — callers that
// also need to persist the choice to a profile pass it; public mounts do not,
// so they never write anyone's record.
export default function LanguageToggle({ onPersist, className = '' }) {
  const [current, setCurrent] = useState(i18n.language)

  useEffect(() => {
    const onChange = (lng) => setCurrent(lng)
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [])

  const active = SUPPORTED.includes(current) ? current : 'en'
  const ariaLabel = i18n.t('common:languageToggle.ariaLabel', { defaultValue: 'Language' })

  async function pick(lang) {
    if (lang === active) return
    await setLanguage(lang)
    if (onPersist) onPersist(lang)
  }

  return (
    <div className={`${styles.toggle} ${className}`} role="group" aria-label={ariaLabel}>
      {SUPPORTED.map((lang) => (
        <button
          key={lang}
          type="button"
          className={`${styles.segment} ${active === lang ? styles.segmentActive : ''}`}
          aria-pressed={active === lang}
          onClick={() => pick(lang)}
        >
          {i18n.t(`common:languageToggle.${lang}`, { defaultValue: lang.toUpperCase() })}
        </button>
      ))}
    </div>
  )
}
