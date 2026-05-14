import { useState, useCallback, useMemo } from 'react'
import { parseFeetInches } from '../../utils/fractions'
import styles from './Calculator.module.css'

const MODES = ['Standard', 'SF (L×W)', 'Markup %']

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function evaluate(a, op, b) {
  const x = parseFloat(a) || 0
  const y = parseFloat(b) || 0
  switch (op) {
    case '+': return x + y
    case '−': return x - y
    case '×': return x * y
    case '÷': return y !== 0 ? x / y : 0
    default: return y
  }
}

export default function Calculator({ unitSystem = 'imperial' }) {
  const [mode, setMode] = useState('Standard')

  // Standard calc state
  const [display, setDisplay] = useState('0')
  const [prev, setPrev] = useState(null)
  const [op, setOp] = useState(null)
  const [fresh, setFresh] = useState(true) // next digit replaces display

  // SF mode state
  const [sfLength, setSfLength] = useState('')
  const [sfWidth, setSfWidth] = useState('')

  // Markup mode state
  const [cost, setCost] = useState('')
  const [markup, setMarkup] = useState('')

  const handleDigit = useCallback((d) => {
    setDisplay(v => {
      if (fresh) return d === '.' ? '0.' : d
      if (d === '.' && v.includes('.')) return v
      return v + d
    })
    setFresh(false)
  }, [fresh])

  const handleOp = useCallback((nextOp) => {
    if (prev !== null && op && !fresh) {
      const result = evaluate(prev, op, display)
      const str = String(parseFloat(result.toFixed(10)))
      setDisplay(str)
      setPrev(str)
    } else {
      setPrev(display)
    }
    setOp(nextOp)
    setFresh(true)
  }, [prev, op, display, fresh])

  const handleEquals = useCallback(() => {
    if (prev === null || !op) return
    const result = evaluate(prev, op, display)
    const str = String(parseFloat(result.toFixed(10)))
    setDisplay(str)
    setPrev(null)
    setOp(null)
    setFresh(true)
  }, [prev, op, display])

  const handleClear = useCallback(() => {
    setDisplay('0')
    setPrev(null)
    setOp(null)
    setFresh(true)
  }, [])

  const handleBackspace = useCallback(() => {
    setDisplay(v => v.length > 1 ? v.slice(0, -1) : '0')
    setFresh(false)
  }, [])

  // SF mode — parse based on unit system
  const isMetric = unitSystem === 'metric'
  const parsedLength = useMemo(() => {
    if (!sfLength) return null
    const v = isMetric ? parseFloat(sfLength) : parseFeetInches(sfLength)
    return v && v > 0 ? v : null
  }, [sfLength, isMetric])
  const parsedWidth = useMemo(() => {
    if (!sfWidth) return null
    const v = isMetric ? parseFloat(sfWidth) : parseFeetInches(sfWidth)
    return v && v > 0 ? v : null
  }, [sfWidth, isMetric])
  const sfResult = parsedLength && parsedWidth ? parsedLength * parsedWidth : null

  // Markup mode
  const markupResult = (parseFloat(cost) || 0) * (1 + (parseFloat(markup) || 0) / 100)

  return (
    <div className={styles.calc} onClick={e => e.stopPropagation()}>
      {/* Mode tabs */}
      <div className={styles.tabs}>
        {MODES.map(m => (
          <button
            key={m}
            className={`${styles.tab} ${mode === m ? styles.tabActive : ''}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'Standard' && (
        <div className={styles.standard}>
          <div className={styles.display}>{display}</div>
          <div className={styles.grid}>
            <button className={styles.fnBtn} onClick={handleClear}>C</button>
            <button className={styles.fnBtn} onClick={handleBackspace}>⌫</button>
            <button className={styles.opBtn} onClick={() => handleOp('÷')}>÷</button>
            <button className={styles.opBtn} onClick={() => handleOp('×')}>×</button>

            {['7','8','9'].map(d => <button key={d} className={styles.numBtn} onClick={() => handleDigit(d)}>{d}</button>)}
            <button className={styles.opBtn} onClick={() => handleOp('−')}>−</button>

            {['4','5','6'].map(d => <button key={d} className={styles.numBtn} onClick={() => handleDigit(d)}>{d}</button>)}
            <button className={styles.opBtn} onClick={() => handleOp('+')}>+</button>

            {['1','2','3'].map(d => <button key={d} className={styles.numBtn} onClick={() => handleDigit(d)}>{d}</button>)}
            <button className={styles.eqBtn} onClick={handleEquals}>=</button>

            <button className={`${styles.numBtn} ${styles.zeroBtn}`} onClick={() => handleDigit('0')}>0</button>
            <button className={styles.numBtn} onClick={() => handleDigit('.')}>.</button>
            <button className={styles.copyBtn} onClick={() => copyToClipboard(display)}>Copy</button>
          </div>
        </div>
      )}

      {mode === 'SF (L×W)' && (
        <div className={styles.formMode}>
          <label className={styles.fieldLabel}>{isMetric ? 'Length (m)' : 'Length (ft + in)'}</label>
          <input
            className={styles.fieldInput}
            type="text"
            value={sfLength}
            onChange={e => setSfLength(e.target.value)}
            placeholder={isMetric ? '3.8' : '12\'6"'}
          />
          {parsedLength !== null && (
            <span className={styles.parsedHint}>→ {parsedLength.toFixed(2)} {isMetric ? 'm' : 'ft'}</span>
          )}
          <label className={styles.fieldLabel}>{isMetric ? 'Width (m)' : 'Width (ft + in)'}</label>
          <input
            className={styles.fieldInput}
            type="text"
            value={sfWidth}
            onChange={e => setSfWidth(e.target.value)}
            placeholder={isMetric ? '2.5' : '10\'3"'}
          />
          {parsedWidth !== null && (
            <span className={styles.parsedHint}>→ {parsedWidth.toFixed(2)} {isMetric ? 'm' : 'ft'}</span>
          )}
          {sfResult !== null && (
            <>
              <div className={styles.formResult}>
                = {sfResult.toLocaleString('en-US', { maximumFractionDigits: 2 })} {isMetric ? 'm²' : 'sq ft'}
              </div>
              <button className={styles.formCopy} onClick={() => copyToClipboard(sfResult.toFixed(2))}>
                Copy result
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'Markup %' && (
        <div className={styles.formMode}>
          <label className={styles.fieldLabel}>Cost $</label>
          <input
            className={styles.fieldInput}
            type="number"
            min="0"
            step="any"
            value={cost}
            onChange={e => setCost(e.target.value)}
            placeholder="0.00"
          />
          <label className={styles.fieldLabel}>Markup %</label>
          <input
            className={styles.fieldInput}
            type="number"
            min="0"
            step="any"
            value={markup}
            onChange={e => setMarkup(e.target.value)}
            placeholder="0"
          />
          <div className={styles.formResult}>
            = $ {markupResult.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <button className={styles.formCopy} onClick={() => copyToClipboard(markupResult.toFixed(2))}>
            Copy result
          </button>
        </div>
      )}
    </div>
  )
}
