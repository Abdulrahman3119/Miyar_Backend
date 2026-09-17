/**
 * Live client for the I-DO dual-path engineering engine (ido_dual_ai v0.2.8).
 *
 * This is a real HTTP client, not a simulation: the demo posts the actual PDF to
 * the running FastAPI service and renders whatever it returns. Nothing here
 * fabricates a verdict, a status, an elapsed time or a token count.
 *
 * When the service is unreachable the platform must keep working and say so —
 * that is B.R.230, not a fallback we invented.
 */

import { getBackend, getCsrf, isEmbedded, prefersCookieSession } from './backend'
import { uploadFile } from './files'
import { useStore } from './store'
import type { Tone } from './types'

/* ───────── evaluation result (mirrors schemas/evaluation_schema.json) ───────── */

/** The six client-facing statuses from the control pack. The demo used to know only two. */
export type EvalStatus =
  | 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT'
  | 'NOT_EVALUABLE' | 'NOT_APPLICABLE'

export type ResultType = 'MEASURED_DATA' | 'CALCULATED_DATA' | 'ANALYTICAL_FINDING' | 'RECOMMENDATION'

export interface Assessment {
  requirement_id: string
  requirement_text: string
  evidence: string
  source_location: string
  measured_value: string
  measured_unit: string
  required_condition_or_limit: string
  technical_reference: string
  knowledge_rule_id: string
  knowledge_version: string
  status: EvalStatus
  reasoning_summary: string
}

export interface EvidenceItem {
  evidence_type: string; identifier: string; value: string; unit: string
  location_or_depth: string; source_page_or_section: string; report_conclusion: string
}

export interface Conflict { description: string; source_a: string; source_b: string; action_required: string }
export interface Finding { finding: string; basis: string; reference: string; result_type: ResultType }
export interface Recommendation { recommendation: string; basis: string; reference: string; human_review_required: boolean }

/** Written by enforce_engineering_safety() in the engine — the deterministic guardrail pass. */
export interface EngineeringSafety {
  guardrails_version: string
  control_pack_version: string | null
  clause_registry_version: string | null
  edition_gate_required: boolean
  effective_for_production: boolean
  /** How many COMPLIANT/NON_COMPLIANT verdicts the gate downgraded to NOT_EVALUABLE. */
  downgraded_assessments: number
  human_review_required: boolean
}

export interface EvalResult {
  document: { type: string; discipline: string; project_or_site: string; scope_match: boolean; scope_reason: string }
  overall_status: EvalStatus
  executive_summary: string
  evidence: EvidenceItem[]
  assessments: Assessment[]
  analytical_findings: Finding[]
  missing_information: string[]
  conflicts: Conflict[]
  engineering_recommendations: Recommendation[]
  human_engineering_review_required: boolean
  overall_conclusion: string
  _engineering_safety?: EngineeringSafety
}

export interface ScopeGate {
  detected: 'geotechnical' | 'structural' | 'mixed_or_ambiguous' | 'unknown'
  scores: Record<string, number>
  hits: Record<string, string[]>
}

export interface Usage { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost: number }

export interface PathRun {
  provider: string
  engine: string
  model: string
  elapsed_seconds: number
  privacy: string
  scope_gate?: ScopeGate
  usage?: Usage
  result: EvalResult
}

export interface AnalyzeResponse {
  mode: EngineMode
  profile: string
  cloud?: PathRun
  local?: PathRun
  cloud_error?: string
  local_error?: string
  comparison?: {
    scope_match_same: boolean; overall_status_same: boolean
    cloud_status: EvalStatus; local_status: EvalStatus
    cloud_seconds: number; local_seconds: number
    cloud_assessments: number; local_assessments: number
    cloud_recommendations: number; local_recommendations: number
  }
  scope_gate_stopped?: boolean
  engine_run?: string
  embedded?: boolean
  meta?: EngineRunMeta
}

