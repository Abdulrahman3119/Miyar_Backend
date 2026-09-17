// جدول الحالات ومراحل الدراسة — يصل من `miyar.api.masters` مع أول تحميل، ولا يُكتب هنا.
import { useStore } from './store'
import type { StatusDef, Tone } from './types'

export type { Tone, StatusDef }

const masters = () => useStore.getState().masters

/** تعريف الحالة (STS…) كما تعرّفه المنصة. الرمز المجهول يُعرض كما هو بدل إخفائه. */
export const status = (code: string): StatusDef =>
  masters().statuses.find(s => s.code === code) ?? { code, ar: code, en: code, tone: 'neutral', entity: '' }

export const statusesOf = (entity: string): StatusDef[] => masters().statuses.filter(s => s.entity === entity)

export const useStatus = (code: string): StatusDef =>
  useStore(s => s.masters.statuses.find(x => x.code === code)) ?? { code, ar: code, en: code, tone: 'neutral', entity: '' }

/** مراحل الدراسة الجيوتقنية — تقدّم لا حالة (B.R.166) */
export const studyPhases = () => masters().studyPhases

const toneOf = (list: { code: string; ar: string; tone: Tone }[], code: string) =>
  list.find(x => x.code === code) ?? { code, ar: code, tone: 'neutral' as Tone }

export const boreholeStatus = (code: string) => toneOf(masters().boreholeStatuses, code)
export const labSampleStatus = (code: string) => toneOf(masters().labSampleStatuses, code)
export const quoteStatus = (code: string) => toneOf(masters().quoteStatuses, code)
export const invoiceStatus = (code: string) => toneOf(masters().invoiceStatuses, code)
export const severity = (code: string) => toneOf(masters().auditSeverities, code)

/** مراحل الدراسة — تُقرأ من الخادم في كل رسم. */
export const STUDY_PHASES = {
  map: <T>(fn: (p: { n: number; label: string }, i: number, arr: { n: number; label: string }[]) => T) => studyPhases().map(fn),
  get length() { return studyPhases().length },
  [Symbol.iterator]: function* () { yield* studyPhases() },
}

export const BOREHOLE_STATUS = new Proxy({} as Record<string, { code: string; ar: string; tone: Tone }>, {
  get: (_, k) => boreholeStatus(String(k)),
})
