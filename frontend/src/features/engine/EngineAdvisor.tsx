import { useEffect, useRef, useState } from 'react'
import { Sparkles, Upload, Play, FileText, Trash2, ShieldAlert, Users, Timer, AlertTriangle, HelpCircle, XCircle } from 'lucide-react'
import { Drawer, Section, Badge, Button, Callout, Field, Select, Empty, cx } from '@/ds/primitives'
import {
  analyze, watchHealth, resolveRoute,
  ENGINE_PROFILES, STATUS_AR, STATUS_TONE,
  type AnalyzeResponse, type EngineHealth, type EngineProfile,
} from '@/lib/engine'
import { PathCard, ScopeGateCard } from './ResultView'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/format'

/**
 * Advisory use of the smart engine, for the reviewer who has to sign off.
 *
 * The real scenario at the ministry: an overloaded consultant delegates a request to a
 * newly hired engineer, who is reluctant to approve something they cannot fully judge.
 * They consult the engine first — it reads the report against the approved knowledge
 * pack and says what is missing, what conflicts, and what it cannot evaluate.
 *
 * It never approves. The decision and the statutory responsibility stay with the
 * reviewer, and the consultation itself is written to the audit trail.
 */
export default function EngineAdvisor({
  open, onClose, title, subtitle, requestId, testId, defaultProfile = ENGINE_PROFILES[0],
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  requestId: string
  testId?: string
  defaultProfile?: EngineProfile
}) {
  const user = useStore(s => s.user)!
  const delegations = useStore(s => s.delegations)
  const rulePolicy = useStore(s => s.rules.enginePolicy)
  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [probed, setProbed] = useState(false)
  const [profile, setProfile] = useState<EngineProfile>(defaultProfile)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AnalyzeResponse | null>(null)
  const [err, setErr] = useState<string>()
  const abort = useRef<AbortController | null>(null)
  const pick = useRef<HTMLInputElement>(null)

  // only poll while the drawer is open — this is a side panel, not a dashboard
  useEffect(() => { if (!open) return; return watchHealth((h) => { setHealth(h); setProbed(true) }, 20000) }, [open])
  useEffect(() => () => abort.current?.abort(), [])

  // the advisor never asks the reviewer to choose a path — it follows the platform rule
  const route = resolveRoute(rulePolicy, health)
  // acting under a delegation? that is exactly the case this feature exists for
  const delegation = delegations.find(d =>
    d.toUserId === user.id && d.requestId === requestId && d.status === 'STS23' && (!d.testId || d.testId === testId))

  const run = async () => {
    if (!file || !route.mode) return
    abort.current?.abort()
    const c = new AbortController(); abort.current = c
    setBusy(true); setErr(undefined); setRes(null)
    try {
      const out = await analyze(file, profile, route.mode, c.signal, { testRequest: requestId, study: undefined })
      setRes(out)
      // the consultation is itself a governance event — who asked, on what, and when
      useStore.setState(s => ({
        audit: [{
          id: uid('A'), at: new Date().toISOString(), actor: user.name, role: user.role, org: user.orgName,
          action: 'استشارة المحرك الذكي قبل القرار', entity: testId ? 'test' : 'request',
          entityId: testId ?? requestId, ip: '10.20.4.17', severity: 'notice' as const,
          detail: `${profile} · ${route.mode === 'local' ? 'محلي' : 'سحابي'} · ${STATUS_AR[out.cloud?.result.overall_status ?? out.local?.result.overall_status ?? 'NOT_EVALUABLE']}${(out as any).engine_run ? ` · ${(out as any).engine_run}` : ''}`,
        }, ...s.audit],
      }))
    } catch (e) {
      if (c.signal.aborted) return
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (!c.signal.aborted) setBusy(false)
    }
  }

  const run0 = res?.cloud ?? res?.local
  const r = run0?.result

  return (
    <Drawer open={open} onClose={onClose} title="استشارة المحرك الذكي" sub="رأي استشاري قبل اتخاذ القرار — لا يُغني عن مسؤوليتك النظامية" width="w-[640px]">
      <div className="grid gap-3">
        <Callout tone="warn">
          <b>هذه استشارة، وليست قراراً.</b> المحرك يقرأ المستند مقابل حزمة المعرفة المعتمدة ويُظهر ما ينقص وما يتعارض
          وما لا يمكن تقييمه. الاعتماد أو الرفض — والمسؤولية النظامية عنه — يبقيان عليك وحدك.
        </Callout>

        <Section title="محل المراجعة" bodyClass="p-3">
          <div className="text-[13px] font-semibold text-ink-900">{title}</div>
          {subtitle && <div className="meta mt-0.5">{subtitle}</div>}
          {delegation && (
            <div className="mt-2 flex items-start gap-2 rounded-sm border border-info-100 bg-info-25 px-2.5 py-2">
              <Users className="mt-0.5 size-3.5 shrink-0 text-info-600" />
              <p className="text-[12px] leading-relaxed text-ink-800">
                تراجع هذا البند بموجب <b>تفويض فعّال</b> ({delegation.type === 'direct' ? 'مباشر' : 'غير مباشر'}
                {delegation.testId ? ' — على اختبار محدد' : ' — على الطلب كاملاً'}). الاستشارة وقرارك يُسجَّلان باسمك في سجل التدقيق.
              </p>
            </div>
          )}
        </Section>

        <Section title="المستند محل الاستشارة" bodyClass="p-3">
          <Field label="ملف التقييم" hint="يحدد حزمة المعرفة وقواعد النطاق التي يُقاس عليها المستند">
            <Select value={profile} onChange={e => setProfile(e.target.value as EngineProfile)} disabled={busy}>
              {ENGINE_PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input ref={pick} type="file" accept="application/pdf,.pdf" className="hidden" id="advisor-file"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setRes(null); setErr(undefined) }} />
            <Button variant="secondary" size="sm" icon={Upload} onClick={() => pick.current?.click()} disabled={busy}>اختيار التقرير</Button>
            {file
              ? <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px]"><FileText className="size-3.5 shrink-0 text-brand-600" /><span className="truncate font-medium">{file.name}</span><button type="button" aria-label="إزالة الملف" className="text-ink-400 hover:text-danger-600" onClick={() => { setFile(null); setRes(null); if (pick.current) pick.current.value = '' }}><Trash2 className="size-3.5" /></button></span>
              : <span className="meta">لم يُختر ملف</span>}
            <span className="flex-1" />
            {busy
              ? <Button variant="secondary" size="sm" onClick={() => { abort.current?.abort(); setBusy(false) }}>إيقاف</Button>
              : <Button size="sm" icon={Play} disabled={!file || !route.mode} onClick={run}>استشر المحرك</Button>}
          </div>
          {probed && !health && <Callout tone="danger" compact className="mt-2">المحرك غير متاح — يمكنك المتابعة واتخاذ قرارك دون استشارة (B.R.230).</Callout>}
          {health && route.mode && <p className="meta mt-2">سيُنفَّذ على المسار {route.mode === 'local' ? 'المحلي الآمن' : route.mode === 'compare' ? 'المزدوج' : 'السحابي'}{route.failedOver && ' — تحوّل تلقائي'}.</p>}
          {busy && <Callout tone="info" compact className="mt-2"><Timer className="me-1 inline size-3.5" />جارٍ التحليل…</Callout>}
          {err && <Callout tone="danger" compact className="mt-2"><b>تعذّرت الاستشارة:</b> {err}</Callout>}
        </Section>

        {r && <AdvisorVerdict res={res!} />}

        {res?.scope_gate_stopped
          ? <ScopeGateCard res={res} />
          : <>
              {res?.cloud && <PathCard run={res.cloud} tone="cloud" />}
              {res?.local && <PathCard run={res.local} tone="local" />}
            </>}

        {!res && !busy && !err && (
          <Section title="رأي المحرك" bodyClass="p-0">
            <Empty icon={Sparkles} title="لم تُطلب استشارة بعد"
              desc="ارفع نسخة التقرير محل المراجعة واضغط «استشر المحرك»." />
          </Section>
        )}
      </div>
    </Drawer>
  )
}