export interface EngineRunMeta {
  name: string
  ran_at?: string | null
  actor?: string
  overall_status?: EvalStatus | string | null
  cost?: number | null
  tokens?: number | null
  source_file?: string | null
  test_request?: string | null
  study?: string | null
  scope_gate_stopped?: boolean
}

export interface EngineRunSummary {
  name: string
  profile?: string
  mode?: EngineMode | string
  overall_status?: EvalStatus | string
  ran_at?: string
  actor?: string
  test_request?: string
  study?: string
  scope_gate_stopped?: number | boolean
  cost?: number
  tokens?: number
  route_used?: string
  source_file?: string
  creation?: string
}

export interface EngineHealth {
  status: string
  cloud: { provider: string; configured: boolean; model: string; base_url: string; pdf_engine: string }
  local: {
    provider: string; reachable: boolean; model: string; base_url: string
    thinking_enabled: boolean; structured_mode: string; num_ctx: number
    num_predict: number; evidence_chars: number; timeout_seconds: number; error: string
  }
  policy_version: string
  meyar_engineering_controls: {
    guardrails_loaded: boolean
    control_pack_loaded: boolean
    clause_registry_loaded: boolean
    control_pack_version: string | null
    clause_registry_version: string | null
    /** false until a geotechnical expert approves the clause registry and the governing SBC edition is fixed. */
    effective_for_production: boolean
    edition_gate: { required?: boolean; reason?: string; on_unconfirmed?: string }
  }
}

export type EngineMode = 'cloud' | 'local' | 'compare'

/**
 * Assessment profile key. The list of profiles is a platform master
 * (`masters.engineProfiles`) — the key itself is the engine's own string and is sent
 * to the service untranslated.
 */
export type EngineProfile = string

/* ───────── endpoint ───────── */

const LS_KEY = 'miyar.engineBaseUrl'

/** Prefer Frappe proxy when SPA is embedded in Desk /miyar (no CORS, persists Engine Run). */
export function useFrappeEngineProxy(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (localStorage.getItem('miyar.engine.direct') === '1') return false
  } catch { /* */ }
  return isEmbedded() || prefersCookieSession() || !!getBackend().url
}

/**
 * Where to reach the engine directly (Vite proxy / VITE_ENGINE_URL / override).
 * When `useFrappeEngineProxy()` is true, health/analyze go through miyar.api.engine.* instead.
 */
export function engineBaseUrl(): string {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) return stored.replace(/\/+$/, '')
  } catch { /* private mode / blocked storage — fall through to the default */ }
  // Boot settings from Frappe may carry the configured service URL (display / direct mode).
  try {
    const fromRules = (useStore.getState().rules as { engineBaseUrl?: string } | undefined)?.engineBaseUrl
    if (fromRules) return fromRules.replace(/\/+$/, '')
  } catch { /* store not ready */ }
  const env = (import.meta as { env?: { DEV?: boolean; VITE_ENGINE_URL?: string } }).env
  if (env?.DEV) return '/engine-api'
  return (env?.VITE_ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
}

/** Human-readable target — the proxy path alone tells the presenter nothing. */
export function engineTarget(): string {
  if (useFrappeEngineProxy()) return 'معيار · محرك مدمج'
  const b = engineBaseUrl()
  return b === '/engine-api' ? 'http://127.0.0.1:8000 (عبر وسيط التطوير)' : b
}

export function setEngineBaseUrl(url: string) {
  try {
    if (url) localStorage.setItem(LS_KEY, url.replace(/\/+$/, ''))
    else localStorage.removeItem(LS_KEY)
  } catch { /* private mode / blocked storage */ }
}

/** The explicit override, if one is set. Empty string means "use the default for this build". */
export function engineOverride(): string {
  try { return localStorage.getItem(LS_KEY) ?? '' } catch { return '' }
}

/**
 * User-facing reason for a transport failure, shown under B.R.230.
 * Deliberately free of endpoints, stack text and operator instructions — the technical
 * detail goes to the console for whoever runs the service, not to the screen.
 */
