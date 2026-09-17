// توافق مع الشاشات التي كانت تستورد الثوابت من `@/lib/mock` — القيم كلها من الخادم.
import { useStore, categoryLabel, cityCoord } from './store'

export { categoryLabel, cityCoord }

export const CATEGORY_LABEL = new Proxy({} as Record<string, string>, {
  get: (_, k) => categoryLabel(String(k)),
  ownKeys: () => useStore.getState().masters.categories.map(c => c.code),
  getOwnPropertyDescriptor: (_, k) => {
    const v = categoryLabel(String(k))
    return { enumerable: true, configurable: true, value: v }
  },
})

export const CITY_COORD = new Proxy({} as Record<string, [number, number]>, {
  get: (_, k) => cityCoord(String(k)),
  ownKeys: () => useStore.getState().masters.cities.filter(c => c.lat != null && c.lng != null).map(c => c.name),
  getOwnPropertyDescriptor: (_, k) => {
    const v = cityCoord(String(k))
    return v ? { enumerable: true, configurable: true, value: v } : undefined
  },
})
