import s from './try.module.css'

// Suspense fallback for the lazy /try chunk. Branded, minimal.
export default function TryLoading() {
  return (
    <div className={s.loading}>
      <div className={s.loadingMark}>RivetDog</div>
      <div className={s.spinner} role="status" aria-label="Loading" />
    </div>
  )
}