function transportReason(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (typeof console !== 'undefined') console.warn('[engine]', m)
  if (/abort/i.test(m)) return 'انتهت مهلة الاتصال بخدمة التحليل قبل وصول نتيجة.'
  return 'خدمة التحليل غير متاحة حالياً.'
}

export class EngineError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'EngineError'
    this.status = status
  }
}

/**
 * Poll health. Returns a cleanup function. Never throws — the caller gets `null` when unreachable.
 * A failed probe retries sooner than a successful one so the badge recovers quickly once the
 * engine comes up mid-demo (the first probe can be slow while the dev proxy warms up).
 */
export function watchHealth(onChange: (h: EngineHealth | null, reason?: string) => void, everyMs = 60000, retryMs = 15000) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  const tick = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      if (!stopped) timer = setTimeout(tick, everyMs)
      return
    }
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 8000)
    let ok = false
    try {
      const h = await fetchHealth(ctl.signal)
      ok = true
      if (!stopped) onChange(h)
    } catch (e) {
      if (!stopped) onChange(null, transportReason(e))
    } finally {
      clearTimeout(to)
      if (!stopped) timer = setTimeout(tick, ok ? everyMs : retryMs)
    }
  }
  tick()
  return () => { stopped = true; clearTimeout(timer) }
}

export async function fetchHealth(signal?: AbortSignal): Promise<EngineHealth> {
  if (useFrappeEngineProxy()) {
    return frappeEngineCall<EngineHealth>('miyar.api.engine.health', {}, signal)
  }
  const r = await fetch(`${engineBaseUrl()}/api/health`, { signal })
  if (!r.ok) throw new Error(`المحرك ردّ بحالة ${r.status}`)
  return r.json() as Promise<EngineHealth>
}

/** Saved Engine Run list from Miyar (persisted on every analyze). */
export async function listEngineRuns(limit = 50, signal?: AbortSignal): Promise<EngineRunSummary[]> {
  if (!useFrappeEngineProxy()) return []
  const out = await frappeEngineCall<{ runs?: EngineRunSummary[] }>('miyar.api.engine.list_runs', { limit }, signal)
  return Array.isArray(out?.runs) ? out.runs : []
}

/** Reload one stored analysis into the same shape as a live analyze() response. */
export async function getEngineRun(name: string, signal?: AbortSignal): Promise<AnalyzeResponse> {
  if (!useFrappeEngineProxy()) throw new EngineError('سجل التشغيل متاح فقط داخل معيار.')
  return frappeEngineCall<AnalyzeResponse>('miyar.api.engine.get_run', { name }, signal)
}

async function frappeEngineCall<T>(method: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const { url, site, token } = getBackend()
  const base = url || (typeof window !== 'undefined' ? window.location.origin : '')
  if (!base) throw new EngineError('لم يُضبط عنوان خادم معيار.')
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (site) headers['X-Frappe-Site-Name'] = site
  if (token) headers.Authorization = `token ${token}`
  const csrf = getCsrf()
  if (csrf) headers['X-Frappe-CSRF-Token'] = csrf
  let r: Response
  try {
    r = await fetch(`${base}/api/method/${method}`, { method: 'POST', headers, body: JSON.stringify(args), credentials: 'include', signal })
  } catch (e) {
    throw new EngineError(transportReason(e))
  }
  const text = await r.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = { message: text } }
  if (!r.ok) {
    const msg = body?._server_messages
      ? (() => { try { return JSON.parse(JSON.parse(body._server_messages)[0]).message } catch { return undefined } })()
      : body?.exception || body?.message
    throw new EngineError(typeof msg === 'string' ? msg : `فشل طلب المحرك (${r.status})`, r.status)
  }
  return (body?.message ?? body) as T
}

