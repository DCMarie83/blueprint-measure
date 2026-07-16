import { useEffect } from 'react'

// Shared signal so the floating "Send Feedback" FAB can hide while any bottom
// sheet or modal is open — otherwise it floats over the sheet's own action
// buttons (Confirm / Create invoice / etc.). Ref-counted so stacked or
// overlapping overlays keep the FAB hidden until the LAST one closes.
//
// The signal is a single body attribute (`data-sheet-open`) read purely from
// CSS in FeedbackButton.module.css — no React subscription, no re-render.
// Call this from any component that renders an overlay, passing whether it is
// currently open (the shared Modal component passes `true`, since it only
// mounts while open).
const BODY_ATTR = 'data-sheet-open'
let openCount = 0

export function useSheetSignal(open) {
  useEffect(() => {
    if (!open) return
    openCount += 1
    document.body.setAttribute(BODY_ATTR, '')
    return () => {
      openCount = Math.max(0, openCount - 1)
      if (openCount === 0) document.body.removeAttribute(BODY_ATTR)
    }
  }, [open])
}
