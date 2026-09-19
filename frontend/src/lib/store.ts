import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type {
  User, Organization, RefTest, CatalogItem, Contract, TestRequest, Study, Delegation, Rating, BusinessRules, Notification,
  Role, TimeSlot, Borehole, Layer, Sample, Coord, AuditEvent, Document, Invoice, Policy, Quote, QuoteItem, Template, KnowledgeVersion, Organization as Org,
  Equipment, ArchivedSample, CustodyEvent, Photo, MethodSheet, Masters, Analytics, HelpCenter, Knowledge, RefLimits, Ticket, Permission, UserPreferences, UserSession, ScheduledJob, PendingRegistration,
} from './types'
import { uid } from './format'
import { BackendError, call, clearLoggedOut, clearToken, getBackend, isEmbedded, isLive, markLoggedOut, prefersCookieSession, setCsrf, setToken, wasLoggedOut } from './backend'

interface Toast { id: string; title: string; body?: string; tone?: 'ok' | 'warn' | 'danger' | 'info' }

interface State {
  user: User | null
  users: User[]
  permissions: Permission[]
  orgs: Organization[]
  refTests: RefTest[]
  catalog: CatalogItem[]
  contracts: Contract[]
  requests: TestRequest[]
  studies: Study[]
  delegations: Delegation[]
  ratings: Rating[]
  rules: BusinessRules
  notifications: Notification[]
  audit: AuditEvent[]
  documents: Document[]
  invoices: Invoice[]
  policies: Policy[]
  quotes: Quote[]
  equipment: Equipment[]
  samples: ArchivedSample[]
  photos: Photo[]
  methods: MethodSheet[]
  templates: Template[]
  knowledgeVersions: KnowledgeVersion[]
  tickets: Ticket[]
  masters: Masters
  analytics: Analytics
  help: HelpCenter
  knowledge: Knowledge
  refLimits: RefLimits
  pendingRegistrations: PendingRegistration[]
  preferences: UserPreferences
  sessions: UserSession[]
  scheduledJobs: ScheduledJob[]
  badges: Record<string, number>
  toasts: Toast[]
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  markAllRead: () => void
  live: boolean
  booted: boolean
  syncing: boolean
  syncError: string | null
  syncedAt: string | null
  hydrate: () => Promise<void>
  /** Re-read everything from the server (writes call this so Desk ↔ SPA stay in sync). */
  pull: () => Promise<void>
  requestOtp: (mobile: string) => Promise<{ dev_otp?: string }>
  loginLive: (mobile: string, otp: string) => Promise<void>
  logout: () => Promise<void>
  can: (p: Permission) => boolean
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  markRead: (id: string) => void
  upsertCatalog: (item: CatalogItem) => Promise<void>
  toggleCatalog: (id: string) => Promise<void>
  updateRefTest: (t: RefTest) => Promise<void>
  updateOrg: (id: string, patch: Partial<Organization>) => Promise<void>
  addRating: (r: Omit<Rating, 'id' | 'createdAt' | 'status'>) => Promise<void>
  moderateRating: (id: string, status: 'STS06' | 'STS07' | 'STS08') => Promise<void>
  saveDraft: (r: Partial<TestRequest> & { id?: string }) => Promise<string>
  submitRequest: (id: string) => Promise<string>
  cancelRequest: (id: string) => Promise<void>
  labDecide: (id: string, accept: boolean, slot?: TimeSlot, reason?: string) => Promise<void>
  registerSample: (reqId: string, testId: string, s: { depth: number; technician: string }) => Promise<void>
  confirmSample: (reqId: string, testId: string, ok: boolean, reason?: string) => Promise<void>
  saveResult: (reqId: string, testId: string, result: Record<string, string | number>, report?: { name: string; size: string; file?: string }, notes?: string, extra?: { specimen?: Record<string, string>; equipment?: string[] }) => Promise<void>
  submitResult: (reqId: string, testId: string) => Promise<void>
  consultantDecide: (reqId: string, testId: string, accept: boolean, reason?: string, auto?: boolean) => Promise<void>
  createRetest: (reqId: string, testId: string, slots: TimeSlot[], notes?: string) => Promise<string>
  patchStudy: (id: string, fn: (s: Study) => void) => Promise<void>
  runEngine: (studyId: string) => Promise<void>
  savePrelim: (requestId: string, study: Partial<Study>) => Promise<string>
  createDelegation: (d: Omit<Delegation, 'id' | 'createdAt' | 'status'>) => Promise<void>
  decideDelegation: (id: string, accept: boolean) => Promise<void>
  editDelegation: (id: string, toUserId: string) => Promise<void>
  setRules: (r: Partial<BusinessRules>) => Promise<void>
  setOrgActive: (id: string, active: boolean) => Promise<void>
  addEmployee: (name: string, mobile: string, canDelegate: boolean) => Promise<void>
  setEmployeeDelegate: (id: string, canDelegate: boolean) => Promise<void>
  addOrganization: (o: Pick<Org, 'type' | 'name' | 'cr' | 'city' | 'phone' | 'email'> & { principal: string; mobile: string }) => Promise<void>
  requestQuote: (q: Omit<Quote, 'id' | 'status' | 'createdAt'>) => Promise<string>
  respondQuote: (id: string, items: QuoteItem[], labNotes?: string) => Promise<void>
  decideQuote: (id: string, accept: boolean, reason?: string) => Promise<void>
  upsertEquipment: (e: Equipment) => Promise<void>
  recordCalibration: (id: string, certificate: string, calibratedAt: string, provider: string) => Promise<void>
  retireEquipment: (id: string) => Promise<void>
  registerArchivedSample: (s: Omit<ArchivedSample, 'custody' | 'status'> & { status?: ArchivedSample['status'] }) => Promise<void>
  addCustodyEvent: (id: string, ev: Omit<CustodyEvent, 'at'>) => Promise<void>
  disposeSample: (id: string, reason: string) => Promise<void>
  upsertTemplate: (t: Template) => Promise<void>
  addTemplateVersion: (id: string, ver: string, note: string, publish: boolean) => Promise<void>
  addKnowledgeVersion: (ver: string, changes: string) => Promise<void>
  publishKnowledgeVersion: (ver: string) => Promise<void>
  upsertPolicy: (p: Policy) => Promise<void>
  payInvoice: (id: string, channel: string) => Promise<void>
  createTicket: (subject: string, description: string, category?: string, requestId?: string) => Promise<void>
  savePreferences: (p: Partial<UserPreferences>) => Promise<void>
  activateRegistration: (id: string) => Promise<void>
  rejectRegistration: (id: string, reason?: string) => Promise<void>
  submitRegistration: (p: { cr: string; organization_type: string; organization_name: string; principal_name: string; principal_national_id: string; principal_mobile: string; principal_email: string; saac_number?: string; agreed_terms: number }) => Promise<string>
  tick: () => void
  notify: (n: { forRole: Role; forOrgId?: string; title: string; body: string; link?: string; tone?: Notification['tone'] }) => void
}

