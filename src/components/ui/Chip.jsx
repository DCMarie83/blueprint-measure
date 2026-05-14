import styles from './Chip.module.css'

export default function Chip({ variant = 'neutral', size = 'sm', className = '', children }) {
  const variantClass = styles[variant] || styles.neutral
  const sizeClass = styles[size] || styles.sm
  return (
    <span className={`${styles.chip} ${variantClass} ${sizeClass} ${className}`}>
      {children}
    </span>
  )
}
