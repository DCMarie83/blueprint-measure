import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSheetSignal } from '../../hooks/useSheetSignal'
import styles from './Modal.module.css'

// Footer slot of the nearest Modal. `undefined` = not inside a Modal;
// `null` = inside one whose slot has not mounted yet.
const ModalFooterContext = createContext(undefined)

// Renders its children (action buttons) into the enclosing Modal's pinned
// footer, which sits outside the scrolling body so the actions stay visible
// however long the content gets. Outside a Modal it falls back to an inline
// action row.
export function ModalFooter({ children }) {
  const slot = useContext(ModalFooterContext)
  if (slot === undefined) return <div className={styles.footerInline}>{children}</div>
  if (slot === null) return null
  return createPortal(children, slot)
}

// A reusable modal dialog. Pass `onClose` to handle clicking the backdrop or X button.
// The dialog is capped to the viewport: the header and footer stay put and the
// body is the vertical scroll region. Children place actions in the footer by
// wrapping them in <ModalFooter>.
export default function Modal({ title, onClose, children }) {
  const { t } = useTranslation()
  // Only mounted while open, so signal the FAB to hide for its whole lifetime.
  useSheetSignal(true)

  const bodyRef = useRef(null)
  const [footerEl, setFooterEl] = useState(null)
  const [overflowing, setOverflowing] = useState(false)

  // Close on Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Track whether the body actually scrolls so the footer divider only shows
  // then; short content renders exactly as it did before the footer existed.
  useEffect(() => {
    const body = bodyRef.current
    if (!body || typeof ResizeObserver === 'undefined') return
    const measure = () => setOverflowing(body.scrollHeight > body.clientHeight + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    measure()
    return () => observer.disconnect()
  }, [])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label={t('common:action.close')}>✕</button>
        </div>
        <ModalFooterContext.Provider value={footerEl}>
          <div ref={bodyRef} className={styles.body}>{children}</div>
        </ModalFooterContext.Provider>
        <div
          ref={setFooterEl}
          className={`${styles.footer} ${overflowing ? styles.footerDivided : ''}`}
        />
      </div>
    </div>
  )
}