export async function analyze(
  file: File,
  profile: EngineProfile,
  mode: EngineMode,
  signal?: AbortSignal,
  meta?: { testRequest?: string; study?: string },
): Promise<AnalyzeResponse> {
  if (useFrappeEngineProxy()) {
    return analyzeViaFrappe(file, profile, mode, signal, meta)
  }
  const fd = new FormData()
  fd.append('file', file)
  fd.append('profile', profile)
  fd.append('mode', mode)
  let r: Response
  try {
    r = await fetch(`${engineBaseUrl()}/api/analyze`, { method: 'POST', body: fd, signal })
  } catch (e) {
    throw new EngineError(transportReason(e))
  }
  if (!r.ok) {
    // FastAPI puts the Arabic message in `detail`
    const detail = await r.json().then((d: { detail?: string }) => d?.detail).catch(() => undefined)
    throw new EngineError(detail || `تعذّر إجراء التحليل — حالة ${r.status}`, r.status)
  }
  return r.json() as Promise<AnalyzeResponse>
}

/** Multipart through Frappe whitelist — persists Engine Run server-side.
 * Large PDFs: upload via /upload_file first, then analyze by file_url (avoids a second
 * huge body and survives Werkzeug 413 on the analyze method). */
const _uploadedFileCache = new Map<string, string>()

