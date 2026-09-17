// ── Roles & entities (BRD 3.2) ──────────────────────────────
export type EntityType = 'contractor' | 'lab' | 'consultant' | 'supervisor' | 'ops'
export type Role = 'contractor' | 'lab' | 'consultant' | 'supervisor' | 'admin' | 'support' | 'visitor'
export type Position = 'principal' | 'employee' // المفوّض الرئيسي / موظف

export interface User {
  id: string
  name: string
  role: Role
  position: Position
  orgId: string
  orgName: string
  mobile: string
  canDelegate: boolean
  lastLogin?: string
}

export interface Organization {
  id: string
  type: EntityType
  name: string
  cr: string // السجل التجاري
  city: string
  region: string
  district?: string
  /** ظاهرة في الدليل (STS04) — تُخفى بـ STS05 دون تعطيل الحساب */
  visible?: boolean
  logo?: string
  about: string
  specialties: string[]
  phone: string
  email: string
  website?: string
  address: string
  rating: number
  reviews: number
  active: boolean
  featured?: boolean
  saac?: { number: string; scope: string; expires: string }
  kpis: { label: string; value: string }[]
  license?: string
  since?: string
  employees?: number
  onTime?: number // % on-time delivery (labs)
  autoApprovals?: number
}

// ── Reference elements (managed by admin) ───────────────────
export type Category = 'soil' | 'asphalt' | 'concrete' | 'aggregate'
export interface Method { code: string; name: string; org: 'ASTM' | 'AASHTO' | 'BS' | 'SBC' | 'IP' | 'ISO' }
export interface RefTest {
  id: string
  allowExternalReport?: boolean
  active?: boolean
  isGeotech?: boolean
  nameAr: string
  nameEn: string
  category: Category
  methods: Method[]
  units: Unit[]
  resultFields?: { key: string; label: string; unit: string }[]
}
export type Unit = 'Ea' | 'Set' | 'per Test'

// ── Lab test list (BRD 4.1.1) ───────────────────────────────
export type CatalogStatus = 'STS01' | 'STS02' | 'STS03'
export interface CatalogItem {
  id: string
  labId: string
  refTestId: string
  unit?: Unit
  methods: string[] // method codes chosen
  basePrice?: number
  sla?: number // days
  status: CatalogStatus
}

// ── Contracts (phase 1 — inferred) ──────────────────────────
export interface Contract {
  id: string
  contractorId: string
  labId: string
  consultantId: string
  project: string
  city?: string
  services: ServiceType[]
  payment: 'advance' | 'on-completion'
  startedAt: string
  endedAt?: string
  active: boolean
  quoteId?: string
}

// ── Quotes → contracts (B.R.116/119 — pre-contract flow) ────
export type QuoteStatus = 'pending' | 'quoted' | 'accepted' | 'rejected' | 'expired'
export interface QuoteItem { refTestId: string; method: string; basePrice: number; price: number; sla: number }
export interface Quote {
  id: string; contractorId: string; labId: string; consultantId: string; project: string; city: string
  services: ServiceType[]; payment: 'advance' | 'on-completion'; items: QuoteItem[]; notes?: string
  status: QuoteStatus; createdAt: string; quotedAt?: string; decidedAt?: string; validUntil?: string; labNotes?: string; rejectReason?: string; contractId?: string
}
export interface Template { id: string; name: string; ver: string; ref: string; fields: string; updated: string; used: number; status: 'ساري' | 'مسودة' | 'مؤرشف'; sections: string[]; history?: { ver: string; date: string; note: string; status: 'ساري' | 'مسودة' | 'مؤرشف' }[] }
export interface KnowledgeVersion { ver: string; date: string; changes: string; studies: number; status: 'ساري' | 'مسودة' | 'مؤرشف' }

// ── Requests (BRD 4.1.3) ────────────────────────────────────
export type ServiceType = 'standard' | 'geotech'
export type RequestStatus = 'STS09' | 'STS10' | 'STS11' | 'STS12' | 'STS13' | 'STS14' | 'STS15' | 'STS16' | 'STS26'
export type TestStatus = 'STS17' | 'STS18' | 'STS19' | 'STS20' | 'STS21'

export interface TimeSlot { date: string; from: string; to: string }

