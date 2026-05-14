import { useState, useRef } from 'react'
import styles from './IconButton.module.css'

export default function IconButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  size = 18,
  className,
  children,
  ...rest
}) {
  const [showTip, setShowTip] = useState(false)
  const timeout = useRef(null)

  function handleEnter() {
    timeout.current = setTimeout(() => setShowTip(true), 200)
  }
  function handleLeave() {
    clearTimeout(timeout.current)
    setShowTip(false)
  }

  return (
    <button
      type="button"
      className={[
        styles.btn,
        active && styles.active,
        disabled && styles.disabled,
        className,
      ].filter(Boolean).join(' ')}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      {...rest}
    >
      {Icon && <Icon size={size} />}
      {children}
      {label && showTip && (
        <span className={styles.tooltip}>{label}</span>
      )}
    </button>
  )
}
