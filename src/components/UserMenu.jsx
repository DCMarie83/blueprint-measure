import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import styles from './UserMenu.module.css'

export default function UserMenu() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (!user) return null

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(v => !v)}>
        <span className={styles.avatar}>{(user.email?.[0] ?? '?').toUpperCase()}</span>
      </button>
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.email}>{user.email}</div>
          <button className={styles.menuItem} onClick={() => { navigate('/account'); setOpen(false) }}>My Account</button>
          <button className={styles.menuItem} onClick={handleSignOut}>Sign Out</button>
        </div>
      )}
    </div>
  )
}
