function matchField(spec: string, val: number, fieldMin: number): boolean {
  for (const part of spec.split(',')) {
    if (part === '') continue
    if (part === '*') return true
    if (part.startsWith('*/')) {
      const step = Number(part.slice(2))
      if (Number.isInteger(step) && step > 0 && val >= fieldMin && (val - fieldMin) % step === 0) return true
      continue
    }
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      if (Number.isFinite(a) && Number.isFinite(b) && val >= a && val <= b) return true
      continue
    }
    if (Number(part) === val) return true
  }
  return false
}

export function cronMatches(expr: string, d: Date): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [min, hour, dom, mon, dow] = fields
  return (
    matchField(min, d.getMinutes(), 0) &&
    matchField(hour, d.getHours(), 0) &&
    matchField(dom, d.getDate(), 1) &&
    matchField(mon, d.getMonth() + 1, 1) &&
    matchField(dow, d.getDay(), 0)
  )
}