export interface TestItem {
  id: string
  refTestId: string
  method: string
  price: number
  sla: number
  status: TestStatus
  startedAt?: string
  submittedAt?: string
  decidedAt?: string
  deadlineAt?: string
  autoApproved?: boolean
  delayHours?: number // B.R.149 — late start vs the approved slot
  executionDeadlineAt?: string
  sample?: { id: string; depth: number; technician: string; receivedAt: string; geoVerified: boolean; geoDistance?: number; confirmedByContractor?: boolean; confirmedAt?: string }
  result?: Record<string, string | number>
  /** حقول النتيجة كما سجّلها المختبر، مع الحد المرجعي والمطابقة */
  resultFields?: { key: string; label: string; unit: string; value: string; limit: string; compliance?: 'ok' | 'fail' | null }[]
  specimen?: Record<string, string>
  equipment?: string[]
  photos?: string[]
  lab?: { temperature: number | null; humidity: number | null }
  report?: { name: string; size: string; file?: string }
  notes?: string
  rejectReason?: string
  delegateId?: string
}

export interface AuditEntry { id: string; at: string; actor: string; actorRole: Role; action: string; detail?: string }

export interface TestRequest {
  id: string
  attachments?: { name: string; size: string; file?: string }[] // B.R.133
  geo?: { lat: number; lng: number }
  rules?: Pick<BusinessRules, 'labDecisionHours' | 'consultantDecisionHours' | 'vat' | 'minLeadHours' | 'geofenceMeters' | 'maxTestsPerRequest' | 'proposedSlots'> // frozen at submit — rules apply to new operations only
  city?: string
  priority?: 'عادية' | 'عالية' | 'حرجة'
  contractId: string
  contractorId: string
  labId: string
  consultantId: string
  project: string
  service: ServiceType
  category?: Category
  status: RequestStatus
  createdAt: string
  submittedAt?: string
  labDeadlineAt?: string
  slots: TimeSlot[]
  chosenSlot?: TimeSlot
  location: string
  notes?: string
  tests: TestItem[]
  history: AuditEntry[]
  parentRequestId?: string // إعادة اختبار
  retestOf?: string
  rejectReason?: string
  delegateId?: string
  studyId?: string
}

// ── Geotechnical study (BRD 4.1.4) ──────────────────────────
export type StudyPhase = 1 | 2 | 3 | 4 | 5 | 6
export type BoreholeStatus = 'ready' | 'in-progress' | 'done'
/** USCS symbol — the closed list comes from the platform's classification master. */
export type USCS = string

export interface Coord { n: number; e: number }
export interface Sample {
  id: string
  docId?: string
  layerId: string
  type: string // رمز نوع العينة من الجدول المرجعي (SPT / UD / D / CS)
  kind: string // soil | rock — من جدول أنواع العينات
  from: number
  to: number
  fieldUSCS?: USCS
  labUSCS?: USCS
  labStatus: 'ready' | 'in-progress' | 'done'
  tests: SampleTest[]
}
export interface SampleTest {
  id: string
  name: string
  method: string
  mandatory: boolean
  value?: string
  unit?: string
  attachment?: string
  compliance?: 'ok' | 'fail'
  limit?: string
}
export interface Layer {
  id: string
  from: number
  to: number
  uscs: USCS
  gradation?: string
  color?: string
  moisture?: string
  description: string
  spt?: [number, number, number]
  n?: number
  rec?: number
  rqd?: number
  offsite?: { reason: string }
  photo?: string
}
export interface Borehole {
  id: string
  code: string
  approved: Coord // من الاستشاري — ثابت
  operational?: Coord // من المختبر
  actual?: Coord // GPS وقت التنفيذ
  approvedDepth: number
  executedDepth?: number
  status: BoreholeStatus
  moved?: number // متر
  notReachedReason?: string
  addedByLab?: { reason: string }
  head?: {
    method: string; rig?: string; diameter: number; casing?: number
    groundLevel?: number; waterInstant?: number; water24h?: number
    date?: string; weather?: string; technician?: string
  }
  layers: Layer[]
  samples: Sample[]
  photos: string[]
  geoVerified?: { distance: number }
}

