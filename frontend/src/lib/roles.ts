// الأدوار والصلاحيات — مصفوفة الملحق 7.1 محفوظة في `miyar.ui` وتصل مع الجلسة.
import { useStore } from './store'
import type { Permission, Role } from './types'

export type { Permission }

const masters = () => useStore.getState().masters

export const roleLabel = (role: Role | string): string =>
  masters().roleLabels.find(r => r.code === role)?.ar ?? String(role)

export const positionLabel = (position: string): string =>
  masters().positionLabels.find(p => p.code === position)?.ar ?? position

/** صلاحيات دور/موقع بعينه — تُستخدم لعرض المصفوفة كاملة في الحوكمة. */
export const permissionsOf = (role: string, position: string): string[] =>
  masters().permissionMatrix[`${role}:${position}`] ?? []

export const can = (role: string, position: string, p: Permission) => permissionsOf(role, position).includes(p)

/** صفوف وأعمدة المصفوفة كما تُطبع في شاشة الحوكمة. */
export const matrixRows = () => masters().permissionRows
export const matrixCols = () => masters().permissionColumns

const liveMap = (rows: () => { code: string; ar: string }[]) =>
  new Proxy({} as Record<string, string>, {
    get: (_, k) => rows().find(r => r.code === String(k))?.ar ?? String(k),
    ownKeys: () => rows().map(r => r.code),
    getOwnPropertyDescriptor: (_, k) => {
      const v = rows().find(r => r.code === String(k))?.ar
      return v === undefined ? undefined : { enumerable: true, configurable: true, value: v }
    },
  })

/** تسميات الأدوار كما تصل من الخادم — تُستخدم كخريطة `ROLE_LABEL[role]`. */
export const ROLE_LABEL = liveMap(() => masters().roleLabels)
export const POSITION_LABEL = liveMap(() => masters().positionLabels)
export const MATRIX_ROWS = { map: <T>(fn: (row: { p: Permission; key: string; label: string }, i: number) => T) => matrixRows().map((r, i) => fn({ ...r, p: r.key as Permission }, i)) }
export const MATRIX_COLS = { map: <T>(fn: (col: { key: string; label: string }, i: number) => T) => matrixCols().map(fn), [Symbol.iterator]: function* () { yield* matrixCols() } }