/** The three signals a reviewer actually needs before signing, above the detail. */
function AdvisorVerdict({ res }: { res: AnalyzeResponse }) {
  const run = res.cloud ?? res.local
  if (!run) return null
  const r = run.result
  const bad = r.assessments.filter(a => a.status === 'NON_COMPLIANT').length
  const signals = [
    { k: 'متطلبات غير متوافقة', v: bad, icon: XCircle, tone: bad ? 'danger' : 'ok' },
    { k: 'تعارضات', v: r.conflicts.length, icon: AlertTriangle, tone: r.conflicts.length ? 'danger' : 'ok' },
    { k: 'بيانات ناقصة', v: r.missing_information.length, icon: HelpCircle, tone: r.missing_information.length ? 'warn' : 'ok' },
  ] as const
  const blocking = bad > 0 || r.conflicts.length > 0 || r.overall_status === 'NOT_EVALUABLE'
  return (
    <Section title="خلاصة الاستشارة" icon={Sparkles} bodyClass="p-3"
      actions={<Badge tone={STATUS_TONE[r.overall_status]} dot size="xs">{STATUS_AR[r.overall_status]}</Badge>}>
      <div className="grid grid-cols-3 gap-2">
        {signals.map(s => (
          <div key={s.k} className={cx('rounded-sm border px-2.5 py-2 text-center',
            s.tone === 'danger' ? 'border-danger-200 bg-danger-25' : s.tone === 'warn' ? 'border-warn-200 bg-warn-25' : 'border-ok-100 bg-ok-25')}>
            <s.icon className={cx('mx-auto mb-1 size-4', s.tone === 'danger' ? 'text-danger-600' : s.tone === 'warn' ? 'text-warn-600' : 'text-ok-600')} />
            <div className="num text-[19px] font-bold leading-none text-ink-900">{s.v}</div>
            <div className="mt-1 text-[11px] leading-tight text-ink-600">{s.k}</div>
          </div>
        ))}
      </div>
      <Callout tone={blocking ? 'warn' : 'ok'} compact className="mt-3">
        {blocking
          ? <><b>يلزم النظر قبل الاعتماد.</b> توجد بنود غير متوافقة أو تعارضات أو نقص يمنع الحكم — راجعها في التفصيل أدناه قبل قرارك.</>
          : <><b>لم يرصد المحرك مانعاً.</b> هذا لا يعني الاعتماد — راجع التفاصيل وقرّر بنفسك.</>}
      </Callout>
      {r.human_engineering_review_required && (
        <Badge tone="warn" size="xs" className="mt-2"><ShieldAlert className="size-3" />مخرجات تتطلب مراجعة مهندس مختص</Badge>
      )}
    </Section>
  )
}