export interface Study {
  id: string
  requestId: string
  ref: string
  phase: StudyPhase
  knowledgeVersion?: string
  prelim: {
    deedFile?: string
    parcel?: string; plan?: string; district?: string; city?: string; region?: string
    deedNo?: string; deedDate?: string
    area?: number; computedArea?: number; boundaryOk?: boolean
    owner?: string; ownerId?: string
    buildingType?: 'residential' | 'commercial' | 'industrial'
    structure?: 'rc' | 'steel'
    floors?: number
    builtArea?: number
    foundationType?: 'unknown' | 'isolated' | 'raft'
    foundationDepth?: number
    priorInfo?: boolean; neighbors?: boolean
    siteConditions: string[]
    permitNo?: string
    approvedByConsultant?: boolean
    reviewNotes?: string
  }
  polygon: Coord[]
  plan: {
    engineSuggestion?: { count: number; depth: number; spacing: number; basis: string[]; special?: boolean; ref: string }
    approved?: boolean
    approvedAt?: string
    justification?: string
    table21Row?: string
  }
  fieldPlanReviewed?: boolean
  fieldPlanReason?: string
  fieldPlanAck?: boolean
  compliance?: number
  boreholes: Borehole[]
  fieldApproved?: boolean
  chemical?: { sampleId?: string; engineSuggestedSampleId?: string; reasonOverride?: string; results: SampleTest[]; done?: boolean; partialReason?: string }
  analysis: {
    computed: Record<string, { value?: string; inputs: Record<string, string>; formula: string; unit: string; label?: string }>
    analytical: Record<string, string>
    recommendations: Record<string, string>
    manual: Record<string, string>
    attachments: string[]
    done?: boolean
  }
  report?: { previewed?: boolean; approved?: boolean; approvedAt?: string; rejectReason?: string; generatedFile?: string }
}

// ── Delegation (BRD 4.1.6) ──────────────────────────────────
export type DelegationStatus = 'STS22' | 'STS23' | 'STS24' | 'STS25'
export interface Delegation {
  id: string
  type: 'direct' | 'indirect'
  scope: 'request' | 'test'
  requestId: string
  testId?: string
  fromUserId: string
  toUserId: string
  status: DelegationStatus
  createdAt: string
  decidedAt?: string
}

// ── Ratings ────────────────────────────────────────────────
export interface Rating {
  id: string
  contractId: string
  labId: string
  contractorId: string
  quality: number; punctuality: number; communication: number
  comment?: string
  createdAt: string
  status: 'STS06' | 'STS07' | 'STS08'
}

// ── Business rules (admin, snapshotted per request) ────────
export interface BusinessRules {
  maxTestsPerRequest: number
  proposedSlots: number
  minLeadHours: number
  labDecisionHours: number
  consultantDecisionHours: number
  minBoreholeDepth: number
  geofenceMeters: number
  vat: number
  labTimeoutAction: 'expire' | 'none'
  /** Which analysis path the smart engine uses, and what happens when one is unavailable (B.R.230). */
  enginePolicy: 'screen-then-cloud' | 'cloud-first' | 'local-first' | 'compare'
  /** عنوان خدمة ido_dual_ai — يُمرَّر عبر وكيل Frappe من /miyar */
  engineBaseUrl?: string
  autoApproveConsultant?: boolean
  quoteValidityDays?: number
  invoiceDueDays?: number
  sessionIdleMinutes?: number
  saacExpiryWarnDays?: number
  compliancePenalties?: { move: number; addedBorehole: number }
  sampleRetentionDays?: { soil: number; concrete: number }
  archiveCapacity?: number
  ratingDimensions?: { key: string; label: string; weight: number }[]
  /** التسعيرة المرجعية للمحرك السحابي — تُضبط في إعدادات المنصة. */
  engineCost?: { source?: string; monthlyBudgetSAR?: number; budgetCoversDocs?: number; localNote?: string; continuity?: string; sovereignty?: { cloud: string; local: string } }
}

export interface Notification { id: string; at: string; title: string; body: string; read: boolean; forRole: Role; forOrgId?: string; link?: string; tone?: 'ok' | 'warn' | 'danger' | 'info' }