function _fileCacheKey(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`
}

async function analyzeViaFrappe(
  file: File,
  profile: EngineProfile,
  mode: EngineMode,
  signal?: AbortSignal,
  meta?: { testRequest?: string; study?: string },
): Promise<AnalyzeResponse> {
  const { url, site, token } = getBackend()
  const base = url || (typeof window !== 'undefined' ? window.location.origin : '')
  if (!base) throw new EngineError('لم يُضبط عنوان خادم معيار.')

  // Upload once per File instance; reuse on screen-then-cloud second pass.
  const cacheKey = _fileCacheKey(file)
  let fileUrl = _uploadedFileCache.get(cacheKey)
  if (!fileUrl) {
    try {
      const up = await uploadFile(file, {
        doctype: meta?.testRequest ? 'Test Request' : undefined,
        docname: meta?.testRequest,
        isPrivate: true,
        maxMb: 100,
        accept: 'application/pdf,.pdf',
      })
      fileUrl = up.file
      _uploadedFileCache.set(cacheKey, fileUrl)
    } catch (e) {
      if (file.size > 8 * 1024 * 1024) {
        throw new EngineError(e instanceof Error ? e.message : 'تعذّر رفع الملف قبل التحليل.', (e as { status?: number })?.status)
      }
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (site) headers['X-Frappe-Site-Name'] = site
  if (token) headers.Authorization = `token ${token}`
  const csrf = getCsrf()
  if (csrf) headers['X-Frappe-CSRF-Token'] = csrf

  let r: Response
  try {
    if (fileUrl) {
      r = await fetch(`${base}/api/method/miyar.api.engine.analyze`, {
        method: 'POST', headers, credentials: 'include', signal,
        body: JSON.stringify({
          profile, mode, file_url: fileUrl,
          test_request: meta?.testRequest, study: meta?.study,
        }),
      })
    } else {
      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('profile', profile)
      fd.append('mode', mode)
      if (meta?.testRequest) fd.append('test_request', meta.testRequest)
      if (meta?.study) fd.append('study', meta.study)
      const h = { ...headers }
      delete h['Content-Type']
      r = await fetch(`${base}/api/method/miyar.api.engine.analyze`, { method: 'POST', headers: h, body: fd, credentials: 'include', signal })
    }
  } catch (e) {
    throw new EngineError(transportReason(e))
  }
  const text = await r.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = { message: text } }
  if (!r.ok) {
    if (r.status === 413 || /413|Request Entity Too Large|Content Too Large/i.test(text)) {
      throw new EngineError('حجم الملف أكبر من الحد المسموح على الخادم (ارفع الحد أو اختر ملفاً أصغر).', 413)
    }
    const msg = body?._server_messages
      ? (() => { try { return JSON.parse(JSON.parse(body._server_messages)[0]).message } catch { return undefined } })()
      : body?.exception || body?.message || body?.detail
    const clean = typeof msg === 'string' && !/<!doctype|<html/i.test(msg) ? msg : undefined
    throw new EngineError(clean || `تعذّر إجراء التحليل — حالة ${r.status}`, r.status)
  }
  return (body?.message ?? body) as AnalyzeResponse
}

/* ───────── presentation helpers ─────────
   The Arabic wording and the badge tone for the engine's own enums are platform
   vocabulary: they arrive in `masters.engineStatuses` / `masters.engineResultTypes`. */

const engineMasters = () => useStore.getState().masters

export const statusAr = (s: EvalStatus): string => engineMasters().engineStatuses.find(x => x.code === s)?.ar ?? s
export const statusTone = (s: EvalStatus): Tone => engineMasters().engineStatuses.find(x => x.code === s)?.tone ?? 'neutral'
export const resultTypeAr = (t: ResultType): string => engineMasters().engineResultTypes.find(x => x.code === t)?.ar ?? t

/* ───────── routing policy ─────────
   The ministry's stated pain is not only the cloud bill — it is that the subscription
   lapses when payment is late and work stops. So the path is chosen by a platform
   policy, not by the operator picking a radio button each time, and an unavailable
   path fails over automatically and says so. */

export type RoutePolicy = 'local-first' | 'cloud-first' | 'screen-then-cloud' | 'compare'

/** اسم السياسة وشرحها من جدول سياسات المحرك في المنصة. */
export const routePolicy = (policy: RoutePolicy): { label: string; detail: string } => {
  const row = useStore.getState().masters.enginePolicies.find(p => p.code === policy)
  return { label: row?.label ?? policy, detail: row?.detail ?? '' }
}

export interface RouteDecision {
  /** The mode actually sent to the engine, or null when neither path can serve. */
  mode: EngineMode | null
  /** Arabic explanation shown next to the decision — never leave the user guessing why. */
  reason: string
  /** True when the policy's preferred path was unavailable and the platform switched. */
  failedOver: boolean
  /** True when "compare" could only run one path. */
  degraded: boolean
}

/** Resolve which path to run. `cloudOutage` lets a presenter demonstrate a lapsed subscription. */
export function resolveRoute(policy: RoutePolicy, health: EngineHealth | null, cloudOutage = false): RouteDecision {
  const cloud = !!health?.cloud.configured && !cloudOutage
  const local = !!health?.local.reachable

  if (!cloud && !local) {
    return { mode: null, reason: 'لا يتوفر أي مسار تحليل — تستمر إجراءات الدراسة النظامية دون نتيجة من المحرك (B.R.230).', failedOver: false, degraded: false }
  }
  if (policy === 'compare') {
    if (cloud && local) return { mode: 'compare', reason: 'المساران متاحان — يُشغَّلان معاً بالسياسة وحزمة المعرفة نفسها.', failedOver: false, degraded: false }
    const only: EngineMode = cloud ? 'cloud' : 'local'
    return {
      mode: only, degraded: true, failedOver: false,
      reason: `تعذّرت المقارنة لأن المسار ${cloud ? 'المحلي' : 'السحابي'} غير متاح — نُفِّذ المسار ${cloud ? 'السحابي' : 'المحلي'} وحده.`,
    }
  }
  // screen-then-cloud starts on the local path too; escalation is decided after it answers
  const prefer: EngineMode = policy === 'local-first' || policy === 'screen-then-cloud' ? 'local' : 'cloud'
  const preferUp = prefer === 'local' ? local : cloud
  if (preferUp) {
    return { mode: prefer, reason: routePolicy(policy).detail, failedOver: false, degraded: false }
  }
  const fallback: EngineMode = prefer === 'local' ? 'cloud' : 'local'
  return {
    mode: fallback, failedOver: true, degraded: false,
    reason: prefer === 'cloud'
      ? 'المسار السحابي غير متاح — تحوّل التشغيل تلقائياً إلى المسار المحلي الآمن ولم تتوقف الدراسة.'
      : 'المسار المحلي غير متاح — تحوّل التشغيل تلقائياً إلى المسار السحابي.',
  }
}

/* ───────── local screening before a paid cloud run ─────────
   The engine already refuses an out-of-scope document for free. Screening goes one step
   further: the local model reads the document first, and the cloud is only paid for when
   the document is actually worth a deep analysis. */

export interface ScreenDecision {
  escalate: boolean
  reason: string
}

/**
 * Decide whether a local screening result justifies paying for a cloud run.
 *
 * Conservative on purpose: escalate unless the screening shows the document cannot
 * benefit from it. A missed escalation costs an engineer a second run; a wrong one
 * costs the ministry money on a document that was never evaluable.
 */
export function shouldEscalate(r: EvalResult): ScreenDecision {
  if (!r.document.scope_match) {
    return { escalate: false, reason: 'المستند خارج نطاق ملف التقييم المختار — لا فائدة من تحليل سحابي مدفوع.' }
  }
  // nothing was assessed and nothing was extracted: the document lacks the inputs entirely
  if (r.assessments.length === 0 && r.evidence.length === 0 && r.missing_information.length > 0) {
    return { escalate: false, reason: 'لا يحتوي المستند على البيانات اللازمة للتقييم — يلزم استكمالها قبل أي تحليل عميق.' }
  }
  if (r.overall_status === 'NOT_APPLICABLE') {
    return { escalate: false, reason: 'حالة الاستخدام غير منطبقة على هذا المستند.' }
  }
  return { escalate: true, reason: 'اجتاز المستند الفحص المحلي — يُحال إلى التحليل السحابي العميق.' }
}

/** One step of a screened run, for the stage strip the user sees. */
export interface RunStage {
  key: 'scope' | 'local' | 'cloud'
  label: string
  ran: boolean
  note: string
  seconds?: number
  cost?: number
}

/* ───────── cost model ─────────
   Every figure comes from the reference pricing stored in the platform settings and is
   shown with its source attached. Nothing here is estimated in the browser. */
export interface CostRef {
  source: string
  /** SAR per document, cloud API consumption — derived from the quoted budget. */
  cloudPerDoc: number
  monthlyBudgetSAR: number
  budgetCoversDocs: number
  localNote: string
  sovereignty: { cloud: string; local: string }
  continuity: string
}

export const costRef = (): CostRef => {
  const c = useStore.getState().rules.engineCost ?? {}
  const budget = c.monthlyBudgetSAR ?? 0
  const docs = c.budgetCoversDocs ?? 0
  return {
    source: c.source ?? '',
    cloudPerDoc: docs ? budget / docs : 0,
    monthlyBudgetSAR: budget,
    budgetCoversDocs: docs,
    localNote: c.localNote ?? '',
    sovereignty: c.sovereignty ?? { cloud: '', local: '' },
    continuity: c.continuity ?? '',
  }
}

/** Monthly cloud spend for a given volume, in SAR. Linear by definition of the quoted rate. */
export const cloudMonthlySAR = (docsPerMonth: number) => docsPerMonth * costRef().cloudPerDoc

/** توافق مع الشاشات التي كانت تستورد الخرائط كثوابت — القيم من الخادم. */
export const ENGINE_PROFILES = new Proxy([] as string[], {
  get: (_, prop) => {
    const arr = useStore.getState().masters.engineProfiles.map(p => p.code)
    const v = (arr as unknown as Record<string | symbol, unknown>)[prop]
    return typeof v === 'function' ? (v as Function).bind(arr) : v
  },
})
export const STATUS_AR = new Proxy({} as Record<string, string>, { get: (_, k) => statusAr(String(k) as EvalStatus) })
export const STATUS_TONE = new Proxy({} as Record<string, Tone>, { get: (_, k) => statusTone(String(k) as EvalStatus) })
export const RESULT_TYPE_AR = new Proxy({} as Record<string, string>, { get: (_, k) => resultTypeAr(String(k) as ResultType) })
export const COST_REF = new Proxy({} as CostRef, { get: (_, k) => (costRef() as unknown as Record<string | symbol, unknown>)[k] })
export const ROUTE_POLICY_AR = new Proxy({} as Record<string, { label: string; detail: string }>, { get: (_, k) => routePolicy(String(k) as RoutePolicy) })
