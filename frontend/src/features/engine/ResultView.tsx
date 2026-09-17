import { useMemo, type ReactNode } from 'react'
import {
  Cloud, HardDrive, ShieldAlert, Ban, AlertTriangle, CheckCircle2, Timer,
  XCircle, HelpCircle, MinusCircle, Search, ClipboardList, Lightbulb, GitCompare,
  type LucideIcon,
} from 'lucide-react'
import { Section, Kpi, Badge, Callout, Table, Th, KV, Code, cx } from '@/ds/primitives'
import {
  STATUS_AR, STATUS_TONE, RESULT_TYPE_AR, COST_REF,
  type AnalyzeResponse, type PathRun, type EvalStatus, type Assessment,
} from '@/lib/engine'

/* Shared rendering of an engine result. Used by the engine screen and by the
   advisory drawer that a delegated reviewer opens before deciding. */

/** A verdict has to read at a glance, not only as a coloured word. */
export const STATUS_ICON: Record<EvalStatus, LucideIcon> = {
  COMPLIANT: CheckCircle2,
  NON_COMPLIANT: XCircle,
  PARTIALLY_COMPLIANT: MinusCircle,
  NOT_EVALUABLE: HelpCircle,
  NOT_APPLICABLE: Ban,
}
/** Order the summary strip by severity, not by enum order. */
export const STATUS_ORDER: EvalStatus[] = ['NON_COMPLIANT', 'PARTIALLY_COMPLIANT', 'NOT_EVALUABLE', 'COMPLIANT', 'NOT_APPLICABLE']
/** Evidence cells hold prose, so they wrap and sit at the top of their row. */
const EV_TD = 'border-t border-ink-100 px-3 py-2 align-top text-[12px] leading-snug break-words text-ink-800'

/** Left border of the "what the report says" panel, tinted by verdict. */
const STATUS_EDGE: Record<EvalStatus, string> = {
  COMPLIANT: 'border-ok-400',
  NON_COMPLIANT: 'border-danger-400',
  PARTIALLY_COMPLIANT: 'border-warn-400',
  NOT_EVALUABLE: 'border-ink-300',
  NOT_APPLICABLE: 'border-ink-300',
}
export const fmtSec = (s: number) => s >= 1 ? `${s.toFixed(1)} ث` : s > 0 ? `${Math.round(s * 1000)} ملّي` : 'فوري'


/** The scope gate stopped the run before any model was called — the cheapest possible refusal. */
export function ScopeGateCard({ res }: { res: AnalyzeResponse }) {
  const run = res.cloud ?? res.local
  if (!run) return null
  const g = run.scope_gate
  const r = run.result
  return (
    <Section title="أوقفت بوابة النطاق التحليل" icon={Ban} desc="قبل استدعاء أي نموذج" className="border-warn-300 ring-2 ring-warn-100" bodyClass="p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="الحالة" value={<span className="text-[15px]">{STATUS_AR[r.overall_status]}</span>} tone="warn" />
        <Kpi label="التوكنات المصروفة" value={run.usage?.total_tokens ?? 0} tone="ok" hint="لم يُستدعَ نموذج" />
        <Kpi label="التكلفة" value={`${run.usage?.cost ?? 0}`} unit="ريال" tone="ok" />
        <Kpi label="زمن القرار" value={fmtSec(run.elapsed_seconds)} tone="ok" hint="فحص حتمي" />
      </div>
      <Callout tone="ok" compact className="mt-3"><b>الخصوصية:</b> {run.privacy}</Callout>
      <div className="mt-3"><KV cols={2} dense items={[
        { k: 'تصنيف المستند', v: r.document.type },
        { k: 'التخصص', v: r.document.discipline },
      ]} /></div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-700">{r.document.scope_reason}</p>
      {g && (
        <div className="mt-3 rounded-sm border border-ink-200 p-2.5">
          <div className="data-label mb-1.5">القرار الحتمي — لا تدخّل نموذج</div>
          <div className="flex flex-wrap gap-4 text-[12px]">
            {Object.entries(g.scores).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="text-ink-600">{k === 'geotechnical' ? 'جيوتقني' : 'إنشائي'}</span>
                <span className={cx('num font-bold', k === g.detected ? 'text-brand-700' : 'text-ink-400')}>{v}</span>
              </span>
            ))}
          </div>
          {!!g.hits[g.detected]?.length && (
            <div className="mt-2 flex flex-wrap gap-1">
              {g.hits[g.detected].slice(0, 12).map(h => <span key={h} className="ltr rounded-xs bg-ink-100 px-1.5 py-px font-mono text-[10.5px] text-ink-600">{h}</span>)}
            </div>
          )}
        </div>
      )}
      {!!r.missing_information.length && (
        <div className="mt-3">
          <div className="data-label mb-1.5">المطلوب لإجراء تقييم صحيح</div>
          <ul className="grid gap-1 text-[12px] text-ink-700">
            {r.missing_information.map(m => <li key={m} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-warn-500" />{m}</li>)}
          </ul>
        </div>
      )}
    </Section>
  )
}