const fail = (get: () => State, e: unknown, title: string) => {
  get().toast({ title, body: e instanceof Error ? e.message : 'تعذّر الاتصال بالخادم', tone: 'danger' })
}
const refresh = async (get: () => State, title?: string, body?: string, tone: Toast['tone'] = 'ok') => {
  await get().pull()
  if (title) get().toast({ title, body, tone })
}

type ShellWindow = Window & {
  csrf_token?: string
  __MIYAR_AUTH__?: { ok?: boolean; guest?: boolean; token?: string; csrf_token?: string }
  __MIYAR_BOOT__?: any
  __MIYAR_BOOT_USED__?: boolean
}

/** Take portal-embedded auth/boot once, then clear the snapshot so later pulls hit the live API. */
const consumeShellOnce = (): { boot?: any } => {
  const shell = window as ShellWindow
  if (shell.csrf_token) setCsrf(shell.csrf_token)
  const auth = shell.__MIYAR_AUTH__
  if (auth?.ok && auth.token) {
    // Fresh server session (Desk/OTP) — allow portal access again.
    clearLoggedOut()
    setToken(auth.token)
    if (auth.csrf_token) setCsrf(auth.csrf_token)
  }
  if (shell.__MIYAR_BOOT_USED__) return {}
  const boot = shell.__MIYAR_BOOT__
  shell.__MIYAR_BOOT_USED__ = true
  shell.__MIYAR_BOOT__ = null
  return { boot: boot?.user ? boot : undefined }
}

const ensureDeskAuth = async () => {
  // After logout we clear the token; only skip auto re-auth while the marker is set
  // AND there is no live cookie session yet.
  if (getBackend().token && !wasLoggedOut()) return true
  if (!(isEmbedded() || prefersCookieSession())) return false
  try {
    const desk = await call<{ ok: boolean; token?: string; csrf_token?: string }>('miyar.api.auth.desk_session', {}, { get: true })
    if (desk?.ok && desk.token) {
      clearLoggedOut()
      setToken(desk.token)
      if (desk.csrf_token) setCsrf(desk.csrf_token)
      return true
    }
  } catch { /* guest */ }
  return false
}

const clearClientSession = () => {
  clearToken()
  setCsrf('')
  markLoggedOut()
  try {
    const shell = window as ShellWindow & { __MIYAR_LOGGED_IN__?: number; __MIYAR_DESK_USER__?: string }
    shell.__MIYAR_AUTH__ = { ok: false, guest: true }
    shell.__MIYAR_BOOT__ = null
    shell.__MIYAR_BOOT_USED__ = true
    shell.__MIYAR_LOGGED_IN__ = 0
    shell.__MIYAR_DESK_USER__ = ''
  } catch { /* */ }
}

/** End Frappe cookie session (+ API token), matching Desk logout effectiveness. */
const logoutServerSession = async () => {
  // Prefer Miyar endpoint; fall back to core Frappe logout.
  try {
    await call('miyar.api.auth.logout', {})
    return
  } catch { /* try core */ }
  try {
    await call('logout', {})
  } catch { /* already guest / network */ }
}

