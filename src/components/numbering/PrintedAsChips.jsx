import { useTranslation } from 'react-i18next'
import { parsePrintedAs } from '../../data/numbering'

// Small chip(s) beside a document number when its notes carry the number it
// was printed under before "Assign next number" replaced it.
export default function PrintedAsChips({ notes }) {
  const { t } = useTranslation()
  return parsePrintedAs(notes).map((number, i) => (
    <span
      key={`${number}-${i}`}
      style={{ padding: '2px 10px', borderRadius: 'var(--radius-pill, 9999px)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap' }}
    >
      {t('shared:numbering.printedAs', { number })}
    </span>
  ))
}
