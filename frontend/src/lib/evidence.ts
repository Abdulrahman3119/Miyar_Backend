/** طبقة الأدلة — تُقرأ من المتجر (الخادم) لا من ثوابت محلية. */
export type { Photo, Equipment, ArchivedSample, CustodyEvent, MethodSheet, PhotoKind } from './types'
export { photosFor, methodFor, photoById, equipmentById, sampleStatusSteps } from './store'
import { useStore, photosFor, methodFor, sampleStatusSteps } from './store'
import type { Photo, Equipment, ArchivedSample, MethodSheet } from './types'

const live = <T>(sel: () => T[]): T[] => sel()

/** أسماء قديمة للشاشات التي كانت تستورد القوائم كثوابت. */
export const SAMPLES = new Proxy([] as ArchivedSample[], {
  get: (_, prop) => {
    const arr = useStore.getState().samples
    const v = (arr as unknown as Record<string | symbol, unknown>)[prop]
    return typeof v === 'function' ? (v as Function).bind(arr) : v
  },
})
export const PHOTOS = new Proxy([] as Photo[], {
  get: (_, prop) => {
    const arr = useStore.getState().photos
    const v = (arr as unknown as Record<string | symbol, unknown>)[prop]
    return typeof v === 'function' ? (v as Function).bind(arr) : v
  },
})
export const EQUIPMENT = new Proxy([] as Equipment[], {
  get: (_, prop) => {
    const arr = useStore.getState().equipment
    const v = (arr as unknown as Record<string | symbol, unknown>)[prop]
    return typeof v === 'function' ? (v as Function).bind(arr) : v
  },
})
export const METHODS = new Proxy([] as MethodSheet[], {
  get: (_, prop) => {
    const arr = useStore.getState().methods
    const v = (arr as unknown as Record<string | symbol, unknown>)[prop]
    return typeof v === 'function' ? (v as Function).bind(arr) : v
  },
})
export const SAMPLE_STEPS = new Proxy([] as string[], {
  get: (_, prop) => {
    const arr = sampleStatusSteps()
    const v = (arr as unknown as Record<string | symbol, unknown>)[prop]
    return typeof v === 'function' ? (v as Function).bind(arr) : v
  },
})

void live
void photosFor
void methodFor
