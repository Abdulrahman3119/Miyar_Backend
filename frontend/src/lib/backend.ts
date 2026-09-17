/* ─────────────────────────────────────────────────────────────
   Frappe backend (تطبيق miyar) — عنوان الخادم يُحفظ محلياً من الإعدادات.
   الواجهة لا تعمل بدون عنوان: كل القراءة والكتابة تمر عبر /api/method/miyar.api.*
   ───────────────────────────────────────────────────────────── */

const URL_KEY = 'miyar.backend.url'
const SITE_KEY = 'miyar.backend.site'
const TOKEN_KEY = 'miyar.backend.token'
const CSRF_KEY = 'miyar.backend.csrf'

export interface BackendConfig { url: string; site: string; token: string }

const clean = (v: string) => v.trim().replace(/\/+$/, '')

/** Same-origin when the SPA is served from Frappe (/miyar or /assets/miyar/frontend). */
const embeddedOrigin = (): string => {
  try {
    if (typeof window === 'undefined') return ''
    const path = window.location.pathname || ''
    if (path === '/miyar' || path.startsWith('/miyar/') || path.startsWith('/assets/miyar/frontend')) {
      return clean(window.location.origin)
    }
    if ((window as unknown as { __MIYAR_EMBEDDED__?: boolean }).__MIYAR_EMBEDDED__) {
      return clean(window.location.origin)
    }
  } catch { /* ignore */ }
  return ''
}

export const getBackend = (): BackendConfig => {
  try {
    const embedded = embeddedOrigin()
    // When served from Frappe (/miyar), always use same-origin — ignore a stale Vite URL.
    const saved = embedded ? '' : clean(localStorage.getItem(URL_KEY) ?? '')
    return {
      url: embedded || saved,
      site: (localStorage.getItem(SITE_KEY) ?? '').trim(),
      token: localStorage.getItem(TOKEN_KEY) ?? '',
    }
  } catch { return { url: embeddedOrigin(), site: '', token: '' } }
}

export const isLive = () => getBackend().url.length > 0
export const isEmbedded = () => embeddedOrigin().length > 0

/** Prefer cookie session when the SPA shares origin with Frappe Desk. */
export const prefersCookieSession = () =>
  isEmbedded()
  || (typeof window !== 'undefined' && !!(window as unknown as { __MIYAR_LOGGED_IN__?: number }).__MIYAR_LOGGED_IN__)
  || (typeof document !== 'undefined' && /(?:^|; )sid=/.test(document.cookie))

export const setBackendUrl = (url: string, site = '') => {
  try {
    const u = clean(url)
    if (u) localStorage.setItem(URL_KEY, u); else localStorage.removeItem(URL_KEY)
    if (site.trim()) localStorage.setItem(SITE_KEY, site.trim()); else localStorage.removeItem(SITE_KEY)
  } catch {}
}

export const setToken = (token: string) => { try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY) } catch {} }
export const clearToken = () => setToken('')

export const setCsrf = (token: string) => {
  try {
    if (token) {
      localStorage.setItem(CSRF_KEY, token)
      ;(window as unknown as { csrf_token?: string }).csrf_token = token
    } else localStorage.removeItem(CSRF_KEY)
  } catch {}
}

export const getCsrf = (): string => {
  try {
    const w = (window as unknown as { csrf_token?: string }).csrf_token
    if (w) return w
    return localStorage.getItem(CSRF_KEY) ?? ''
  } catch { return '' }
}

/** خطأ من Frappe مع الرسالة العربية القادمة من `frappe.throw`. */
export class BackendError extends Error {
  status: number
  raw?: unknown
  constructor(message: string, status: number, raw?: unknown) { super(message); this.name = 'BackendError'; this.status = status; this.raw = raw }
}

const firstMessage = (body: any): string | undefined => {
  const parse = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined
    try { const p = JSON.parse(v); return Array.isArray(p) ? parse(p[0]) : (p?.message ?? undefined) } catch { return v }
  }
  if (Array.isArray(body?._server_messages)) return parse(body._server_messages[0])
  if (typeof body?._server_messages === 'string') { try { const arr = JSON.parse(body._server_messages); return parse(arr[0]) } catch {} }
  return body?.exception || body?.message
}

/** استدعاء `/api/method/miyar.api.*` — POST افتراضياً لأن معظم الإجراءات تكتب. */
export async function call<T = any>(method: string, args: Record<string, unknown> = {}, opts: { get?: boolean } = {}): Promise<T> {
  const { url, site, token } = getBackend()
  if (!url) throw new BackendError('لم يُضبط عنوان الخادم — أضِفه من الإعدادات.', 0)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (site) headers['X-Frappe-Site-Name'] = site
  if (token) headers.Authorization = `token ${token}`
  const csrf = getCsrf()
  if (csrf) headers['X-Frappe-CSRF-Token'] = csrf

  let endpoint = `${url}/api/method/${method}`
  const init: RequestInit = { method: opts.get ? 'GET' : 'POST', headers, credentials: 'include', mode: 'cors' }
  if (opts.get) {
    const qs = new URLSearchParams()
    Object.entries(args).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v)) })
    // Bust intermediary caches — boot must reflect writes immediately.
    qs.set('_', String(Date.now()))
    endpoint += `?${qs}`
  } else {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(args)
  }

  let res: Response
  try { res = await fetch(endpoint, init) } catch { throw new BackendError('تعذّر الوصول إلى الخادم — تحقق من العنوان ومن تشغيل bench.', 0) }

  const text = await res.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = { message: text } }
  if (!res.ok) {
    const msg = firstMessage(body) || (res.status === 403 ? 'لا تملك صلاحية هذا الإجراء أو انتهت الجلسة.' : `فشل الطلب (${res.status})`)
    throw new BackendError(msg, res.status, body)
  }
  return (body?.message ?? body) as T
}

/** فحص العنوان قبل الحفظ — يتحقق أن miyar مثبت على الموقع. */
export const ping = (url: string, site = '') => {
  const prev = getBackend()
  setBackendUrl(url, site)
  return call<{ ok: boolean; app: string; version: string; site: string; developer_mode: boolean }>('miyar.api.auth.ping', {}, { get: true })
    .catch(err => { setBackendUrl(prev.url, prev.site); throw err })
}
