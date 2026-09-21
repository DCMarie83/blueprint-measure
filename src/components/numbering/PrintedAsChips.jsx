import { useTranslation } from 'react-i18next'
import { parsePrintedAs } from '../../data/numbering'

// Small chip(s) beside a document number when its notes carry the number it
// was printed under before "Assign next number" replaced it. `only` narrows
// to one printed number (the one a search matched).
export default function PrintedAsChips({ notes, only = null }) {
  const { t } = useTranslation()
  const numbers = parsePrintedAs(notes).filter(n => only == null || n === only)
  return numbers.map((number, i) => (
    <span
      key={`${number}-${i}`}
      style={{ padding: '2px 10px', borderRadius: 'var(--radius-pill, 9999px)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap' }}
    >
      {t('shared:numbering.printedAs', { number })}
    </span>
  ))
}