const EMPTY_MASTERS: Masters = {
  statuses: [], studyPhases: [], boreholeStatuses: [], labSampleStatuses: [], quoteStatuses: [], invoiceStatuses: [],
  auditSeverities: [], engineStatuses: [], engineResultTypes: [],
  roleLabels: [], positionLabels: [], permissionRows: [], permissionColumns: [], permissionMatrix: {},
  orgTypes: [], categories: [], cities: [], uscs: [], custodySteps: [], optionalLabTests: [], seismicClasses: [], sptClasses: [],
  serviceTypes: [], paymentTerms: [], paymentChannels: [], priorities: [], siteConditions: [], gradations: [], soilColors: [],
  moistures: [], boreholeMethods: [], weathers: [], sampleKinds: [], sampleTypes: [], sampleConditions: [], archiveKinds: [],
  equipmentTypes: [], photoKinds: [], docTypes: [], docClassifications: [], ticketCategories: [], ticketStatuses: [],
  buildingTypes: [], structureTypes: [], foundationTypes: [], specialties: [], enginePolicies: [], engineProfiles: [],
}
const EMPTY_ANALYTICS: Analytics = { monthly: [], registrations: [], categoryMix: [], cityMix: [], cityCategory: {}, totals: { requests: 0, tests: 0, orgs: 0, studies: 0 } }
const EMPTY_HELP: HelpCenter = { guides: [], faqs: [], integrations: [], links: [], ecc: [], support: { phone: '', emergency: '', email: '', hours: '' } }
const EMPTY_PREFS: UserPreferences = { calendar: 'both', density: 'comfortable', home: 'dash', sms: true, email: true, push: false, digest: true }
const EMPTY_KNOWLEDGE: Knowledge = { activeVersion: '', table21: [], formulas: [], analyticalFields: [], recommendationFields: [], manualFields: [], triggers: [], chemicalTests: [], mandatorySampleTests: [] }
const EMPTY_RULES: BusinessRules = {
  maxTestsPerRequest: 0, proposedSlots: 0, minLeadHours: 0, labDecisionHours: 0, consultantDecisionHours: 0,
  minBoreholeDepth: 0, geofenceMeters: 0, vat: 0, labTimeoutAction: 'expire', enginePolicy: 'screen-then-cloud',
}

const arr = <T,>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v as T[]) : undefined)

const fromBoot = (b: any): Partial<State> => {
  const patch: Partial<State> = {}
  const put = <K extends keyof State>(key: K, value: State[K] | undefined) => { if (value !== undefined) patch[key] = value }
  put('orgs', arr<any>(b?.orgs)?.map((o): Organization => ({ ...o, region: o.region || '', saac: o.saac ?? undefined, kpis: o.kpis ?? [], logo: o.logo ?? undefined })))
  put('refTests', arr<RefTest>(b?.refTests))
  put('catalog', arr<CatalogItem>(b?.catalog))
  put('requests', arr<any>(b?.requests)?.map((r): TestRequest => ({ ...r, rules: r.rules ?? undefined, history: r.history ?? [], tests: (r.tests ?? []).map((t: any) => ({ ...t, sample: t.sample ?? undefined, report: t.report ?? undefined })) })))
  put('contracts', arr<Contract>(b?.contracts))
  put('quotes', arr<Quote>(b?.quotes))
  put('studies', arr<any>(b?.studies)?.map((s): Study => ({ ...s, plan: { ...s.plan, engineSuggestion: s.plan?.engineSuggestion ?? undefined } })))
  put('delegations', arr<Delegation>(b?.delegations))
  put('ratings', arr<Rating>(b?.ratings))
  put('invoices', arr<Invoice>(b?.invoices))
  put('documents', arr<Document>(b?.documents))
  put('audit', arr<AuditEvent>(b?.audit))
  put('notifications', arr<Notification>(b?.notifications))
  put('tickets', arr<Ticket>(b?.tickets))
  put('equipment', arr<Equipment>(b?.equipment))
  put('samples', arr<ArchivedSample>(b?.samples))
  put('photos', arr<Photo>(b?.photos))
  put('methods', arr<MethodSheet>(b?.methods))
  put('policies', arr<Policy>(b?.policies))
  put('templates', arr<Template>(b?.templates))
  put('knowledgeVersions', arr<KnowledgeVersion>(b?.knowledgeVersions))
  put('users', arr<User>(b?.users))
  put('permissions', arr<Permission>(b?.permissions))
  if (b?.masters) patch.masters = b.masters as Masters
  if (b?.analytics) patch.analytics = b.analytics as Analytics
  if (b?.help) patch.help = b.help as HelpCenter
  if (b?.knowledge) patch.knowledge = b.knowledge as Knowledge
  if (b?.refLimits) patch.refLimits = b.refLimits as RefLimits
  if (b?.badges) patch.badges = b.badges as Record<string, number>
  if (Array.isArray(b?.pendingRegistrations)) patch.pendingRegistrations = b.pendingRegistrations
  if (b?.preferences) patch.preferences = { ...EMPTY_PREFS, ...b.preferences }
  if (Array.isArray(b?.sessions)) patch.sessions = b.sessions
  if (Array.isArray(b?.scheduledJobs)) patch.scheduledJobs = b.scheduledJobs
  if (b?.rules) patch.rules = { ...EMPTY_RULES, ...b.rules }
  if (b?.user !== undefined) patch.user = (b.user ?? null) as User | null
  return patch
}

