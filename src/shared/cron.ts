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
  const day = d.getDay()
  // Alguns dialetos de cron aceitam 7 como domingo alternativo (0 e 7 == domingo).
  // Normal: casa via getDay() diretamente. Alternativo: só quando o dia atual já É domingo
  // (day===0), também casa se o campo contém "7" — não faz "7" casar outros dias.
  const dowMatches = matchField(dow, day, 0) || (day === 0 && matchField(dow, 7, 0))
  return (
    matchField(min, d.getMinutes(), 0) &&
    matchField(hour, d.getHours(), 0) &&
    matchField(dom, d.getDate(), 1) &&
    matchField(mon, d.getMonth() + 1, 1) &&
    dowMatches
  )
}