export function PathCard({ run, tone }: { run: PathRun; tone: 'cloud' | 'local' }) {
  const r = run.result
  const safety = r._engineering_safety
  const isLocal = tone === 'local'
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of r.assessments) c[a.status] = (c[a.status] ?? 0) + 1
    return c
  }, [r.assessments])
  const docCost = isLocal ? 0 : (run.usage?.cost ?? COST_REF.cloudPerDoc)

  return (
    <Section
      title={isLocal ? 'المسار المحلي الآمن' : 'المسار السحابي'}
      icon={isLocal ? HardDrive : Cloud}
      desc={run.model}
      bodyClass="p-3"
      actions={<Badge tone={STATUS_TONE[r.overall_status]} dot size="xs">{STATUS_AR[r.overall_status]}</Badge>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="زمن التحليل" value={fmtSec(run.elapsed_seconds)} icon={Timer} hint="مقيس فعلياً" />
        <Kpi label="المتطلبات المُقيَّمة" value={r.assessments.length} />
        <Kpi label="أدلة مستخرجة" value={r.evidence.length} />
        <Kpi label="تكلفة المستند" value={docCost === 0 ? '0' : docCost.toFixed(2)} unit="ريال" tone={docCost === 0 ? 'ok' : 'neutral'} hint={isLocal ? 'لا استهلاك خارجي' : 'بسعر العرض المرجعي'} />
      </div>

      <Callout tone={isLocal ? 'ok' : 'info'} compact className="mt-3"><b>الخصوصية:</b> {run.privacy}</Callout>

      {safety && (
        <div className="mt-3 rounded-sm border border-warn-200 bg-warn-25 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-warn-800"><ShieldAlert className="size-3.5" />بوابة السلامة الهندسية</div>
          <KV cols={2} dense items={[
            { k: 'أحكام مُخفَّضة إلى «غير قابل للتقييم»', v: <span className="num font-bold">{safety.downgraded_assessments}</span> },
            { k: 'بوابة الإصدار', v: <Badge tone={safety.edition_gate_required ? 'warn' : 'ok'} size="xs">{safety.edition_gate_required ? 'مفعّلة' : 'مغلقة'}</Badge> },
            { k: 'مراجعة مهندس مختص', v: <Badge tone={safety.human_review_required ? 'warn' : 'neutral'} size="xs">{safety.human_review_required ? 'إلزامية' : 'غير مطلوبة'}</Badge> },
            { k: 'إصدار الحواجز', v: <Code>{safety.guardrails_version}</Code> },
          ]} />
          {safety.downgraded_assessments > 0 && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-warn-800">
              خفّضت البوابة {safety.downgraded_assessments} حكم مطابقة لأن المرجع غير قابل للتتبع أو غير معتمد إنتاجياً أو لأن إصدار SBC 303 الحاكم غير مؤكد. هذا هو الفرق بين «مطابق» و«لا أملك ما يكفي للحكم».
            </p>
          )}
        </div>
      )}

      {/* Reading order follows how an engineer reads a report: summary, then the evidence
          pulled out of it, then the criteria it is judged against, then what is unresolved. */}
      <Block title="الملخص التنفيذي" icon={ClipboardList}>
        <p className="text-[13px] leading-[1.9] text-ink-800">{r.executive_summary}</p>
      </Block>

      {!!r.evidence.length && (
        <Block title="الأدلة المستخرجة من التقرير" icon={Search} count={r.evidence.length}
          note="قيم وردت في المستند نفسه — تُنقل كما هي ولا تُستخدم بذاتها كمعيار قبول">
          <Table>
            <thead><tr><Th className="w-40">النوع</Th><Th className="w-32">المعرّف</Th><Th className="w-36">القيمة</Th><Th className="w-32">الموقع / العمق</Th><Th className="w-28">المصدر</Th><Th>ما ذكره التقرير</Th></tr></thead>
            <tbody>
              {/* plain cells: the primitive centres content vertically, which reads badly
                  once a row holds multi-line prose */}
              {r.evidence.map((e, i) => (
                <tr key={i}>
                  <td className={EV_TD + ' font-medium'}>{e.evidence_type || '—'}</td>
                  <td className={EV_TD}>{e.identifier || '—'}</td>
                  <td className={EV_TD}><span className="font-semibold text-ink-900">{e.value || '—'}</span>{e.unit && <span className="meta"> {e.unit}</span>}</td>
                  <td className={EV_TD}>{e.location_or_depth || '—'}</td>
                  <td className={EV_TD + ' text-[11.5px] text-ink-600'}>{e.source_page_or_section || '—'}</td>
                  <td className={EV_TD + ' leading-relaxed'}>{e.report_conclusion || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Block>
      )}

      {!!r.assessments.length && (
        <Block title="مطابقة المتطلبات" icon={GitCompare} count={r.assessments.length}
          note="لكل متطلب: ما يفرضه المرجع المعتمد مقابل ما ورد فعلاً في التقرير">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {STATUS_ORDER.filter(s => counts[s]).map(s => {
              const I = STATUS_ICON[s]
              return <Badge key={s} tone={STATUS_TONE[s]} size="sm"><I className="size-3" />{STATUS_AR[s]}<span className="num font-bold">{counts[s]}</span></Badge>
            })}
          </div>
          <div className="grid gap-2.5">
            {r.assessments.map((a, i) => <AssessmentCard key={`${a.requirement_id}-${i}`} a={a} />)}
          </div>
        </Block>
      )}

      {!!r.conflicts.length && (
        <Block title="تعارضات مسجَّلة" icon={GitCompare} count={r.conflicts.length}
          note="لا يختار النظام أحد المصدرين — يُسجَّل التعارض ويُمنع الحكم المتأثر به">
          <div className="grid gap-2.5">
            {r.conflicts.map((c, i) => (
              <div key={i} className="overflow-hidden rounded-md border border-danger-200">
                <div className="flex items-start gap-2 bg-danger-25 px-3 py-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-600" />
                  <p className="text-[12.5px] font-semibold leading-relaxed text-danger-800">{c.description}</p>
                </div>
                <div className="grid sm:grid-cols-2">
                  {([['المصدر الأول', c.source_a], ['المصدر الثاني', c.source_b]] as const).map(([k, v], j) => (
                    <div key={k} className={cx('border-t border-ink-100 p-3', j === 0 && 'sm:border-e sm:border-e-ink-100')}>
                      <div className="data-label mb-1">{k}</div>
                      <p className="text-[12.5px] leading-relaxed break-words text-ink-800">{v || '—'}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-ink-100 bg-ink-25 px-3 py-2">
                  <span className="data-label">الإجراء المطلوب</span>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-800">{c.action_required || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {!!r.missing_information.length && (
        <Block title="بيانات ناقصة تمنع الحكم" icon={HelpCircle} count={r.missing_information.length}
          note="نقص جوهري لا يُحوَّل إلى «متوافق جزئياً» — يُسجَّل كغير قابل للتقييم">
          <ul className="grid gap-1.5">
            {r.missing_information.map((m, i) => (
              <li key={i} className="flex items-start gap-2 rounded-sm border border-warn-100 bg-warn-25 px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-800">
                <MinusCircle className="mt-0.5 size-3.5 shrink-0 text-warn-600" />{m}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {!!r.analytical_findings.length && (
        <Block title="الاستنتاجات التحليلية" icon={Lightbulb} count={r.analytical_findings.length}>
          <div className="grid gap-2">
            {r.analytical_findings.map((f, i) => (
              <div key={i} className="rounded-sm border border-ink-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed font-medium text-ink-900">{f.finding}</p>
                  <Badge tone="info" size="xs">{RESULT_TYPE_AR[f.result_type] ?? f.result_type}</Badge>
                </div>
                <dl className="mt-2 grid gap-1 border-t border-ink-100 pt-2 sm:grid-cols-2">
                  <Meta k="الأساس" v={f.basis} /><Meta k="المرجع" v={f.reference} />
                </dl>
              </div>
            ))}
          </div>
        </Block>
      )}

      {!!r.engineering_recommendations.length && (
        <Block title="التوصيات الهندسية" icon={Lightbulb} count={r.engineering_recommendations.length}>
          <div className="grid gap-2">
            {r.engineering_recommendations.map((c, i) => (
              <div key={i} className="rounded-sm border border-ink-200 p-3">
                <p className="text-[12.5px] leading-relaxed font-medium text-ink-900">{c.recommendation}</p>
                <dl className="mt-2 grid gap-1 border-t border-ink-100 pt-2 sm:grid-cols-2">
                  <Meta k="الأساس" v={c.basis} /><Meta k="المرجع" v={c.reference} />
                </dl>
                {c.human_review_required && <Badge tone="warn" size="xs" className="mt-2"><ShieldAlert className="size-3" />تتطلب مراجعة مهندس مختص</Badge>}
              </div>
            ))}
          </div>
        </Block>
      )}

      <div className="mt-4 rounded-sm border-s-[3px] border-brand-500 bg-ink-25 px-3 py-2.5">
        <div className="data-label mb-1">الخلاصة</div>
        <p className="text-[12.5px] leading-relaxed text-ink-800">{r.overall_conclusion}</p>
        {r.human_engineering_review_required && (
          <Badge tone="warn" size="xs" className="mt-2"><ShieldAlert className="size-3" />لا تُعتمد هذه المخرجات دون مراجعة مهندس مختص</Badge>
        )}
      </div>
    </Section>
  )
}

/** A labelled band inside a result card — keeps every section announced the same way. */
function Block({ title, icon: Icon, count, note, children }: { title: string; icon: LucideIcon; count?: number; note?: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-ink-100 pt-3 first:mt-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h4 className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink-900"><Icon className="size-4 text-brand-600" />{title}</h4>
        {count != null && <span className="num rounded-full bg-ink-100 px-1.5 text-[10.5px] font-semibold text-ink-600">{count}</span>}
        {note && <span className="meta w-full sm:w-auto">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Meta({ k, v }: { k: string; v?: string }) {
  if (!v) return null
  return <div className="min-w-0"><dt className="data-label">{k}</dt><dd className="text-[11.5px] leading-relaxed break-words text-ink-600">{v}</dd></div>
}

/**
 * One requirement, shown as the comparison it actually is: what the approved reference
 * demands on one side, what the uploaded report actually contains on the other.
 */
function AssessmentCard({ a }: { a: Assessment }) {
  const I = STATUS_ICON[a.status]
  const tone = STATUS_TONE[a.status]
  return (
    <article className="overflow-hidden rounded-md border border-ink-200 bg-ink-0">
      <header className={cx('flex flex-wrap items-start gap-x-2 gap-y-1 border-b border-ink-100 px-3 py-2',
        a.status === 'NON_COMPLIANT' ? 'bg-danger-25' : a.status === 'COMPLIANT' ? 'bg-ok-25' : a.status === 'PARTIALLY_COMPLIANT' ? 'bg-warn-25' : 'bg-ink-25')}>
        <I className={cx('mt-0.5 size-4 shrink-0',
          tone === 'ok' ? 'text-ok-600' : tone === 'danger' ? 'text-danger-600' : tone === 'warn' ? 'text-warn-600' : 'text-ink-500')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="ltr font-mono text-[11px] font-bold text-brand-700">{a.requirement_id}</span>
            {a.knowledge_rule_id && <span className="ltr meta font-mono">{a.knowledge_rule_id}</span>}
          </div>
          {a.requirement_text && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-800">{a.requirement_text}</p>}
        </div>
        <Badge tone={tone} size="xs" className="shrink-0">{STATUS_AR[a.status]}</Badge>
      </header>

      <div className="grid sm:grid-cols-2">
        {/* required side */}
        <div className="border-b border-ink-100 p-3 sm:border-b-0 sm:border-e sm:border-e-ink-100">
          <div className="data-label mb-1.5 text-brand-700">المطلوب وفق المرجع</div>
          <p className="text-[12.5px] leading-relaxed break-words text-ink-900">{a.required_condition_or_limit || <span className="text-ink-400">لم يُحدَّد حد قبول معتمد</span>}</p>
          {(a.technical_reference || a.knowledge_version) && (
            <dl className="mt-2 grid gap-1 border-t border-ink-100 pt-2">
              <Meta k="المرجع الفني" v={a.technical_reference} />
              <Meta k="إصدار حزمة المعرفة" v={a.knowledge_version} />
            </dl>
          )}
        </div>
        {/* observed side — tinted edge carries the verdict */}
        <div className={cx('border-s-[3px] p-3', STATUS_EDGE[a.status])}>
          <div className="data-label mb-1.5">الوارد في التقرير</div>
          <p className="text-[12.5px] leading-relaxed break-words text-ink-900">
            {a.measured_value || <span className="text-ink-400">لا توجد قيمة مقاسة</span>}
            {a.measured_unit && <span className="meta"> {a.measured_unit}</span>}
          </p>
          {(a.evidence || a.source_location) && (
            <dl className="mt-2 grid gap-1 border-t border-ink-100 pt-2">
              <Meta k="الدليل" v={a.evidence} />
              <Meta k="موضعه في المستند" v={a.source_location} />
            </dl>
          )}
        </div>
      </div>

      {a.reasoning_summary && (
        <footer className="border-t border-ink-100 bg-ink-25 px-3 py-2">
          <div className="data-label mb-0.5">سبب الحكم</div>
          <p className="text-[12px] leading-relaxed text-ink-700">{a.reasoning_summary}</p>
        </footer>
      )}
    </article>
  )
}