export const useStore = create<State>((set, get) => ({
  user: null,
  users: [], permissions: [], orgs: [], refTests: [], catalog: [], contracts: [], requests: [], studies: [],
  delegations: [], ratings: [], rules: EMPTY_RULES, notifications: [], audit: [], documents: [], invoices: [],
  policies: [], quotes: [], equipment: [], samples: [], photos: [], methods: [], templates: [], knowledgeVersions: [],
  tickets: [], pendingRegistrations: [], preferences: EMPTY_PREFS, sessions: [], scheduledJobs: [], masters: EMPTY_MASTERS, analytics: EMPTY_ANALYTICS, help: EMPTY_HELP, knowledge: EMPTY_KNOWLEDGE,
  refLimits: {}, badges: {}, toasts: [],
  sidebarCollapsed: false,
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  notify: (n) => set(s => {
    let forOrgId = n.forOrgId
    if (!forOrgId && n.link) { const id = n.link.split('/')[2]; const r = s.requests.find(x => x.id === id); if (r) forOrgId = n.forRole === 'lab' ? r.labId : n.forRole === 'consultant' ? r.consultantId : n.forRole === 'contractor' ? r.contractorId : undefined }
    return { notifications: [{ id: uid('n'), at: new Date().toISOString(), read: false, ...n, forOrgId }, ...s.notifications] }
  }),
  live: isLive(), booted: false, syncing: false, syncError: null, syncedAt: null,
  pull: async () => {
    if (!isLive()) return
    set({ syncing: true, syncError: null })
    try {
      await ensureDeskAuth()
      let boot: any
      try {
        boot = await call('miyar.api.session.get_boot', {}, { get: true })
      } catch (e) {
        if (e instanceof BackendError && (e.status === 401 || e.status === 403 || e.status === 400)) {
          clearToken()
          const ok = await ensureDeskAuth()
          if (ok) boot = await call('miyar.api.session.get_boot', {}, { get: true })
          else {
            set({ user: null })
            boot = await call('miyar.api.session.public_boot', {}, { get: true })
          }
        } else throw e
      }
      set({ ...fromBoot(boot), live: true, booted: true, syncedAt: new Date().toISOString(), syncError: null })
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'تعذّر الاتصال بالخادم' })
    } finally {
      set({ syncing: false })
    }
  },
  hydrate: async () => {
    if (!isLive()) { set({ live: false, booted: false, syncError: 'أضِف عنوان الخادم من شاشة الدخول أو الإعدادات.' }); return }
    const { boot: shellBoot } = consumeShellOnce()
    if (shellBoot) {
      set({ ...fromBoot(shellBoot), live: true, booted: true, syncedAt: new Date().toISOString(), syncError: null })
    }
    await get().pull()
  },
  requestOtp: (mobile) => call('miyar.api.auth.request_otp', { mobile }),
  loginLive: async (mobile, otp) => {
    const res = await call<{ token: string; csrf_token?: string }>('miyar.api.auth.verify_otp', { mobile, otp })
    clearLoggedOut()
    setToken(res.token)
    if (res.csrf_token) setCsrf(res.csrf_token)
    set({ live: true })
    await get().pull()
  },

  logout: async () => {
    // Must await so Set-Cookie (cleared sid) is applied before we navigate.
    await logoutServerSession()
    clearClientSession()
    set({ user: null, permissions: [] })
    // Hard navigate so the portal shell reloads as Guest (no embedded desk auth).
    window.location.href = isEmbedded() || prefersCookieSession() ? '/miyar/login' : '/login'
  },
  can: (p) => get().permissions.includes(p),
  toast: (t) => { const id = uid('t'); set(s => ({ toasts: [...s.toasts, { ...t, id }] })); setTimeout(() => get().dismissToast(id), 4200) },
  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  markRead: async (id) => {
    set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) }))
    try { await call('miyar.api.write.mark_notification_read', { name: id }) } catch { /* محلي حتى المزامنة التالية */ }
  },
  markAllRead: async () => {
    set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) }))
    try { await call('miyar.api.write.mark_all_notifications_read') } catch { /* */ }
  },

  addOrganization: async (o) => {
    try {
      const res = await call<{ name: string; organization?: Organization }>('miyar.api.write.add_organization', { payload: o })
      if (res?.organization) {
        const org = { ...res.organization, region: res.organization.region || '', saac: res.organization.saac ?? undefined, kpis: res.organization.kpis ?? [], logo: res.organization.logo ?? undefined } as Organization
        set(s => ({ orgs: s.orgs.some(x => x.id === org.id) ? s.orgs.map(x => x.id === org.id ? org : x) : [org, ...s.orgs] }))
      }
      await refresh(get, 'أُنشئت المنشأة وفُعّل حسابها', `${o.name} — أُرسل رمز التفعيل إلى ${o.mobile}.`)
    } catch (e) { fail(get, e, 'تعذّر إنشاء المنشأة') }
  },
  requestQuote: async (q) => {
    try {
      const res = await call<{ name: string }>('miyar.api.write.create_quote', { payload: q })
      await refresh(get, 'أُرسل طلب عرض السعر', `${res.name} — يرد المختبر بعرضه خلال يومي عمل.`)
      return res.name
    } catch (e) { fail(get, e, 'تعذّر إرسال عرض السعر'); return '' }
  },
  respondQuote: async (id, items, labNotes) => {
    try {
      await call('miyar.api.write.respond_quote', { name: id, items, lab_notes: labNotes })
      await refresh(get, 'أُرسل عرض السعر', 'السعر الأساسي في قائمتك لم يتغير (B.R.116).')
    } catch (e) { fail(get, e, 'تعذّر الرد على عرض السعر') }
  },
  decideQuote: async (id, accept, reason) => {
    try {
      const res = await call<{ service_contract?: string }>('miyar.api.write.decide_quote', { name: id, accept: accept ? 1 : 0, reason })
      await refresh(get, accept ? `أُبرم العقد ${res.service_contract ?? ''}`.trim() : 'رُفض عرض السعر', accept ? 'وُقّع إلكترونياً بعد التحقق بـ OTP.' : reason)
    } catch (e) { fail(get, e, 'تعذّر اتخاذ القرار على العرض') }
  },
  upsertEquipment: async (e) => {
    try {
      await call('miyar.api.write.upsert_equipment', { payload: e })
      await refresh(get, 'حُفظت المعدّة', e.name)
    } catch (err) { fail(get, err, 'تعذّر حفظ المعدّة') }
  },
  recordCalibration: async (id, certificate, calibratedAt, provider) => {
    try {
      const res = await call<{ due: string }>('miyar.api.write.record_calibration', { name: id, certificate, calibrated_at: calibratedAt, provider })
      await refresh(get, 'سُجّلت المعايرة', res.due ? `سارية حتى ${res.due}` : undefined)
    } catch (e) { fail(get, e, 'تعذّر تسجيل المعايرة') }
  },
  retireEquipment: async (id) => {
    try {
      await call('miyar.api.write.retire_equipment', { name: id })
      await refresh(get, 'أُخرجت المعدّة من الخدمة', 'لن تُقبل في أي نتيجة جديدة.', 'warn')
    } catch (e) { fail(get, e, 'تعذّر إخراج المعدّة') }
  },
  registerArchivedSample: async (sm) => {
    try {
      await call('miyar.api.write.register_sample', { payload: sm })
      await refresh(get, `سُجّلت العينة`, 'طُبع الملصق وبدأت سلسلة الحيازة.')
    } catch (e) { fail(get, e, 'تعذّر تسجيل العينة') }
  },
  addCustodyEvent: async (id, ev) => {
    try {
      await call('miyar.api.write.add_custody_event', { name: id, step: ev.step, by: ev.by, where: ev.where, note: ev.note, temp_c: ev.tempC })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تسجيل الحيازة') }
  },
  disposeSample: async (id, reason) => {
    try {
      await call('miyar.api.write.dispose_sample', { name: id, reason })
      await refresh(get, 'أُتلفت العينة', 'سُجّل المحضر في سلسلة الحيازة.', 'warn')
    } catch (e) { fail(get, e, 'تعذّر إتلاف العينة') }
  },
  upsertTemplate: async (t) => {
    try {
      await call('miyar.api.write.upsert_template', { payload: t })
      await refresh(get, 'حُفظ القالب', `${t.name} ${t.ver}`)
    } catch (e) { fail(get, e, 'تعذّر حفظ القالب') }
  },
  addTemplateVersion: async (id, ver, note, publish) => {
    try {
      await call('miyar.api.write.add_template_version', { name: id, ver, note, publish: publish ? 1 : 0 })
      await refresh(get, publish ? `نُشر الإصدار ${ver}` : `أُنشئت مسودة ${ver}`)
    } catch (e) { fail(get, e, 'تعذّر حفظ إصدار القالب') }
  },
  addKnowledgeVersion: async (ver, changes) => {
    try {
      await call('miyar.api.write.add_knowledge_version', { ver, changes })
      await refresh(get, `أُنشئت المسودة ${ver}`, 'لا تُطبَّق على أي دراسة قبل الاعتماد.')
    } catch (e) { fail(get, e, 'تعذّر إنشاء المسودة') }
  },
  publishKnowledgeVersion: async (ver) => {
    try {
      await call('miyar.api.write.publish_knowledge_version', { ver })
      await refresh(get, `اعتُمد الإصدار ${ver}`, 'الدراسات الجارية بلا تقرير نهائي تنتقل إليه.')
    } catch (e) { fail(get, e, 'تعذّر اعتماد الإصدار') }
  },
  upsertPolicy: async (p) => {
    try {
      await call('miyar.api.write.upsert_policy', { payload: p })
      await refresh(get, 'حُفظت السياسة', `${p.id} ${p.version}`)
    } catch (e) { fail(get, e, 'تعذّر حفظ السياسة') }
  },
  payInvoice: async (id, channel) => {
    try {
      await call('miyar.api.write.pay_invoice', { name: id, channel })
      await refresh(get, 'تم السداد', `${id} — ${channel}`)
    } catch (e) { fail(get, e, 'تعذّر سداد الفاتورة') }
  },
  createTicket: async (subject, description, category, requestId) => {
    try {
      const res = await call<{ name: string }>('miyar.api.write.create_ticket', { subject, description, category, related_request: requestId })
      await refresh(get, `أُنشئت التذكرة ${res.name}`, 'يصلك رد على جوالك وبريدك خلال ساعة عمل.')
    } catch (e) { fail(get, e, 'تعذّر فتح التذكرة') }
  },
  savePreferences: async (p) => {
    try {
      await call('miyar.api.write.save_preferences', p)
      await refresh(get, 'حُفظت التفضيلات')
    } catch (e) { fail(get, e, 'تعذّر حفظ التفضيلات') }
  },
  activateRegistration: async (id) => {
    try {
      await call('miyar.api.write.activate_registration', { name: id })
      await refresh(get, 'فُعّلت المنشأة', `${id} — أُشعر المفوّض عبر الجوال.`)
    } catch (e) { fail(get, e, 'تعذّر تفعيل المنشأة') }
  },
  rejectRegistration: async (id, reason) => {
    try {
      await call('miyar.api.write.reject_registration', { name: id, reason })
      await refresh(get, 'رُفض طلب التسجيل', id)
    } catch (e) { fail(get, e, 'تعذّر رفض الطلب') }
  },
  submitRegistration: async (p) => {
    const res = await call<{ name: string }>('miyar.api.write.submit_registration', { payload: p })
    return res.name
  },
  tick: () => {
    if (!isLive() || get().syncing) return
    // Lightweight poll — never rebuild the full workspace on an interval.
    void call<{ notifications?: Notification[]; badges?: Record<string, number>; pendingRegistrations?: unknown[] }>(
      'miyar.api.session.poll', {}, { get: true },
    ).then((p) => {
      const patch: Partial<State> = { syncedAt: new Date().toISOString(), syncError: null }
      if (Array.isArray(p?.notifications)) patch.notifications = p.notifications as Notification[]
      if (p?.badges && typeof p.badges === 'object') patch.badges = p.badges as Record<string, number>
      if (Array.isArray(p?.pendingRegistrations)) patch.pendingRegistrations = p.pendingRegistrations as State['pendingRegistrations']
      set(patch)
    }).catch(() => { /* keep last good state — B.R.230 style */ })
  },

  upsertCatalog: async (item) => {
    try {
      await call('miyar.api.write.upsert_catalog', { payload: item })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر حفظ بند الكتالوج') }
  },
  toggleCatalog: async (id) => {
    try {
      await call('miyar.api.write.toggle_catalog', { name: id })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تغيير حالة البند') }
  },
  updateRefTest: async (t) => {
    try {
      await call('miyar.api.write.update_ref_test', { payload: t })
      await refresh(get, t.nameAr, 'حُدّث العنصر المرجعي')
    } catch (e) { fail(get, e, 'تعذّر حفظ الاختبار المرجعي') }
  },
  updateOrg: async (id, patch) => {
    try {
      await call('miyar.api.write.update_org', { name: id, patch })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تحديث المنشأة') }
  },
  addRating: async (r) => {
    try {
      await call('miyar.api.write.add_rating', { payload: r })
      await refresh(get, 'سُجّل التقييم')
    } catch (e) { fail(get, e, 'تعذّر تسجيل التقييم') }
  },
  moderateRating: async (id, status) => {
    try {
      await call('miyar.api.write.moderate_rating', { name: id, status })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تعديل التقييم') }
  },
  saveDraft: async (r) => {
    try {
      const res = await call<{ name: string }>('miyar.api.write.save_draft', { payload: r })
      await get().pull()
      return res.name
    } catch (e) { fail(get, e, 'تعذّر حفظ المسودة'); return '' }
  },
  submitRequest: async (id) => {
    if (!id) { get().toast({ title: 'تعذّر إرسال الطلب', body: 'احفظ المسودة أولاً.', tone: 'danger' }); return '' }
    try {
      const res = await call<{ name: string }>('miyar.api.write.submit_request', { name: id })
      await refresh(get, 'أُرسل الطلب', 'سيصلك إشعار عند اتخاذ الإجراء.')
      return res.name
    } catch (e) { fail(get, e, 'تعذّر إرسال الطلب'); return id }
  },
  cancelRequest: async (id) => {
    try {
      await call('miyar.api.write.cancel_request', { name: id })
      await refresh(get, 'أُلغي الطلب', 'أُشعر المختبر وجميع الأطراف.', 'info')
    } catch (e) { fail(get, e, 'تعذّر إلغاء الطلب') }
  },
  labDecide: async (id, accept, slot, reason) => {
    try {
      await call('miyar.api.write.lab_decide', { name: id, accept: accept ? 1 : 0, slot, reason })
      await refresh(get, accept ? 'قُبل الطلب' : 'رُفض الطلب', 'أُشعر المقاول بالقرار.', accept ? 'ok' : 'warn')
    } catch (e) { fail(get, e, 'تعذّر تسجيل قرار المختبر') }
  },
  registerSample: async (_reqId, testId, sm) => {
    try {
      await call('miyar.api.write.start_test', { name: testId, sample: sm })
      await refresh(get, 'سُجّل استلام العينة', 'يبدأ عداد SLA بعد تأكيد المقاول.')
    } catch (e) { fail(get, e, 'تعذّر تسجيل العينة') }
  },
  confirmSample: async (_reqId, testId, ok, reason) => {
    try {
      await call('miyar.api.write.confirm_sample', { name: testId, confirmed: ok ? 1 : 0, reason })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تأكيد الاستلام') }
  },
  saveResult: async (_reqId, testId, result, report, notes, extra) => {
    try {
      await call('miyar.api.write.save_result', { name: testId, result, report, notes, specimen: extra?.specimen, equipment: extra?.equipment })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر حفظ النتيجة') }
  },
  submitResult: async (reqId, testId) => {
    const t0 = get().requests.find(r => r.id === reqId)?.tests.find(t => t.id === testId)
    try {
      const vals = Object.entries(t0?.result ?? {}).map(([field_key, value]) => ({ field_key, value }))
      await call('miyar.api.write.submit_output', { name: testId, result_values: vals, report_file: t0?.report?.file || t0?.report?.name, notes: t0?.notes })
      await refresh(get, 'رُفعت النتيجة', 'تُعتمد تلقائياً بعد المهلة إن لم يُتخذ إجراء.')
    } catch (e) { fail(get, e, 'تعذّر رفع المخرج') }
  },
  consultantDecide: async (_reqId, testId, accept, reason) => {
    try {
      await call('miyar.api.write.review_test', { name: testId, approve: accept ? 1 : 0, reason })
      await refresh(get, accept ? 'اعتُمدت النتيجة' : 'رُفضت النتيجة', 'أُشعر المقاول والمختبر.', accept ? 'ok' : 'warn')
    } catch (e) { fail(get, e, 'تعذّر تسجيل قرار الاستشاري') }
  },
  createRetest: async (_reqId, testId, slots, notes) => {
    try {
      const res = await call<{ name: string }>('miyar.api.write.create_retest', { test_line: testId, slots, notes })
      await refresh(get, 'أُرسل طلب الإعادة', `رقم الطلب ${res.name}`)
      return res.name
    } catch (e) { fail(get, e, 'تعذّر إنشاء طلب الإعادة'); return '' }
  },
  patchStudy: async (id, fn) => {
    const before = get().studies.find(s => s.id === id)
    if (!before) return
    const next = structuredClone(before)
    fn(next)
    set(s => ({ studies: s.studies.map(st => st.id === id ? next : st) }))
    try {
      if (!before.prelim.approvedByConsultant && next.prelim.approvedByConsultant) {
        await call('miyar.api.geotech.approve_prelim', { name: id })
      } else if (!before.plan.approved && next.plan.approved) {
        await call('miyar.api.geotech.approve_plan', { name: id, justification: next.plan.justification })
      } else if (!before.report?.approved && next.report?.approved) {
        await call('miyar.api.geotech.approve_report', { name: id, approve: 1 })
      } else if (before.report?.approved !== false && next.report?.approved === false && next.report?.rejectReason) {
        await call('miyar.api.geotech.approve_report', { name: id, approve: 0, reason: next.report.rejectReason })
      } else {
        await call('miyar.api.write.save_study', { name: id, payload: next })
      }
      await get().pull()
    } catch (e) {
      fail(get, e, 'تعذّر حفظ الدراسة')
      await get().pull()
    }
  },
  savePrelim: async (requestId, study) => {
    try {
      const res = await call<Study>('miyar.api.write.save_study', { test_request: requestId, payload: { requestId, ...study } })
      await get().pull()
      return res.id
    } catch (e) { fail(get, e, 'تعذّر حفظ البيانات الأولية'); return '' }
  },
  runEngine: async (studyId) => {
    if (get().studies.find(s => s.id === studyId)?.plan.approved) { get().toast({ title: 'الخطة معتمدة', body: 'لا يمكن إعادة تشغيل المحرك بعد اعتماد خطة الاستكشاف (B.R.175).', tone: 'danger' }); return }
    try {
      await call('miyar.api.geotech.run_plan_engine', { name: studyId })
      await get().pull()
      const sug = get().studies.find(s => s.id === studyId)?.plan.engineSuggestion
      get().toast({ title: 'صدرت خطة الاستكشاف المقترحة', body: sug ? `${sug.count} جسات بعمق ${sug.depth} م` : 'راجع أساس الاقتراح.', tone: 'ok' })
    } catch (e) {
      get().toast({ title: 'تعذّر تشغيل المحرك', body: e instanceof Error ? e.message : 'الخادم لم يستجب.', tone: 'danger' })
    }
  },
  createDelegation: async (d) => {
    try {
      await call('miyar.api.write.create_delegation', { payload: d })
      await refresh(get, d.type === 'direct' ? 'فُعّل التفويض' : 'أُرسل التفويض')
    } catch (e) { fail(get, e, 'تعذّر إنشاء التفويض') }
  },
  decideDelegation: async (id, accept) => {
    try {
      await call('miyar.api.write.decide_delegation', { name: id, accept: accept ? 1 : 0 })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تسجيل قرار التفويض') }
  },
  editDelegation: async (id, toUserId) => {
    try {
      await call('miyar.api.write.revoke_delegation', { name: id, to_user: toUserId })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تعديل التفويض') }
  },
  setRules: async (r) => {
    try {
      await call('miyar.api.write.set_rules', { payload: r })
      await refresh(get, 'حُفظت الإعدادات', 'تُطبَّق على العمليات الجديدة فقط.')
    } catch (e) { fail(get, e, 'تعذّر حفظ القواعد') }
  },
  setOrgActive: async (id, active) => {
    try {
      await call('miyar.api.write.set_org_active', { name: id, active: active ? 1 : 0 })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تغيير حالة المنشأة') }
  },
  addEmployee: async (name, mobile, canDelegate) => {
    try {
      await call('miyar.api.write.add_employee', { name, mobile, can_delegate: canDelegate ? 1 : 0 })
      await refresh(get, 'أُضيف الموظف', `${name} — يصله رمز التفعيل على ${mobile}.`)
    } catch (e) { fail(get, e, 'تعذّر إضافة الموظف') }
  },
  setEmployeeDelegate: async (id, canDelegate) => {
    try {
      await call('miyar.api.write.set_employee_delegate', { user: id, can_delegate: canDelegate ? 1 : 0 })
      await get().pull()
    } catch (e) { fail(get, e, 'تعذّر تعديل صلاحية التفويض') }
  },
}))

// ── Selectors / helpers ─────────────────────────────────────
/** Selector hook for derived arrays/objects — shallow-compared so fresh `.filter()` results don't re-render forever. */
export const useSel = <T,>(sel: (s: State) => T): T => useStore(useShallow(sel))
export const useUser = () => useStore(s => s.user)
export const selectOrg = (id: string) => useStore.getState().orgs.find(o => o.id === id)
export const selectRefTest = (id: string) => useStore.getState().refTests.find(t => t.id === id)

/** Delegation-aware access: employee sees only delegated requests/tests; principal sees org scope. */
export const visibleRequests = (s: State): TestRequest[] => {
  const u = s.user
  if (!u) return []
  // Drafts (STS09) exist only for the contractor who is writing them — nobody else sees them.
  const orgScope = s.requests.filter(r => (r.status !== 'STS09' || u.role === 'contractor') && (
    u.role === 'admin' || u.role === 'support' || u.role === 'supervisor' ||
    (u.role === 'contractor' && r.contractorId === u.orgId) ||
    (u.role === 'lab' && r.labId === u.orgId) ||
    (u.role === 'consultant' && r.consultantId === u.orgId)))
  if (u.position === 'principal' || u.role === 'contractor' || u.role === 'consultant' || u.role === 'admin' || u.role === 'support' || u.role === 'supervisor') return orgScope
  const mine = new Set(s.delegations.filter(d => d.toUserId === u.id && d.status === 'STS23').map(d => d.requestId))
  return orgScope.filter(r => mine.has(r.id))
}

export const canActOnTest = (s: State, r: TestRequest, testId: string) => {
  const u = s.user; if (!u) return false
  if (u.position === 'principal') return true
  return s.delegations.some(d => d.toUserId === u.id && d.status === 'STS23' && d.requestId === r.id && (d.scope === 'request' || d.testId === testId))
}

export const emptyBorehole = (code: string, approved: Coord, depth: number): Borehole => ({ id: uid('bh'), code, approved, approvedDepth: depth, status: 'ready', layers: [], samples: [], photos: [] })
export type { Layer, Sample }

// ── Evidence & vocabulary lookups (كلها على بيانات الخادم) ──
/** صور الأدلة المطابقة للمرشّح — الفلترة على ما وصل من الخادم لا على قائمة محلية. */
export const photosFor = (f: { requestId?: string; testId?: string; sampleId?: string; boreholeCode?: string; kind?: string }): Photo[] =>
  useStore.getState().photos.filter(p =>
    (!f.requestId || p.requestId === f.requestId) && (!f.testId || p.testId === f.testId) &&
    (!f.sampleId || p.sampleId === f.sampleId) && (!f.boreholeCode || p.boreholeCode === f.boreholeCode) &&
    (!f.kind || p.kind === f.kind))

export const photoById = (id: string): Photo | undefined => useStore.getState().photos.find(p => p.id === id)
export const methodFor = (refTestId: string): MethodSheet | undefined => useStore.getState().methods.find(m => m.refTestId === refTestId)
export const equipmentById = (id: string): Equipment | undefined => useStore.getState().equipment.find(e => e.id === id)
/** تسلسل حالات العينة كما تعرّفه خطوات الحيازة في المنصة. */
export const sampleStatusSteps = (): string[] => [...new Set(useStore.getState().masters.custodySteps.map(c => c.sampleStatus).filter(Boolean))]
/** تسمية التصنيف (تربة/إسفلت/خرسانة/ركام) من الجدول المرجعي. */
export const categoryLabel = (code: string): string => useStore.getState().masters.categories.find(c => c.code === code)?.label ?? code
/** إحداثيات مدينة/حي من جدول النطاقات الجغرافية — تُهمل النقاط بلا إحداثيات. */
export const cityCoord = (name: string): [number, number] | undefined => {
  const row = useStore.getState().masters.cities.find(c => c.name === name)
  return row?.lat != null && row?.lng != null ? [row.lat, row.lng] : undefined
}
export const photoKindLabel = (code: string): string => useStore.getState().masters.photoKinds.find(k => k.code === code)?.label ?? code
export const docTypeLabel = (code: string): string => useStore.getState().masters.docTypes.find(t => t.code === code)?.label ?? code
export const orgTypeLabel = (code: string): string => useStore.getState().masters.orgTypes.find(t => t.code === code)?.label ?? code
export const uscsColor = (code: string): string => useStore.getState().masters.uscs.find(u => u.code === code)?.color || '#D8D3C4'
export const uscsLabel = (code: string): string => useStore.getState().masters.uscs.find(u => u.code === code)?.label ?? code
