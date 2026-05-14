import styles from './ToolGroup.module.css'

export default function ToolGroup({ children }) {
  return (
    <div className={styles.group}>
      {children}
    </div>
  )
}
