import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Cpu, Cloud, HardDrive, ShieldCheck, ShieldAlert, Upload, Play, Coins,
  Scale, FileText, AlertTriangle, CheckCircle2, Trash2, Timer, GitCompare, Filter,
} from 'lucide-react'
import { PageHeader } from '@/ds/composite'
import {
  Section, Badge, Button, Callout, Field, Select, Segmented, Table, Th, Td,
  KV, Code, Empty, Toggle, cx,
} from '@/ds/primitives'
import {
  analyze, watchHealth, shouldEscalate, engineTarget, useFrappeEngineProxy,
  listEngineRuns, getEngineRun,
  ENGINE_PROFILES, STATUS_AR, STATUS_TONE, COST_REF, cloudMonthlySAR,
  resolveRoute, ROUTE_POLICY_AR,
  type AnalyzeResponse, type EngineHealth, type EngineMode, type EngineProfile,
  type EngineRunSummary, type RoutePolicy, type RunStage, type EvalStatus,
} from '@/lib/engine'
import { PathCard, ScopeGateCard, fmtSec } from './ResultView'
import { useStore } from '@/lib/store'
import { ago } from '@/lib/format'

const MODE_LABEL: Record<EngineMode, string> = { cloud: 'سحابي', local: 'محلي آمن', compare: 'مقارنة المسارين' }

const fmtSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const fmtSAR = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function Engine() {
  const toast = useStore(s => s.toast)
  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [healthReason, setHealthReason] = useState<string>()
  const [probed, setProbed] = useState(false)

  const [profile, setProfile] = useState<EngineProfile>(ENGINE_PROFILES[0])
  // the platform rule is the default; the operator may override it for a single run
  const rulePolicy = useStore(s => s.rules.enginePolicy)
  const [policy, setPolicy] = useState<RoutePolicy>(rulePolicy)
  /** Cloud usage suspended by the organisation — a real cost-control action, not a simulation. */
  const [outage, setOutage] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AnalyzeResponse | null>(null)
  const [stages, setStages] = useState<RunStage[]>([])
  const [err, setErr] = useState<string>()
  const [history, setHistory] = useState<EngineRunSummary[]>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [selectedRun, setSelectedRun] = useState<string>()
  const abort = useRef<AbortController | null>(null)
  const pick = useRef<HTMLInputElement>(null)

  const refreshHistory = async () => {
    if (!useFrappeEngineProxy()) return
    try {
      const rows = await listEngineRuns(50)
      setHistory(rows)
    } catch { /* keep last good list */ }
  }

  useEffect(() => watchHealth((h, reason) => { setHealth(h); setHealthReason(reason); setProbed(true) }), [])
  useEffect(() => { void refreshHistory() }, [])
  useEffect(() => () => abort.current?.abort(), [])

  const ctl = health?.meyar_engineering_controls
  const localUp = !!health?.local.reachable
  const cloudUp = !!health?.cloud.configured && !outage
  // The platform picks the path from policy + live availability, and explains the pick.
  const route = resolveRoute(policy, health, outage)

  const openRun = async (name: string) => {
    setHistoryBusy(true); setErr(undefined); setStages([])
    try {
      const out = await getEngineRun(name)
      setRes(out)
      setSelectedRun(name)
      if (out.profile) setProfile(out.profile as EngineProfile)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setHistoryBusy(false)
    }
  }

  const run = async () => {
    if (!file || !route.mode) return
    abort.current?.abort()
    const c = new AbortController(); abort.current = c
    setBusy(true); setErr(undefined); setRes(null); setStages([]); setSelectedRun(undefined)
    try {
      const first = await analyze(file, profile, route.mode, c.signal)
      setRes(first)
      if (first.engine_run) setSelectedRun(first.engine_run)
      void refreshHistory()

      if (first.scope_gate_stopped) {
        setStages([{ key: 'scope', label: 'بوابة مطابقة النطاق', ran: true, note: 'المستند خارج ملف التقييم — أُوقف قبل استدعاء أي نموذج', seconds: 0, cost: 0 }])
        toast({ title: 'أوقفت بوابة النطاق التحليل', body: 'لم يُستدعَ أي نموذج ولم تُصرف أي توكنات.', tone: 'warn' })
        return
      }
      if (route.failedOver) toast({ title: 'تحوّل تلقائي للمسار البديل', body: route.reason, tone: 'warn' })

      // screening policy: the local pass decides whether a paid cloud run is justified
      if (policy === 'screen-then-cloud' && route.mode === 'local' && first.local && cloudUp) {
        const d = shouldEscalate(first.local.result)
        const base: RunStage[] = [
          { key: 'scope', label: 'بوابة مطابقة النطاق', ran: true, note: 'المستند ضمن ملف التقييم', seconds: 0, cost: 0 },
          { key: 'local', label: 'الفحص المحلي', ran: true, note: d.reason, seconds: first.local.elapsed_seconds, cost: 0 },
        ]
        if (!d.escalate) {
          setStages([...base, { key: 'cloud', label: 'التحليل السحابي', ran: false, note: 'لم يُستدعَ — وُفِّرت تكلفة التحليل العميق', cost: 0 }])
          toast({ title: 'اكتفى المحرك بالفحص المحلي', body: d.reason, tone: 'info' })
          return
        }
        const deep = await analyze(file, profile, 'cloud', c.signal)
        setRes({ ...deep, local: first.local })
        if (deep.engine_run) setSelectedRun(deep.engine_run)
        void refreshHistory()
        setStages([...base, {
          key: 'cloud', label: 'التحليل السحابي', ran: true, note: 'تحليل عميق بعد اجتياز الفحص المحلي',
          seconds: deep.cloud?.elapsed_seconds, cost: deep.cloud?.usage?.cost ?? COST_REF.cloudPerDoc,
        }])
      }
    } catch (e) {
      if (c.signal.aborted) return
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (!c.signal.aborted) setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="المحرك الذكي — التحليل السحابي والمحلي"
        sub="تحليل التقارير الهندسية مقابل قواعد المعرفة المعتمدة ومتطلبات كود البناء السعودي"
        meta={<>
          <Badge tone={health ? 'ok' : probed ? 'danger' : 'neutral'} dot size="xs">
            {health ? <>متصل · <span className="ltr">{health.policy_version}</span></> : probed ? 'المحرك غير متاح' : 'جارٍ الفحص…'}
          </Badge>
          <Badge tone="neutral" size="xs"><span className="ltr text-[10px]">{engineTarget()}</span></Badge>
          {useFrappeEngineProxy() && <Badge tone="info" size="xs">محرك مدمج</Badge>}
          {ctl?.guardrails_loaded && <Badge tone="ok" size="xs"><ShieldCheck className="size-3" />الحواجز الهندسية محمّلة</Badge>}
          {ctl && !ctl.effective_for_production && <Badge tone="warn" size="xs"><ShieldAlert className="size-3" />غير معتمد إنتاجياً</Badge>}
          {ctl?.edition_gate?.required && <Badge tone="warn" size="xs">بوابة الإصدار مفعّلة</Badge>}
        </>}
      />

      {/* B.R.230 — engine failure must never stop the platform, and the user must be told */}
      {probed && !health && (
        <Callout tone="danger" className="mb-3">
          <b>المحرك الذكي غير متاح حالياً.</b> {healthReason}
          <div className="mt-1">لا يوقف هذا سير المنصة — تستمر جميع الإجراءات النظامية للدراسة الجيوتقنية، ويُسجَّل تعذّر إنتاج نتيجة دون إسنادها إلى أي مرجع (B.R.230).</div>
        </Callout>
      )}
      {probed && !!health && !cloudUp && !localUp && (
        <Callout tone="warn" className="mb-3">
          <b>لا يوجد مسار تحليل جاهز.</b>
          {health.error ? <> {health.error}</> : !health.cloud.configured
            ? ' مفتاح OpenRouter غير مضبوط على هذا الموقع.'
            : ' المسار المحلي غير متصل.'}
          <div className="mt-1 meta">مدير النظام: اضبط المفتاح في إعدادات معيار أو <span className="ltr">site_config.miyar_openrouter_api_key</span> وثبّت <span className="ltr">httpx jsonschema pymupdf</span>.</div>
        </Callout>
      )}

      <div className="grid grid-cols-12 gap-3">
        {/* ── left: run + results ── */}
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <Section title="تشغيل تحليل" icon={Play} desc="التقرير بصيغة PDF" bodyClass="p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ملف التقييم" hint="يحدد المحرك حزمة المعرفة وقواعد النطاق تلقائياً">
                <Select value={profile} onChange={e => setProfile(e.target.value as EngineProfile)} disabled={busy}>
                  {ENGINE_PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
              {/* a group of buttons must not sit inside a <label> — it would take the
                  label's text as each button's accessible name */}
              <div role="group" aria-label="سياسة التوجيه" className="min-w-0">
                <span className="mb-1 block text-[12px] font-semibold text-ink-700">سياسة التوجيه</span>
                <div className="flex h-9 items-center">
                  <Segmented value={policy} onChange={setPolicy} items={[
                    { value: 'screen-then-cloud', label: <span className="inline-flex items-center gap-1"><Filter className="size-3" />فحص ثم سحابي</span> },
                    { value: 'cloud-first', label: <span className="inline-flex items-center gap-1"><Cloud className="size-3" />سحابي</span> },
                    { value: 'local-first', label: <span className="inline-flex items-center gap-1"><HardDrive className="size-3" />محلي</span> },
                    { value: 'compare', label: 'مقارنة' },
                  ]} />
                </div>
                <span className="mt-1 block text-[11.5px] text-ink-500">
                  {policy === rulePolicy
                    ? <>سياسة المنصة المعتمدة من مدير النظام — <Code>{ROUTE_POLICY_AR[rulePolicy].label}</Code></>
                    : <>تجاوز لهذا التشغيل فقط · سياسة المنصة: <Code>{ROUTE_POLICY_AR[rulePolicy].label}</Code></>}
                </span>
              </div>
            </div>

            {/* What the policy actually resolved to, and why */}
            <div className={cx('mt-3 rounded-sm border px-3 py-2',
              !probed ? 'border-ink-200 bg-ink-25'
                : !route.mode ? 'border-danger-200 bg-danger-25'
                  : route.failedOver || route.degraded ? 'border-warn-300 bg-warn-25' : 'border-ink-200 bg-ink-25')}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="data-label">المسار المُنفَّذ</span>
                {!probed
                  ? <Badge tone="neutral" size="xs">جارٍ فحص الإتاحة…</Badge>
                  : route.mode
                    ? <Badge tone={route.failedOver || route.degraded ? 'warn' : 'accent'} size="xs">
                        {route.mode === 'compare' ? <GitCompare className="size-3" /> : route.mode === 'local' ? <HardDrive className="size-3" /> : <Cloud className="size-3" />}
                        {MODE_LABEL[route.mode]}
                      </Badge>
                    : <Badge tone="danger" size="xs">لا يوجد مسار متاح</Badge>}
                {probed && route.failedOver && <Badge tone="warn" size="xs"><AlertTriangle className="size-3" />تحوّل تلقائي</Badge>}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-700">
                {probed ? route.reason : 'يُقرأ توفّر المسارين من المحرك قبل تحديد مسار التنفيذ.'}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input ref={pick} type="file" accept="application/pdf,.pdf" className="hidden" id="engine-file"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setRes(null); setErr(undefined) }} />
              <Button variant="secondary" icon={Upload} onClick={() => pick.current?.click()} disabled={busy}>اختيار ملف PDF</Button>
              {file
                ? <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px]"><FileText className="size-3.5 shrink-0 text-brand-600" /><span className="truncate font-medium">{file.name}</span><span className="meta shrink-0 ltr">{fmtSize(file.size)}</span><button type="button" className="text-ink-400 hover:text-danger-600" aria-label="إزالة الملف" onClick={() => { setFile(null); setRes(null); if (pick.current) pick.current.value = '' }}><Trash2 className="size-3.5" /></button></span>
                : <span className="meta">لم يُختر ملف</span>}
              <span className="flex-1" />
              {busy
                ? <Button variant="secondary" onClick={() => { abort.current?.abort(); setBusy(false) }}>إيقاف</Button>
                : <Button icon={Play} disabled={!file || !health || !route.mode} onClick={run}>بدء التحليل</Button>}
            </div>

            {busy && route.mode && <Callout tone="info" compact className="mt-2"><Timer className="me-1 inline size-3.5" />جارٍ التحليل على {MODE_LABEL[route.mode]}… المسار المحلي قد يستغرق دقائق على وحدة رسومات محلية.</Callout>}
            {err && <Callout tone="danger" compact className="mt-2"><b>تعذّر التحليل:</b> {err}</Callout>}
          </Section>

          {stages.length > 0 && <StageStrip stages={stages} />}

          {res?.scope_gate_stopped && <ScopeGateCard res={res} />}

          {res && !res.scope_gate_stopped && (
            <>
              {(selectedRun || res.engine_run) && (
                <Callout tone="info" compact>
                  نتيجة محفوظة · <span className="ltr font-mono text-[11px]">{selectedRun || res.engine_run}</span>
                  {res.meta?.ran_at && <> · {ago(res.meta.ran_at)}</>}
                </Callout>
              )}
              {res.cloud && <PathCard run={res.cloud} tone="cloud" />}
              {res.local && <PathCard run={res.local} tone="local" />}
              {res.cloud_error && <Callout tone="danger" compact><b>فشل المسار السحابي:</b> {res.cloud_error}</Callout>}
              {res.local_error && <Callout tone="danger" compact><b>فشل المسار المحلي:</b> {res.local_error}</Callout>}
              {res.comparison && (
                <Section title="مقارنة المسارين" icon={Scale} desc="السياسة وحزمة المعرفة ومخطط المخرجات نفسها على الاثنين" bodyClass="p-3">
                  <Table>
                    <thead><tr><Th>المؤشر</Th><Th>سحابي</Th><Th>محلي آمن</Th><Th>الفرق</Th></tr></thead>
                    <tbody>
                      <tr><Td className="font-semibold">الحالة العامة</Td>
                        <Td><Badge tone={STATUS_TONE[res.comparison.cloud_status]} size="xs">{STATUS_AR[res.comparison.cloud_status]}</Badge></Td>
                        <Td><Badge tone={STATUS_TONE[res.comparison.local_status]} size="xs">{STATUS_AR[res.comparison.local_status]}</Badge></Td>
                        <Td><Badge tone={res.comparison.overall_status_same ? 'ok' : 'warn'} size="xs">{res.comparison.overall_status_same ? 'متطابقة' : 'مختلفة'}</Badge></Td></tr>
                      <tr><Td className="font-semibold">زمن التحليل</Td>
                        <Td className="num">{fmtSec(res.comparison.cloud_seconds)}</Td>
                        <Td className="num">{fmtSec(res.comparison.local_seconds)}</Td>
                        <Td className="meta">مقيس فعلياً</Td></tr>
                      <tr><Td className="font-semibold">المتطلبات المُقيَّمة</Td><Td className="num">{res.comparison.cloud_assessments}</Td><Td className="num">{res.comparison.local_assessments}</Td><Td /></tr>
                      <tr><Td className="font-semibold">التوصيات</Td><Td className="num">{res.comparison.cloud_recommendations}</Td><Td className="num">{res.comparison.local_recommendations}</Td><Td /></tr>
                    </tbody>
                  </Table>
                  {!res.comparison.overall_status_same && (
                    <Callout tone="warn" compact className="mt-2">اختلفت نتيجة المسارين — يُعرض الاختلاف صراحةً ولا يختار النظام أحدهما بصمت (GATE-08).</Callout>
                  )}
                </Section>
              )}
            </>
          )}

          <Section
            title="النتائج السابقة"
            icon={FileText}
            desc={useFrappeEngineProxy() ? `${history.length} تشغيل محفوظ` : 'متاح داخل معيار فقط'}
            bodyClass="p-0"
            actions={<Button size="xs" variant="ghost" disabled={historyBusy || busy} onClick={() => void refreshHistory()}>تحديث</Button>}
          >
            {!useFrappeEngineProxy() ? (
              <Empty icon={FileText} title="السجل داخل معيار" desc="عند التشغيل من /miyar تُحفظ كل التحليلات وتظهر هنا." />
            ) : history.length === 0 ? (
              <Empty icon={FileText} title="لا نتائج محفوظة بعد" desc="بعد أول تحليل ناجح سيظهر هنا ويمكنك إعادة فتحه في أي وقت." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>التشغيل</Th>
                    <Th>الملف</Th>
                    <Th>المسار</Th>
                    <Th>الحالة</Th>
                    <Th>الوقت</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => {
                    const st = (row.overall_status || 'NOT_EVALUABLE') as EvalStatus
                    const active = selectedRun === row.name
                    return (
                      <tr key={row.name} className={cx(active && 'bg-brand-25')}>
                        <Td className="ltr font-mono text-[11px]">{row.name}</Td>
                        <Td className="max-w-[180px] truncate text-[12px]"><span title={row.profile}>{row.profile || '—'}</span></Td>
                        <Td><Badge tone="neutral" size="xs">{MODE_LABEL[(row.mode as EngineMode) || 'cloud'] || row.mode}</Badge></Td>
                        <Td><Badge tone={STATUS_TONE[st] || 'neutral'} size="xs">{STATUS_AR[st] || st}</Badge></Td>
                        <Td className="meta whitespace-nowrap">{row.ran_at ? ago(row.ran_at) : '—'}</Td>
                        <Td>
                          <Button size="xs" variant={active ? 'primary' : 'ghost'} disabled={historyBusy || busy}
                            onClick={() => void openRun(row.name)}>
                            {active ? 'معروض' : 'عرض'}
                          </Button>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </Section>

          {!res && !busy && !err && (
            <Section title="النتيجة" bodyClass="p-0">
              <Empty icon={Cpu} title="لم يُحلَّل أي مستند بعد"
                desc={history.length ? 'اختر تشغيلاً من النتائج السابقة، أو ارفع تقريراً جديداً.' : 'اختر التقرير وملف التقييم المناسب ثم ابدأ التحليل.'} />
            </Section>
          )}
        </div>

        {/* ── right: live health + economics ── */}
        <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
          <Section title="حالة المحرك" icon={Cpu} desc="تُقرأ كل 15 ثانية" bodyClass="p-3">
            {health ? (
              <div className="grid gap-2.5">
                <PathStatus up={cloudUp} icon={Cloud} label="المسار السحابي"
                  detail={outage ? 'موقوف بقرار من المنشأة' : health.cloud.configured ? <span className="ltr">{health.cloud.model}</span> : 'غير مهيّأ'} />
                <PathStatus up={localUp} icon={HardDrive} label="المسار المحلي الآمن"
                  detail={localUp
                    ? <><span className="ltr">{health.local.model}</span> · سياق <span className="num">{health.local.num_ctx}</span></>
                    : 'غير مهيّأ في هذه البيئة'} />
                {/* Long Latin identifiers need their own direction and must wrap, not truncate */}
                <dl className="grid gap-y-2 border-t border-ink-100 pt-2.5">
                  {([
                    ['إصدار السياسة', health.policy_version],
                    ['حزمة التحكّم', ctl?.control_pack_version ?? '—'],
                    ['سجل البنود', ctl?.clause_registry_version ?? '—'],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3">
                      <dt className="data-label shrink-0">{k}</dt>
                      <dd className="ltr min-w-0 break-all text-end font-mono text-[11px] font-semibold text-brand-700">{v}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="data-label shrink-0">معتمد إنتاجياً</dt>
                    <dd><Badge tone={ctl?.effective_for_production ? 'ok' : 'warn'} size="xs">{ctl?.effective_for_production ? 'نعم' : 'لا'}</Badge></dd>
                  </div>
                </dl>
                {ctl?.edition_gate?.required && (
                  <Callout tone="warn" compact>
                    <b>بوابة الإصدار مفعّلة.</b> إصدار كود البناء السعودي SBC 303 الحاكم لهذا المشروع غير مثبَّت بعد.
                    <div className="mt-0.5">لا يُصدر المحرك حكم مطابقة نهائياً مع الكود قبل تثبيت الإصدار الحاكم واعتماد سجل البنود من خبير جيوتقني.</div>
                  </Callout>
                )}
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-500">{probed ? healthReason : 'جارٍ الفحص…'}</p>
            )}
          </Section>

          <Section title="استمرارية التشغيل" icon={ShieldCheck} desc="ما يحدث عند توقف الاشتراك السحابي" bodyClass="p-3">
            <div className="flex items-start gap-2 rounded-sm border border-ok-100 bg-ok-25 px-2.5 py-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-600" />
              <p className="text-[12.5px] leading-relaxed text-ink-800">{COST_REF.continuity}</p>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 rounded-sm border border-ink-200 p-2.5">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-ink-900">إيقاف استخدام المسار السحابي</div>
                <p className="meta">يوقف استهلاك الاشتراك ويحوّل التحليل إلى المسار المحلي</p>
              </div>
              <Toggle checked={outage} onChange={setOutage} />
            </div>
            {outage && (
              <Callout tone="warn" compact className="mt-2">
                المسار السحابي موقوف. تُنفَّذ سياسة «{ROUTE_POLICY_AR[policy].label}» على المسار المتاح، ولم تتوقف الدراسة.
              </Callout>
            )}
          </Section>

          <Section title="التكلفة والسيادة" icon={Coins} desc="وفق التسعيرة المرجعية المعتمدة" bodyClass="p-3">
            <KV cols={2} dense items={[
              { k: 'تكلفة المستند سحابياً', v: <span className="num">{COST_REF.cloudPerDoc.toFixed(2)} ريال</span> },
              { k: 'الميزانية المرجعية', v: <span className="num">{fmtSAR(COST_REF.monthlyBudgetSAR)} / شهر</span> },
              { k: 'تغطي حتى', v: <span className="num">{fmtSAR(COST_REF.budgetCoversDocs)} مستند</span> },
              { k: 'المسار المحلي', v: <Badge tone="ok" size="xs">سعة ثابتة</Badge> },
            ]} />
            <div className="mt-3">
              <div className="data-label mb-1.5">الإنفاق الشهري بنمو الحجم</div>
              <Table className="border-0">
                <thead><tr><Th>مستند / شهر</Th><Th>سحابي</Th><Th>محلي</Th></tr></thead>
                <tbody>
                  {[3000, 9000, 20000, 50000].map(v => {
                    const c = cloudMonthlySAR(v)
                    const over = c > COST_REF.monthlyBudgetSAR
                    return (
                      <tr key={v}>
                        <Td className="num">{fmtSAR(v)}</Td>
                        <Td className={cx('num', over && 'font-semibold text-danger-600')}>{fmtSAR(c)}</Td>
                        <Td className="num text-ok-700">{fmtSAR(COST_REF.monthlyBudgetSAR)}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
              <p className="meta mt-1.5">{COST_REF.localNote}</p>
              <p className="meta mt-1">المصدر: {COST_REF.source}.</p>
            </div>
          </Section>

          <Section title="ما يضمنه المسار المحلي" icon={ShieldCheck} bodyClass="p-3">
            <ul className="grid gap-1.5 text-[12px] text-ink-700">
              {[
                'لا يغادر المستند الجهاز ولا تُستدعى خدمة سحابية',
                'لا تكلفة استهلاك خارجية — التكلفة سعة لا استعمال',
                'سياسة التقييم وحزمة المعرفة ومخطط المخرجات نفسها في المسارين',
                'يبقى الحكم النهائي للمهندس المختص في الحالتين',
              ].map(t => <li key={t} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok-500" />{t}</li>)}
            </ul>
          </Section>
        </div>
      </div>

    </>
  )
}

/** What ran, what didn't, and what each step cost — the case for screening, in numbers. */
function StageStrip({ stages }: { stages: RunStage[] }) {
  const spent = stages.reduce((a, s) => a + (s.ran ? (s.cost ?? 0) : 0), 0)
  const skipped = stages.filter(s => !s.ran)
  return (
    <Section title="مراحل التنفيذ" icon={Filter} desc="لا يُستدعى المسار المدفوع إلا عند الحاجة" bodyClass="p-3">
      <ol className="grid gap-2">
        {stages.map((s, i) => (
          <li key={s.key} className={cx('flex items-start gap-3 rounded-sm border p-2.5',
            s.ran ? 'border-ink-200 bg-ink-0' : 'border-dashed border-ink-300 bg-ink-25')}>
            <span className={cx('num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
              s.ran ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-500')}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={cx('text-[12.5px] font-semibold', s.ran ? 'text-ink-900' : 'text-ink-500')}>{s.label}</span>
                {!s.ran && <Badge tone="ok" size="xs">لم يُستدعَ</Badge>}
                {s.seconds != null && s.ran && <span className="meta">{fmtSec(s.seconds)}</span>}
              </div>
              <p className="meta mt-0.5">{s.note}</p>
            </div>
            <span className={cx('num shrink-0 text-[12.5px] font-bold', (s.cost ?? 0) > 0 ? 'text-ink-900' : 'text-ok-600')}>
              {(s.cost ?? 0) > 0 ? `${(s.cost ?? 0).toFixed(2)} ريال` : '0'}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
        <span className="text-[12.5px] text-ink-700">تكلفة هذا المستند</span>
        <span className="num text-[15px] font-bold text-ink-900">{spent.toFixed(2)} ريال</span>
      </div>
      {skipped.length > 0 && (
        <Callout tone="ok" compact className="mt-2">
          وُفِّرت تكلفة التحليل السحابي لهذا المستند ({COST_REF.cloudPerDoc.toFixed(2)} ريال) — حسمه الفحص المحلي بلا استهلاك خارجي.
        </Callout>
      )}
    </Section>
  )
}

function PathStatus({ up, icon: Icon, label, detail }: { up: boolean; icon: typeof Cloud; label: string; detail: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm', up ? 'bg-ok-50 text-ok-700' : 'bg-ink-100 text-ink-500')}><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">{label}<Badge tone={up ? 'ok' : 'neutral'} dot size="xs">{up ? 'متاح' : 'غير متاح'}</Badge></div>
        <div className="meta break-words">{detail}</div>
      </div>
    </div>
  )
}