// ── Governance / archive ───────────────────────────────────
export interface AuditEvent { id: string; at: string; actor: string; role: Role; org: string; action: string; entity: string; entityId: string; ip: string; severity: 'info' | 'notice' | 'warning' | 'critical'; detail?: string }
export interface Document { id: string; name: string; type: string; requestId?: string; contractId?: string; orgId: string; size: string; at: string; version: number; hash: string; retentionUntil: string; classification: string; file?: string }
export interface Invoice { id: string; contractId: string; requestId: string; contractorId: string; labId: string; amount: number; vat: number; vatRate?: number; total?: number; status: 'paid' | 'due' | 'overdue' | 'draft'; issuedAt: string; dueAt: string; paidAt?: string; channel?: string; zatcaUuid?: string; blocksCertificate?: boolean; items?: { description: string; refTestId: string; qty: number; rate: number; amount: number }[] }
export interface Policy { id: string; title: string; version: string; effective: string; owner: string; scope: string; status: 'ساري' | 'مسودة' | 'منتهٍ'; ref: string }
export interface Ticket { id: string; subject: string; category: string; status: string; by: string; requestId?: string; description: string; at: string; updatedAt?: string }

// ── Evidence layer (ISO/IEC 17025 §6.4/7.4/7.6/7.8) ────────
export type PhotoKind = string
export interface Photo {
  id: string; file: string; kind: PhotoKind; caption: string
  takenAt: string; lat?: number; lng?: number; accuracyM?: number; device: string
  requestId?: string; testId?: string; sampleId?: string; boreholeCode?: string; hash: string
}
export interface Equipment {
  id: string; labId: string; name: string; type: string; serial: string; range: string; resolution: string
  calibratedAt: string; calibrationDue: string; certificate: string; provider: string; status: string; location: string
}
export interface CustodyEvent { at: string; step: string; by: string; where: string; note?: string; tempC?: number }
export interface ArchivedSample {
  id: string; requestId: string; testId?: string; boreholeCode?: string; labId: string
  kind: string; designation: string; collectedAt: string; lat: number; lng: number; collectedBy: string
  dims: Record<string, string>; massG?: number; condition: string; status: string
  storage: string; retentionUntil: string; sealNo: string; photos: string[]; custody: CustodyEvent[]
}
export interface MethodSheet {
  refTestId: string; standard: string; title: string; form: string
  procedure: string[]; specimen: string; specimenFields: { key: string; label: string; unit: string }[]
  equipment: string[]; equipmentTypes: string[]
  environment: string; uncertainty: string; reporting: string; acceptance: string
}

// ── Platform vocabulary (served by miyar.api.masters) ──────
export type Tone = 'neutral' | 'info' | 'accent' | 'ok' | 'warn' | 'danger'
export interface CodedItem { id?: string; code: string; label: string }
export type OrgTypeDef = CodedItem & { canSelfRegister?: boolean; inDirectory?: boolean; operational?: boolean }
export interface StatusDef { code: string; ar: string; en: string; tone: Tone; entity: string }
export interface CodeToneDef { code: string; ar: string; tone: Tone; doc?: string }
export interface Masters {
  statuses: StatusDef[]
  studyPhases: { n: number; label: string }[]
  boreholeStatuses: CodeToneDef[]
  labSampleStatuses: CodeToneDef[]
  quoteStatuses: CodeToneDef[]
  invoiceStatuses: CodeToneDef[]
  auditSeverities: { code: string; ar: string; tone: Tone }[]
  engineStatuses: { code: string; ar: string; tone: Tone }[]
  engineResultTypes: { code: string; ar: string }[]
  roleLabels: { code: string; ar: string }[]
  positionLabels: { code: string; ar: string }[]
  permissionRows: { key: string; label: string }[]
  permissionColumns: { key: string; label: string }[]
  permissionMatrix: Record<string, string[]>
  orgTypes: (CodedItem & { canSelfRegister: boolean; inDirectory: boolean; operational: boolean })[]
  categories: { code: Category; label: string; group: string }[]
  cities: { name: string; parent: string; isGroup: boolean; lat: number | null; lng: number | null }[]
  uscs: { code: string; label: string; color: string; isRock: boolean }[]
  custodySteps: { code: string; label: string; sampleStatus: string }[]
  optionalLabTests: { code: string; label: string; method: string }[]
  seismicClasses: { code: string; label: string; vs30: string; nBar: string; su: string }[]
  sptClasses: { code: string; label: string; nMin: number; nMax: number }[]
  serviceTypes: CodedItem[]
  paymentTerms: CodedItem[]
  paymentChannels: CodedItem[]
  priorities: CodedItem[]
  siteConditions: CodedItem[]
  gradations: CodedItem[]
  soilColors: CodedItem[]
  moistures: CodedItem[]
  boreholeMethods: CodedItem[]
  weathers: CodedItem[]
  sampleKinds: CodedItem[]
  sampleTypes: CodedItem[]
  sampleConditions: CodedItem[]
  archiveKinds: CodedItem[]
  equipmentTypes: CodedItem[]
  photoKinds: CodedItem[]
  docTypes: CodedItem[]
  docClassifications: CodedItem[]
  ticketCategories: CodedItem[]
  ticketStatuses: CodedItem[]
  buildingTypes: CodedItem[]
  structureTypes: CodedItem[]
  foundationTypes: CodedItem[]
  specialties: CodedItem[]
  enginePolicies: (CodedItem & { detail?: string })[]
  engineProfiles: CodedItem[]
}

