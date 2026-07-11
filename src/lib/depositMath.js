export function calculateDepositPercent(depositAmount, referenceTotal) {
  const dep = Number(depositAmount || 0)
  const total = Number(referenceTotal || 0)
  if (dep <= 0 || total <= 0) return null
  return Math.round((dep / total) * 100)
}

export function getReferenceTotal(estimate) {
  const variantKey = estimate?.accepted_variant || estimate?.selected_variant || 'good'
  return Number(estimate?.[`${variantKey}_total`] || 0)
}
