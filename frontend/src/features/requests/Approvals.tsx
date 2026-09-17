import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, ShieldAlert, Timer, History } from 'lucide-react'
import { useStore, useSel, visibleRequests } from '@/lib/store'
import { PageHeader, Countdown } from '@/ds/composite'
import { Kpi, Section, Badge, StatusPill, Code, Chip, ButtonLink, cx } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { Donut, STATUS_FILL } from '@/ds/charts'
import { fmtDate, fmtSAR, ago } from '@/lib/format'
import type { TestRequest, TestItem } from '@/lib/types'

type Row = { r: TestRequest; t: TestItem }

/** Consultant queue: every lab output that awaits (or received) the consultant's decision — test-level, not request-level. */
export default function Approvals() {
  const nav = useNavigate()
  const reqs = useSel(visibleRequests)
  const orgs = useStore(s => s.orgs)
  const refTests = useStore(s => s.refTests)
  const rules = useStore(s => s.rules)
  const [quick, setQuick] = useState<'pending' | 'decided' | 'all'>('pending')
  const canApprove = useStore(s => s.can)('output.approve')
  const org = (id: string) => orgs.find(o => o.id === id)?.name ?? id
  const name = (id: string) => refTests.find(t => t.id === id)?.nameAr ?? id
  const all: Row[] = reqs.flatMap(r => r.tests.filter(t => ['STS19', 'STS20', 'STS21'].includes(t.status)).map(t => ({ r, t })))
  const pending = all.filter(x => x.t.status === 'STS19')
  const decided = all.filter(x => x.t.status !== 'STS19')
  const rows = quick === 'pending' ? pending : quick === 'decided' ? decided : all
  const urgent = pending.filter(x => x.t.deadlineAt && new Date(x.t.deadlineAt).getTime() - Date.now() < (rules.consultantDecisionHours / 4) * 36e5)
  const auto = decided.filter(x => x.t.autoApproved).length
  const rejected = decided.filter(x => x.t.status === 'STS21').length
  const avgHours = (() => { const d = decided.filter(x => x.t.submittedAt && x.t.decidedAt && !x.t.autoApproved); if (!d.length) return 0; return Math.round(d.reduce((a, x) => a + (new Date(x.t.decidedAt!).getTime() - new Date(x.t.submittedAt!).getTime()) / 36e5, 0) / d.length) })()
  const cols: Column<Row>[] = [
    { key: 'req', header: 'الطلب', width: '140px', sortValue: x => x.r.id, exportValue: x => x.r.id, cell: x => <div className="whitespace-nowrap"><Link to={`/requests/${x.r.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-brand-700 hover:underline">{x.r.id}</Link>{x.r.priority !== 'عادية' && <Badge tone={x.r.priority === 'حرجة' ? 'danger' : 'warn'} size="xs" className="ms-1">{x.r.priority}</Badge>}</div> },
    { key: 'test', header: 'المخرج', sortValue: x => name(x.t.refTestId), exportValue: x => name(x.t.refTestId), cell: x => <div className="min-w-0"><div className="whitespace-nowrap font-medium">{name(x.t.refTestId)}</div><div className="meta truncate">{x.r.project}</div></div> },
    { key: 'method', header: 'الطريقة', width: '110px', cell: x => <Code>{x.t.method}</Code> },
    { key: 'lab', header: 'المختبر', width: '160px', sortValue: x => org(x.r.labId), exportValue: x => org(x.r.labId), cell: x => <span className="block max-w-40 truncate text-[12px]">{org(x.r.labId)}</span> },
    { key: 'result', header: 'النتيجة', cell: x => <div className="flex flex-wrap gap-1">{x.t.result ? Object.entries(x.t.result).slice(0, 3).map(([k, v]) => { const f = refTests.find(t => t.id === x.t.refTestId)?.resultFields?.find(f => f.key === k); return <span key={k} className="whitespace-nowrap rounded-xs bg-ink-50 px-1.5 py-0.5 text-[11px]"><span className="text-ink-500">{f?.label.split(' ')[0] ?? k}</span> <b className="num">{v}</b> <span className="text-ink-400">{f?.unit}</span></span> }) : <span className="meta">تقرير مرفق</span>}</div> },
    { key: 'submitted', header: 'رُفع', width: '120px', sortValue: x => x.t.submittedAt ?? '', exportValue: x => fmtDate(x.t.submittedAt), cell: x => <div className="whitespace-nowrap"><div className="num text-[12px]">{fmtDate(x.t.submittedAt)}</div><div className="meta">{x.t.submittedAt ? ago(x.t.submittedAt) : '—'}</div></div> },
    { key: 'status', header: 'الحالة', width: '170px', sortValue: x => x.t.status, cell: x => <div className="grid gap-1 whitespace-nowrap"><span className="flex items-center gap-1"><StatusPill code={x.t.status} size="xs" />{x.t.autoApproved && <Badge tone="warn" size="xs">تلقائي</Badge>}</span>{x.t.status === 'STS19' && <Countdown until={x.t.deadlineAt} label="للاعتماد" />}{x.t.decidedAt && <span className="meta">قرار {fmtDate(x.t.decidedAt)}</span>}</div> },
    { key: 'act', header: '', width: '110px', hideable: false, cell: x => x.t.status === 'STS19' ? <ButtonLink size="xs" to={`/requests/${x.r.id}/tests/${x.t.id}/review`}>{canApprove ? 'مراجعة واعتماد' : 'مراجعة'}</ButtonLink> : <ButtonLink size="xs" variant="ghost" to={`/requests/${x.r.id}`}>عرض</ButtonLink> },
  ]
  const donut = [{ name: 'معتمد', value: decided.filter(x => x.t.status === 'STS20' && !x.t.autoApproved).length, color: STATUS_FILL.ok }, { name: 'اعتماد تلقائي', value: auto, color: STATUS_FILL.warn }, { name: 'مرفوض', value: rejected, color: STATUS_FILL.danger }, { name: 'بانتظار', value: pending.length, color: STATUS_FILL.accent }].filter(d => d.value)
  return (
    <>
      <PageHeader title="اعتماد النتائج" sub={`مخرجات المختبرات على العقود التي تُشرف عليها — القرار خلال ${rules.consultantDecisionHours} ساعة وإلا اعتُمدت تلقائياً وسُجّلت في مؤشراتك`}
        actions={pending.length > 0 && <ButtonLink to={`/requests/${pending[0].r.id}/tests/${pending[0].t.id}/review`} icon={CheckCircle2}>ابدأ بالأقرب مهلة</ButtonLink>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="تنتظر اعتمادك" value={pending.length} unit="مخرج" tone={pending.length ? 'warn' : 'ok'} icon={Clock} onClick={() => setQuick('pending')} hint={`مهلة ${rules.consultantDecisionHours} ساعة`} />
        <Kpi label={`أقل من ${Math.round(rules.consultantDecisionHours / 4)} ساعة`} value={urgent.length} tone={urgent.length ? 'danger' : 'ok'} icon={Timer} hint="خطر الاعتماد التلقائي" />
        <Kpi label="قرارات هذا الشهر" value={decided.filter(x => x.t.decidedAt && Date.now() - new Date(x.t.decidedAt).getTime() < 30 * 864e5).length} icon={CheckCircle2} onClick={() => setQuick('decided')} />
        <Kpi label="متوسط زمن قرارك" value={avgHours} unit="ساعة" tone={avgHours <= 24 ? 'ok' : 'warn'} hint="من الرفع حتى القرار" />
        <Kpi label="اعتمادات تلقائية" value={auto} tone={auto > 2 ? 'warn' : 'neutral'} icon={ShieldAlert} hint="تُسجَّل في مؤشرات المكتب" />
        <Kpi label="معدل الرفض" value={`${decided.length ? Math.round((rejected / decided.length) * 100) : 0}%`} hint={`${rejected} مخرج مرفوض`} />
      </div>
      <div className="mt-3 grid grid-cols-12 gap-3">
        <Section title="الأقرب مهلة" icon={Timer} className="col-span-12 xl:col-span-5" noPad>
          <ul className="divide-y divide-ink-100">{[...pending].sort((a, b) => (a.t.deadlineAt ?? '9').localeCompare(b.t.deadlineAt ?? '9')).slice(0, 5).map(x => <li key={x.t.id}><Link to={`/requests/${x.r.id}/tests/${x.t.id}/review`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-ink-50"><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[12.5px]"><span className="font-semibold">{name(x.t.refTestId)}</span><span className="meta">{x.r.id}</span></span><span className="block truncate text-[11.5px] text-ink-500">{org(x.r.labId)} · {x.r.project}</span></span><Countdown until={x.t.deadlineAt} label="" /></Link></li>)}</ul>
        </Section>
        <Section title="قراراتك" desc="آخر 12 شهراً" className="col-span-12 md:col-span-6 xl:col-span-3" bodyClass="p-3"><Donut data={donut} height={130} center={all.length} centerLabel="مخرج" stack /></Section>
        <Section title="قواعد الاعتماد" icon={History} className="col-span-12 md:col-span-6 xl:col-span-4" bodyClass="p-3">
          <ul className="grid gap-1.5 text-[11.5px] text-ink-600">{[`المهلة ${rules.consultantDecisionHours} ساعة من رفع المختبر للمخرج (B.R.152)`, 'الاعتماد التلقائي عند انتهاء المهلة يُسجَّل كتنبيه في سجل التدقيق', 'الرفض يتطلب سبباً فنياً يظهر للمقاول والمختبر ويتيح طلب إعادة', 'الموظف المفوَّض يراجع ويضيف ملاحظات؛ الاعتماد والرفض للمفوّض الرئيسي حصراً (المصفوفة بندا 24–25)', 'الاعتماد النهائي للتقرير الجيوتقني من المفوّض الرئيسي حصراً'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul>
        </Section>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5"><Chip active={quick === 'pending'} onClick={() => setQuick('pending')} count={pending.length}>بانتظار قرارك</Chip><Chip active={quick === 'decided'} onClick={() => setQuick('decided')} count={decided.length}>صدر القرار</Chip><Chip active={quick === 'all'} onClick={() => setQuick('all')} count={all.length}>الكل</Chip></div>
      <div className="mt-2"><DataTable rows={rows} columns={cols} rowKey={x => x.t.id} onRowClick={x => nav(x.t.status === 'STS19' ? `/requests/${x.r.id}/tests/${x.t.id}/review` : `/requests/${x.r.id}`)} searchable={x => `${x.r.id} ${x.r.project} ${name(x.t.refTestId)} ${org(x.r.labId)}`} searchPlaceholder="بحث بالطلب، المخرج، المختبر…" exportName="approvals" defaultSort={{ key: 'submitted', dir: quick === 'pending' ? 'asc' : 'desc' }} pageSize={15}
        filters={[{ key: 'lab', label: 'المختبر', options: [...new Set(all.map(x => x.r.labId))].map(id => ({ value: id, label: org(id) })), match: (x, v) => x.r.labId === v }, { key: 'cat', label: 'التصنيف', options: [{ value: 'soil', label: 'تربة' }, { value: 'asphalt', label: 'إسفلت' }, { value: 'concrete', label: 'خرسانة' }, { value: 'aggregate', label: 'ركام' }], match: (x, v) => refTests.find(t => t.id === x.t.refTestId)?.category === v }]}
        rowClass={x => cx(x.t.status === 'STS19' && x.t.deadlineAt && new Date(x.t.deadlineAt).getTime() - Date.now() < 12 * 36e5 && 'bg-danger-25')} footer={<span className="meta">القيمة الإجمالية للمخرجات المعروضة: <b className="num">{fmtSAR(rows.reduce((a, x) => a + x.t.price, 0))}</b></span>} /></div>
    </>
  )
}