export interface MonthPoint { m: string; key: string; requests: number; completed: number; geotech: number; rejected: number; auto: number; revenue: number; sla: number }
export interface RegistrationPoint { m: string; key: string; labs: number; contractors: number; consultants: number }
export interface Analytics {
  monthly: MonthPoint[]
  registrations: RegistrationPoint[]
  categoryMix: { name: string; value: number }[]
  cityMix: { name: string; value: number }[]
  cityCategory: Record<string, Record<string, number>>
  totals: { requests: number; tests: number; orgs: number; studies: number }
}

export interface HelpCenter {
  guides: { id: string; title: string; audience: string; minutes: number; body: string }[]
  faqs: { id: string; q: string; a: string; roles: string[] }[]
  integrations: { code: string; title: string; status: string; note: string; lastChecked: string | null }[]
  links: { title: string; url: string }[]
  ecc: { code: string; title: string; total: number; implemented: number }[]
  support: { phone: string; emergency: string; email: string; hours: string }
}

export interface UserPreferences {
  calendar: string
  density: string
  home: string
  sms: boolean
  email: boolean
  push: boolean
  digest: boolean
}
export interface UserSession { id: string; at: string; ip?: string; status?: string; current: boolean }
export interface ScheduledJob { id: string; label: string; schedule: string }
export interface PendingRegistration { id: string; name: string; type: string; status: string; principal: string; city?: string; cr?: string; saac?: string; at: string }

export interface Knowledge {
  activeVersion: string
  table21: { code: string; label: string; floorsMin: number; floorsMax: number; areaMin: number; areaMax: number; baseCount: number; extraPerM2: number; countCap: number; depthTwoThirds: number; depthOneThird: number; special: boolean; rule: string }[]
  formulas: { key: string; label: string; formula: string; unit: string; inputs: string[] }[]
  analyticalFields: { key: string; label: string; source: string }[]
  recommendationFields: { key: string; label: string; notes: string }[]
  manualFields: { key: string; label: string; options: string[] }[]
  triggers: { code: string; label: string; condition: string; message: string; action: string; optionalTest: string }[]
  chemicalTests: { code: string; label: string; method: string; limit: string; unit: string; mandatory: boolean; matrix: string; needsGroundwater: boolean; source: string; effect: string }[]
  mandatorySampleTests: { sampleKind: string; refTestId: string; method: string; label: string; requiresAttachment: boolean; requiresValue: boolean; unit: string }[]
}

/** الحدود المرجعية بحسب الاختبار — key = حقل النتيجة */
export type RefLimits = Record<string, { key: string; rule: string; ref: string }[]>

/** صلاحيات الملحق 7.1 — المصفوفة نفسها محفوظة في `miyar.ui` وتصل مع الجلسة. */
export type Permission =
  | 'catalog.view' | 'catalog.manage'
  | 'directory.view' | 'profile.manage' | 'rating.create' | 'rating.moderate'
  | 'request.view' | 'request.create' | 'request.submit' | 'request.cancel' | 'request.retest'
  | 'request.plan' | 'request.decide' | 'test.execute' | 'test.submit' | 'output.review' | 'output.approve'
  | 'study.view' | 'study.prelim' | 'study.plan.approve' | 'study.fieldplan' | 'study.field' | 'study.lab' | 'study.analysis' | 'study.report.preview' | 'study.report.approve' | 'study.report.view'
  | 'delegation.view' | 'delegation.create' | 'delegation.decide' | 'delegation.edit'
  | 'admin.settings' | 'admin.reference' | 'admin.accounts' | 'admin.knowledge'
  | 'monitor.view' | 'results.view'
  | 'engine.run'
