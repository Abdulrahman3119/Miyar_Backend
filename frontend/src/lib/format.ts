const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

export const fmtDate = (iso?: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
export const fmtTime = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const h = d.getHours(); const m = d.getMinutes().toString().padStart(2, '0')
  const ap = h >= 12 ? 'م' : 'ص'
  return `${((h + 11) % 12) + 1}:${m} ${ap}`
}
/** Compact day/month, e.g. 9/9 */
export const fmtShort = (iso?: string) => (iso ? `${new Date(iso).getDate()}/${new Date(iso).getMonth() + 1}` : '—')
export const fmtDateTime = (iso?: string) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—')
export const fmtSAR = (n?: number) => (n == null ? '—' : `${n.toLocaleString('en-US')} ر.س`)
export const fmtSlot = (s?: { date: string; from: string; to: string }) =>
  s ? `${fmtDate(s.date)} — ${s.from} إلى ${s.to}` : '—'

export const hoursLeft = (iso?: string) => {
  if (!iso) return null
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 36e5))
}
export const daysLeft = (iso?: string) => {
  const h = hoursLeft(iso); return h == null ? null : Math.ceil(h / 24)
}
export const remainingLabel = (iso?: string) => {
  const h = hoursLeft(iso)
  if (h == null) return '—'
  if (h === 0) return 'انتهت المهلة'
  if (h < 48) return `متبقٍ ${h} ساعة`
  return `متبقٍ ${Math.ceil(h / 24)} أيام`
}
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4)
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.round(m / 60); if (h < 24) return `منذ ${h} ساعة`
  return `منذ ${Math.round(h / 24)} يوم`
}
export const isoIn = (hours: number, from = Date.now()) => new Date(from + hours * 36e5).toISOString()
export const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 8)}`
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(s => (s.startsWith('ال') && s.length > 2 ? s[2] : s[0])).join('')
