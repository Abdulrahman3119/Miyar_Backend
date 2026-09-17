import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FlaskConical, Plus, Clock, CheckCircle2, AlertTriangle, FileDown, Printer } from 'lucide-react'
import { useStore, useSel, visibleRequests } from '@/lib/store'
import { PageHeader, Countdown } from '@/ds/composite'
import { Kpi, StatusPill, ButtonLink, Callout, Badge, Code, Button, Chip } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { fmtDate, fmtSAR, ago } from '@/lib/format'
import { status as statusDef } from '@/lib/statuses'
import type { TestRequest } from '@/lib/types'
import { downloadCsv, printHtml } from '@/lib/files'

type Quick = 'all' | 'action' | 'progress' | 'pending' | 'done' | 'draft' | 'closed'

export default function RequestsList({ approvalsOnly }: { approvalsOnly?: boolean } = {}) {
  const user = useStore(s => s.user)!
  const canCreate = useStore(s => s.can('request.create'))
  const reqs = useSel(visibleRequests)
  const orgs = useStore(s => s.orgs)
  const refTests = useStore(s => s.refTests)
  const rules = useStore(s => s.rules)
  const nav = useNavigate()
  const [quick, setQuick] = useState<Quick>(approvalsOnly ? 'action' : 'all')
  const org = (id: string) => orgs.find(o => o.id === id)?.name ?? id
  const name = (id: string) => refTests.find(t => t.id === id)?.nameAr ?? id
  const needsAction = (r: TestRequest) => (user.role === 'lab' && r.status === 'STS11') || (user.role === 'consultant' && (r.status === 'STS10' || r.tests.some(t => t.status === 'STS19'))) || (user.role === 'contractor' && (r.status === 'STS09' || r.tests.some(t => t.sample && !t.sample.confirmedByContractor)))
  const counts = { all: reqs.length, action: reqs.filter(needsAction).length, progress: reqs.filter(r => r.status === 'STS14' || r.status === 'STS12').length, pending: reqs.filter(r => r.status === 'STS11' || r.status === 'STS10').length, done: reqs.filter(r => r.status === 'STS15').length, draft: reqs.filter(r => r.status === 'STS09').length, closed: reqs.filter(r => r.status === 'STS16' || r.status === 'STS13' || r.status === 'STS26').length }
  const rows = useMemo(() => reqs.filter(r => quick === 'all' || (quick === 'action' ? needsAction(r) : quick === 'progress' ? (r.status === 'STS14' || r.status === 'STS12') : quick === 'pending' ? (r.status === 'STS11' || r.status === 'STS10') : quick === 'done' ? r.status === 'STS15' : quick === 'draft' ? r.status === 'STS09' : (r.status === 'STS16' || r.status === 'STS13' || r.status === 'STS26'))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [reqs, quick])
  const total = (r: TestRequest) => r.tests.reduce((a, t) => a + t.price, 0)
  const lateTests = reqs.flatMap(r => r.tests).filter(t => t.status === 'STS18' && t.deadlineAt && new Date(t.deadlineAt).getTime() < Date.now() + 24 * 36e5).length

  const cols: Column<TestRequest>[] = [
    { key: 'id', header: 'رقم الطلب', width: '160px', sortValue: r => r.id, exportValue: r => r.id, cell: r => <div className="whitespace-nowrap"><Link to={`/requests/${r.id}`} className="font-semibold text-brand-700 hover:underline" onClick={e => e.stopPropagation()}>{r.id}</Link>{r.parentRequestId && <div className="text-[10.5px] text-ink-500">إعادة ← {r.parentRequestId}</div>}{r.priority === 'حرجة' && <Badge tone="danger" size="xs">حرجة</Badge>}{r.priority === 'عالية' && <Badge tone="warn" size="xs">عالية</Badge>}</div> },
    { key: 'project', header: 'المشروع / العقد', sortValue: r => r.project, exportValue: r => r.project, cell: r => <div className="min-w-0"><div className="truncate font-medium text-ink-900">{r.project}</div><div className="meta">{r.contractId} · {r.city}</div></div> },
    { key: 'service', header: 'الخدمة / الاختبارات', sortValue: r => r.service, exportValue: r => r.service === 'geotech' ? 'دراسة جيوتقنية' : r.tests.map(t => name(t.refTestId)).join('، '), cell: r => <div className="flex max-w-56 flex-wrap items-center gap-x-1.5 gap-y-0.5">{r.service === 'geotech' ? <Badge tone="info" size="xs">دراسة جيوتقنية</Badge> : r.tests.slice(0, 2).map(t => <span key={t.id} className="whitespace-nowrap text-[12px]">{name(t.refTestId)}</span>)}{r.service === 'standard' && r.tests.length > 2 && <Badge tone="neutral" size="xs">+{r.tests.length - 2}</Badge>}</div> },
    { key: 'party', header: user.role === 'lab' ? 'المقاول' : 'المختبر', sortValue: r => org(user.role === 'lab' ? r.contractorId : r.labId), exportValue: r => org(user.role === 'lab' ? r.contractorId : r.labId), cell: r => <span className="block max-w-40 truncate text-[12px]">{org(user.role === 'lab' ? r.contractorId : r.labId)}</span> },
    { key: 'contractor', header: 'المقاول', defaultHidden: user.role !== 'supervisor' && user.role !== 'admin' && user.role !== 'consultant', sortValue: r => org(r.contractorId), exportValue: r => org(r.contractorId), cell: r => <span className="block max-w-40 truncate text-[12px]">{org(r.contractorId)}</span> },
    { key: 'consultant', header: 'الاستشاري', defaultHidden: user.role !== 'supervisor' && user.role !== 'admin', sortValue: r => org(r.consultantId), exportValue: r => org(r.consultantId), cell: r => <span className="block max-w-40 truncate text-[12px]">{org(r.consultantId)}</span> },
    { key: 'progress', header: 'التقدّم', width: '120px', sortValue: r => r.tests.filter(t => t.status === 'STS20' || t.status === 'STS21').length / Math.max(1, r.tests.length), cell: r => { const d = r.tests.filter(t => t.status === 'STS20' || t.status === 'STS21').length; return <div className="flex items-center gap-1.5"><div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(d / Math.max(1, r.tests.length)) * 100}%` }} /></div><span className="num text-[11px] text-ink-600">{d}/{r.tests.length}</span></div> } },
    { key: 'date', header: 'الإنشاء', width: '135px', sortValue: r => r.createdAt, exportValue: r => fmtDate(r.createdAt), cell: r => <div className="whitespace-nowrap"><div className="num text-[12px]">{fmtDate(r.createdAt)}</div><div className="meta">{r.submittedAt ? ago(r.submittedAt) : 'لم يُرسل'}</div></div> },
    { key: 'slot', header: 'الموعد', width: '110px', defaultHidden: true, sortValue: r => r.chosenSlot?.date ?? '', cell: r => r.chosenSlot ? <span className="num text-[12px]">{fmtDate(r.chosenSlot.date)}<br /><span className="meta">{r.chosenSlot.from}–{r.chosenSlot.to}</span></span> : <span className="meta">{r.slots.length} مقترحة</span> },
    { key: 'amount', header: 'القيمة', width: '100px', align: 'end', sortValue: r => total(r), exportValue: r => total(r), cell: r => <span className="num whitespace-nowrap font-semibold">{fmtSAR(total(r))}</span> },
    { key: 'status', header: 'الحالة', width: '170px', sortValue: r => statusDef(r.status).ar, exportValue: r => statusDef(r.status).ar, cell: r => <div className="grid gap-1"><StatusPill code={r.status} size="xs" />{r.status === 'STS11' && <Countdown until={r.labDeadlineAt} label="للرد" />}{r.tests.some(t => t.status === 'STS19') && <Countdown until={r.tests.find(t => t.status === 'STS19')!.deadlineAt} label="للاعتماد" />}</div> },
    { key: 'act', header: '', width: '90px', hideable: false, cell: r => <Link to={`/requests/${r.id}`} onClick={e => e.stopPropagation()} className="whitespace-nowrap text-[11.5px] font-semibold text-brand-700 hover:underline">{r.status === 'STS09' ? 'استكمال' : r.status === 'STS11' && user.role === 'lab' ? 'قبول / رفض' : user.role === 'consultant' && r.tests.some(t => t.status === 'STS19') ? 'مراجعة' : 'عرض'}</Link> },
  ]

  return (
    <>
      <PageHeader title={approvalsOnly ? 'اعتماد النتائج' : 'طلبات الاختبارات'} sub={user.role === 'lab' ? `الطلبات الواردة من المقاولين — القرار خلال ${rules.labDecisionHours} ساعة، والتنفيذ وفق SLA كل اختبار` : user.role === 'consultant' ? `الطلبات على العقود التي تُشرف عليها — اعتماد المخرجات خلال ${rules.consultantDecisionHours} ساعة` : user.role === 'supervisor' ? 'متابعة طلبات الاختبارات على مستوى المنصة — للاطلاع دون إجراء' : 'جميع الطلبات على العقود الفعّالة والسابقة'}
        actions={<><Button variant="secondary" size="md" icon={Printer} onClick={() => printHtml('كشف طلبات الاختبارات', `
          <table><thead><tr><th>الطلب</th><th>المشروع</th><th>الحالة</th><th>المختبر</th><th>القيمة</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td class="num">${r.id}</td><td>${r.project}</td><td>${r.status}</td><td>${org(r.labId)}</td><td class="num">${total(r)}</td></tr>`).join('')}</tbody></table>
        `)}>طباعة</Button>{canCreate && <ButtonLink to="/requests/new" icon={Plus}>طلب اختبار جديد</ButtonLink>}</>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="إجمالي الطلبات" value={counts.all} icon={FlaskConical} onClick={() => setQuick('all')} />
        <Kpi label={user.role === 'lab' ? 'تحتاج ردّك' : user.role === 'consultant' ? 'تحتاج اعتمادك' : 'تحتاج إجراءك'} value={counts.action} tone={counts.action ? 'warn' : 'ok'} icon={Clock} onClick={() => setQuick('action')} hint={user.role === 'lab' ? `مهلة ${rules.labDecisionHours} ساعة` : user.role === 'consultant' ? `مهلة ${rules.consultantDecisionHours} ساعة` : undefined} />
        <Kpi label="جارٍ / مقبول" value={counts.progress} tone="accent" onClick={() => setQuick('progress')} />
        <Kpi label="بانتظار قرار" value={counts.pending} onClick={() => setQuick('pending')} />
        <Kpi label="مكتمل" value={counts.done} tone="ok" icon={CheckCircle2} onClick={() => setQuick('done')} />
        <Kpi label="اختبارات على وشك تجاوز SLA" value={lateTests} tone={lateTests ? 'danger' : 'ok'} icon={AlertTriangle} hint="خلال 24 ساعة" />
      </div>
      {user.role === 'lab' && counts.action > 0 && <Callout tone="warn" className="mt-3" compact>{counts.action} طلبات تحتاج ردّك خلال {rules.labDecisionHours} ساعة من استلامها — تجاوز المدة يُنهي الطلب تلقائياً ويُسجَّل في مؤشرات المختبر.</Callout>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Chip active={quick === 'all'} onClick={() => setQuick('all')} count={counts.all}>الكل</Chip>
        {user.role !== 'supervisor' && user.role !== 'admin' && <Chip active={quick === 'action'} onClick={() => setQuick('action')} count={counts.action}>تحتاج إجراء</Chip>}
        <Chip active={quick === 'progress'} onClick={() => setQuick('progress')} count={counts.progress}>جارٍ</Chip>
        <Chip active={quick === 'pending'} onClick={() => setQuick('pending')} count={counts.pending}>بانتظار قرار</Chip>
        <Chip active={quick === 'done'} onClick={() => setQuick('done')} count={counts.done}>مكتمل</Chip>
        {user.role === 'contractor' && <Chip active={quick === 'draft'} onClick={() => setQuick('draft')} count={counts.draft}>مسودة</Chip>}
        <Chip active={quick === 'closed'} onClick={() => setQuick('closed')} count={counts.closed}>ملغي / مرفوض / منتهي المهلة</Chip>
      </div>
      <div className="mt-2">
        <DataTable rows={rows} columns={cols} rowKey={r => r.id} searchable={r => `${r.id} ${r.project} ${r.contractId} ${org(r.labId)} ${org(r.contractorId)}`} searchPlaceholder="بحث برقم الطلب، المشروع، العقد، المنشأة…" onRowClick={r => nav(`/requests/${r.id}`)} selectable exportName="miyar-requests" defaultSort={{ key: 'date', dir: 'desc' }} pageSize={15}
          filters={[
            { key: 'service', label: 'الخدمة', options: [{ value: 'standard', label: 'اختبارات قياسية' }, { value: 'geotech', label: 'دراسة جيوتقنية' }], match: (r, v) => r.service === v },
            { key: 'cat', label: 'التصنيف', options: [{ value: 'soil', label: 'تربة' }, { value: 'asphalt', label: 'إسفلت' }, { value: 'concrete', label: 'خرسانة' }, { value: 'aggregate', label: 'ركام' }], match: (r, v) => r.category === v },
            { key: 'city', label: 'المدينة', options: [...new Set(reqs.map(r => r.city).filter(Boolean))].map(c => ({ value: c!, label: c! })), match: (r, v) => r.city === v },
            { key: 'contract', label: 'العقد', options: [...new Set(reqs.map(r => r.contractId))].map(c => ({ value: c, label: c })), match: (r, v) => r.contractId === v },
            { key: 'prio', label: 'الأولوية', options: [{ value: 'حرجة', label: 'حرجة' }, { value: 'عالية', label: 'عالية' }, { value: 'عادية', label: 'عادية' }], match: (r, v) => r.priority === v },
          ]}
          bulkActions={keys => {
            const selected = rows.filter(r => keys.includes(r.id))
            return <>
              <Button size="xs" variant="secondary" icon={FileDown} onClick={() => downloadCsv('miyar-requests-selected', ['الطلب', 'المشروع', 'العقد', 'الحالة', 'المختبر', 'القيمة'], selected.map(r => [r.id, r.project, r.contractId, r.status, org(r.labId), total(r)]))}>تصدير المحدد ({keys.length})</Button>
              <Button size="xs" variant="secondary" icon={Printer} onClick={() => printHtml('كشف الطلبات المحددة', `<table><thead><tr><th>الطلب</th><th>المشروع</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>${selected.map(r => `<tr><td class="num">${r.id}</td><td>${r.project}</td><td>${r.status}</td><td class="num">${total(r)}</td></tr>`).join('')}</tbody></table>`)}>طباعة كشف</Button>
            </>
          }}
          rowClass={r => r.status === 'STS09' ? 'bg-warn-25' : ''} />
      </div>
      <p className="meta mt-2">أرقام الطلبات بصيغة <Code>TST-YYYY-NNN</Code>، وطلبات الإعادة بلاحقة <Code>-R1</Code>. يظهر لك ما تخوّله صلاحياتك وتفويضاتك فقط.</p>
    </>
  )
}
