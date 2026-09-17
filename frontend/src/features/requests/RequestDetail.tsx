import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { XCircle, Users, Send, Pencil, Layers, CheckCircle2, MapPin, FileText, Info, Printer, Receipt, ScrollText, Paperclip, ShieldCheck, Camera } from 'lucide-react'
import { useStore, useSel, canActOnTest, visibleRequests } from '@/lib/store'
import { GeoMap } from '@/ds/evidence'
import { TestSheet } from '@/features/evidence/Evidence'
import { photosFor } from '@/lib/store'
import { CITY_COORD } from '@/lib/lookups'
import { FlowSteps, PageHeader, Countdown, Timeline } from '@/ds/composite'
import { Section, KV, StatusPill, Badge, Button, ButtonLink, Modal, Textarea, Field, Callout, Code, Drawer, Table, Th, Td, Tabs, Kpi, cx } from '@/ds/primitives'
import { fmtSAR, fmtSlot, fmtDateTime, fmtDate, fmtShort } from '@/lib/format'
import type { TimeSlot, TestItem } from '@/lib/types'
import DelegationModal from '@/features/delegation/DelegationModal'
import { openFile, downloadUrl, printHtml } from '@/lib/files'

export default function RequestDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useSel(s => visibleRequests(s).find(x => x.id === id))
  const orgs = useStore(s => s.orgs)
  const refTests = useStore(s => s.refTests)
  const liveRules = useStore(s => s.rules)
  const canP = useStore(s => s.can)
  const contracts = useStore(s => s.contracts)
  const documents = useStore(s => s.documents)
  const samples = useStore(s => s.samples)
  const invoices = useStore(s => s.invoices)
  const users = useStore(s => s.users)
  const cancelRequest = useStore(s => s.cancelRequest)
  const submitRequest = useStore(s => s.submitRequest)
  const labDecide = useStore(s => s.labDecide)
  const confirmSample = useStore(s => s.confirmSample)
  const consultantDecide = useStore(s => s.consultantDecide)
  const state = useStore()
  const [tab, setTab] = useState<'tests' | 'timeline' | 'docs' | 'finance' | 'gov'>('tests')
  const [cancel, setCancel] = useState(false)
  const [slot, setSlot] = useState<TimeSlot | null>(null)
  const [reject, setReject] = useState(false)
  const [reason, setReason] = useState('')
  const [delegate, setDelegate] = useState<{ testId?: string } | null>(null)
  const [drawer, setDrawer] = useState<TestItem | null>(null)
  const [confirmSampleFor, setConfirmSampleFor] = useState<TestItem | null>(null)
  const [sampleReject, setSampleReject] = useState('')

  if (!r) return <Callout tone="danger">الطلب غير موجود أو لا تملك صلاحية الوصول إليه — يظهر لك ما يخص منشأتك وما فُوِّض لك فقط (B.R.237).</Callout>
  // Rules are frozen on the request at submission (BRD 2.4); drafts follow the live settings
  const rules = { ...liveRules, ...(r.rules ?? {}) }
  const org = (oid: string) => orgs.find(o => o.id === oid)?.name ?? oid
  const name = (tid: string) => refTests.find(t => t.id === tid)?.nameAr ?? tid
  const total = r.tests.reduce((a, t) => a + t.price, 0); const vat = Math.round(total * rules.vat) / 100
  const isAdmin = user.role === 'admin'
  const isC = user.role === 'contractor' || isAdmin, isL = user.role === 'lab' || isAdmin, isK = user.role === 'consultant' || isAdmin
  const canCancel = (isC || isAdmin) && canP('request.cancel') && ['STS09', 'STS10', 'STS11'].includes(r.status)
  const canDecide = isL && canP('request.decide') // matrix #20 — المفوّض الرئيسي للمختبر أو مدير النظام
  const pendingSample = r.tests.filter(t => t.sample && !t.sample.confirmedByContractor)
  const contract = contracts.find(c => c.id === r.contractId)
  const docs = documents.filter(d => d.requestId === r.id)
  const inv = invoices.find(i => i.requestId === r.id)
  const done = r.tests.filter(t => t.status === 'STS20' || t.status === 'STS21').length
  const related = state.requests.filter(x => x.parentRequestId === r.id || x.id === r.parentRequestId)
  const evidenceSamples = samples.filter(sm => sm.requestId === r.id)
  const siteCoord: [number, number] | undefined = evidenceSamples[0] ? [evidenceSamples[0].lat, evidenceSamples[0].lng] : (Object.entries(CITY_COORD).find(([k, v]) => v && k.startsWith('حي') && r.location.includes(k))?.[1] ?? CITY_COORD[r.city ?? ''])
  const chosen = slot ?? r.slots[0] ?? null
  const flowIdx = r.status === 'STS09' ? 0 : r.status === 'STS10' || r.status === 'STS11' || r.status === 'STS13' ? 1 : r.status === 'STS12' ? 2 : r.status === 'STS14' ? (r.tests.some(t => t.status === 'STS19') ? 4 : 3) : r.status === 'STS15' ? 5 : 1
  const flowSteps = [
    { label: 'إنشاء الطلب', hint: r.submittedAt ? `أُرسل ${fmtDate(r.submittedAt)}` : 'مسودة' },
    { label: r.service === 'geotech' ? 'اعتماد الخطة وقرار المختبر' : 'قرار المختبر', hint: r.status === 'STS11' ? `خلال ${rules.labDecisionHours} ساعة` : r.status === 'STS13' ? 'مرفوض' : r.chosenSlot ? 'مقبول' : 'بانتظار' },
    { label: 'أخذ العينات', hint: r.chosenSlot ? fmtSlot(r.chosenSlot) : 'بعد تأكيد الموعد' },
    { label: 'التنفيذ ورفع المخرجات', hint: `${r.tests.filter(t => ['STS19', 'STS20', 'STS21'].includes(t.status)).length}/${r.tests.length} مخرج` },
    { label: 'اعتماد الاستشاري', hint: `خلال ${rules.consultantDecisionHours} ساعة لكل مخرج` },
    { label: 'الإغلاق والشهادة', hint: r.status === 'STS15' ? 'مكتمل' : r.status === 'STS16' ? 'ملغي' : r.status === 'STS26' ? 'منتهي المهلة' : 'بعد اعتماد كل المخرجات' },
  ]

  return (
    <>
      <PageHeader crumbs={[{ label: 'طلبات الاختبارات', to: '/requests' }, { label: r.id }]}
        title={<span className="flex flex-wrap items-center gap-2">{r.id}<StatusPill code={r.status} />{r.priority !== 'عادية' && <Badge tone={r.priority === 'حرجة' ? 'danger' : 'warn'}>{r.priority}</Badge>}</span>}
        sub={`${r.project} · ${r.contractId} · أُنشئ ${fmtDate(r.createdAt)} بواسطة ${r.history[0]?.actor}`}
        meta={<><Badge tone={r.service === 'geotech' ? 'info' : 'neutral'}>{r.service === 'geotech' ? 'دراسة جيوتقنية — SBC 303' : 'اختبارات قياسية'}</Badge>{r.chosenSlot && <Badge tone="neutral">الموعد: {fmtSlot(r.chosenSlot)}</Badge>}{r.parentRequestId && <Badge tone="info">إعادة اختبار — مرتبط بـ <Link to={`/requests/${r.parentRequestId}`} className="underline">{r.parentRequestId}</Link></Badge>}{r.status === 'STS11' && <Countdown until={r.labDeadlineAt} label="متبقٍ لرد المختبر" autoLabel="يُنهى تلقائياً عند انتهاء المدة" />}</>}
        actions={<>
          <Button variant="secondary" icon={Printer} onClick={() => printHtml(`طلب ${r.id}`, `
            <h2>${r.project}</h2>
            <div class="row"><span>العقد</span><span class="num">${r.contractId}</span></div>
            <div class="row"><span>الحالة</span><span>${r.status}</span></div>
            <div class="row"><span>المقاول</span><span>${org(r.contractorId)}</span></div>
            <div class="row"><span>المختبر</span><span>${org(r.labId)}</span></div>
            <div class="row"><span>الاستشاري</span><span>${org(r.consultantId)}</span></div>
            <div class="row"><span>الموقع</span><span>${r.location || '—'}</span></div>
            <h2>الاختبارات</h2>
            <table><thead><tr><th>الاختبار</th><th>الطريقة</th><th>الحالة</th><th>السعر</th></tr></thead>
            <tbody>${r.tests.map(t => `<tr><td>${name(t.refTestId)}</td><td class="num">${t.method}</td><td>${t.status}</td><td class="num">${t.price}</td></tr>`).join('')}</tbody></table>
            <div class="row total"><span>الإجمالي شامل الضريبة</span><span class="num">${fmtSAR(total + vat)}</span></div>
          `)}>طباعة</Button>
          {r.status === 'STS09' && isC && <><ButtonLink to={`/requests/${r.id}/edit`} variant="secondary" icon={Pencil}>تعديل</ButtonLink><Button icon={Send} onClick={async () => { await submitRequest(r.id); nav('/requests') }}>إرسال الطلب</Button></>}
          {r.service === 'geotech' && r.studyId && <ButtonLink to={`/requests/${r.id}/study`} icon={Layers}>مسار الدراسة الجيوتقنية</ButtonLink>}
          {r.service === 'geotech' && !r.studyId && isC && <ButtonLink to={`/requests/${r.id}/study/prelim`} icon={Layers}>استكمال البيانات الأولية</ButtonLink>}
          {(isL || isK) && !['STS09', 'STS15', 'STS16', 'STS13', 'STS26'].includes(r.status) && canP('delegation.create') && <Button variant="secondary" icon={Users} onClick={() => setDelegate({})}>{user.canDelegate ? 'تفويض موظف' : 'تفويض غير مباشر'}</Button>}
          {canCancel && <Button variant="danger" icon={XCircle} onClick={() => setCancel(true)}>إلغاء الطلب</Button>}
        </>} />

      {r.status === 'STS13' && <Callout tone="danger" className="mb-3" compact><b>رفض المختبر الطلب.</b> السبب: {r.rejectReason} — يمكن إنشاء طلب جديد بمواعيد مختلفة.</Callout>}
      {r.status === 'STS26' && <Callout tone="danger" className="mb-3" compact><b>انتهت مهلة قرار المختبر ({rules.labDecisionHours} ساعة) دون رد.</b> أُنهي الطلب تلقائياً وسُجّل التأخر في مؤشرات المختبر (B.R.147) — يمكن إنشاء طلب جديد بمواعيد أخرى.</Callout>}
      {isL && r.status === 'STS11' && !canDecide && <Callout tone="warn" className="mb-3" compact>قبول الطلب أو رفضه صلاحية المفوّض الرئيسي للمختبر (مصفوفة الصلاحيات — بند 20). يمكنك الاطلاع على التفاصيل فقط.</Callout>}
      {r.status === 'STS10' && <Callout tone="info" className="mb-3" compact>طلب دراسة جيوتقنية — يُحال للمختبر بعد اعتماد المكتب الاستشاري لخطة الاستكشاف. <Link to={`/requests/${r.id}/study`} className="font-semibold underline">فتح مسار الدراسة</Link></Callout>}
      {isC && pendingSample.length > 0 && <Callout tone="warn" className="mb-3" compact>سجّل المختبر استلام عينة في الموقع لاختبار <b>{name(pendingSample[0].refTestId)}</b>. يبدأ عداد SLA فور تأكيدك. <button className="font-semibold underline" onClick={() => setConfirmSampleFor(pendingSample[0])}>مراجعة وتأكيد</button></Callout>}

      {canDecide && r.status === 'STS11' && (
        <Section title="القرار على الطلب — اختر النطاق الزمني المناسب" className="mb-3 border-brand-300 ring-2 ring-brand-100">
          <div className="grid gap-2 sm:grid-cols-3">{r.slots.map((s, i) => <button key={i} type="button" onClick={() => setSlot(s)} className={cx('rounded-sm border p-2.5 text-start', chosen === s ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-ink-200 hover:bg-ink-50')}><div className="num text-[13px] font-bold">{fmtDate(s.date)}</div><div className="meta">من {s.from} إلى {s.to} — النطاق {['الأول', 'الثاني', 'الثالث'][i]}</div></button>)}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><Button variant="success" icon={CheckCircle2} disabled={!chosen} onClick={() => labDecide(r.id, true, chosen!)}>تأكيد النطاق وقبول الطلب</Button><Button variant="danger" icon={XCircle} onClick={() => setReject(true)}>رفض الطلب</Button><span className="meta ms-auto">تنفيذ الاختبارات لا يبدأ قبل الموعد المعتمد — التأخير يُسجَّل في مؤشرات المختبر (B.R.149)</span></div>
        </Section>
      )}

      <FlowSteps steps={flowSteps} current={flowIdx} failedAt={r.status === 'STS13' || r.status === 'STS26' ? 1 : r.status === 'STS16' ? 5 : undefined} className="mb-3" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="الاختبارات" value={r.tests.length} hint={`${done} صدر قرارها`} />
        <Kpi label="الإجمالي شامل الضريبة" value={fmtSAR(total + vat).replace(' ر.س', '')} unit="ر.س" hint={inv ? `فاتورة ${inv.id}` : 'لم تُصدر فاتورة'} />
        <Kpi label="المختبر" value={<span className="text-[14px] leading-tight">{org(r.labId)}</span>} hint={`الالتزام ${orgs.find(o => o.id === r.labId)?.onTime ?? '—'}%`} />
        <Kpi label="الاستشاري المشرف" value={<span className="text-[14px] leading-tight">{org(r.consultantId)}</span>} hint={contract ? `${contract.services.length} خدمات بالعقد` : ''} />
        <Kpi label="آلية الدفع" value={<span className="text-[14px]">{contract?.payment === 'advance' ? 'دفع مقدّم' : 'عند الإتمام'}</span>} hint={contract?.active ? 'عقد فعّال' : 'عقد منتهٍ'} tone={contract?.active ? 'ok' : 'neutral'} />
        <Kpi label="المستندات" value={docs.length} hint="تقارير ومرفقات" onClick={() => setTab('docs')} />
      </div>

      <div className="mt-3 grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-8">
          <div className="card">
            <Tabs value={tab} onChange={setTab} className="px-3 pt-1" items={[{ value: 'tests', label: 'الاختبارات', count: r.tests.length, icon: FileText }, { value: 'timeline', label: 'سجل العمليات', count: r.history.length, icon: ScrollText }, { value: 'docs', label: 'المستندات', count: docs.length, icon: Paperclip }, { value: 'finance', label: 'المالية', icon: Receipt }, { value: 'gov', label: 'الحوكمة', icon: ShieldCheck }]} />
            <div className="p-3">
              {tab === 'tests' && <><ul className="grid gap-2">{r.tests.map(t => { const act = canActOnTest(state, r, t.id); return (
                <li key={t.id} className="rounded-sm border border-ink-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><button className="text-[13.5px] font-bold hover:underline" onClick={() => setDrawer(t)}>{name(t.refTestId)}</button><StatusPill code={t.status} size="xs" />{t.autoApproved && <Badge tone="warn" size="xs">اعتُمد تلقائياً</Badge>}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 meta"><Code>{t.method}</Code>{photosFor({ requestId: r.id, testId: t.id }).length > 0 && <button type="button" onClick={() => setDrawer(t)} className="inline-flex items-center gap-1 rounded-full bg-info-50 px-1.5 py-px text-[10.5px] font-semibold text-info-700 hover:underline"><Camera className="size-3" />{photosFor({ requestId: r.id, testId: t.id }).length} صور</button>}<span className="num">{fmtSAR(t.price)}</span><span>SLA {t.sla} أيام</span>{t.sample && <span>عينة {t.sample.id} · {t.sample.depth} م</span>}{t.delegateId && <Badge tone="neutral" size="xs">مفوَّض: {users.find(u => u.id === t.delegateId)?.name}</Badge>}{t.decidedAt && <span>قرار {fmtDate(t.decidedAt)}</span>}</div>
                      {t.result && <div className="mt-1.5 flex flex-wrap gap-1.5">{Object.entries(t.result).map(([k, v]) => { const f = refTests.find(x => x.id === t.refTestId)?.resultFields?.find(x => x.key === k); return <span key={k} className="rounded-xs bg-ink-50 px-1.5 py-0.5 text-[11px]"><span className="text-ink-500">{f?.label.split(' ')[0] ?? k}</span> <b className="num">{v}</b> <span className="text-ink-400">{f?.unit}</span></span> })}</div>}
                      {t.rejectReason && <div className="mt-1.5 rounded-xs bg-danger-50 px-2 py-1 text-[11.5px] text-danger-700"><b>سبب الرفض:</b> {t.rejectReason}</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.status === 'STS18' && t.deadlineAt && <Countdown until={t.deadlineAt} warnBelow={24} />}
                      {t.status === 'STS19' && <Countdown until={t.deadlineAt} label="للاعتماد" autoLabel={isK ? 'يُعتمد تلقائياً بعد المهلة' : undefined} />}
                      {isL && r.service === 'standard' && (t.status === 'STS17' || t.status === 'STS18') && (r.status === 'STS12' || r.status === 'STS14') && (act ? <ButtonLink size="sm" to={`/requests/${r.id}/tests/${t.id}/execute`}>{t.status === 'STS17' ? 'بدء التنفيذ' : 'متابعة التنفيذ'}</ButtonLink> : <Badge tone="neutral" size="xs">غير مفوَّض لك</Badge>)}
                      {isL && r.service === 'geotech' && r.studyId && <ButtonLink size="sm" to={`/requests/${r.id}/study`}>متابعة الدراسة</ButtonLink>}
                      {isK && t.status === 'STS19' && r.service === 'standard' && <ButtonLink size="sm" to={`/requests/${r.id}/tests/${t.id}/review`}>مراجعة واعتماد</ButtonLink>}
                      {isC && t.status === 'STS21' && !state.requests.some(x => x.parentRequestId === r.id && x.retestOf === t.id) && <ButtonLink size="sm" variant="secondary" to={`/requests/${r.id}/tests/${t.id}/retest`}>طلب إعادة</ButtonLink>}
                      {isC && t.sample && !t.sample.confirmedByContractor && <Button size="sm" onClick={() => setConfirmSampleFor(t)}>تأكيد استلام العينة</Button>}
                      {t.report && <Button size="sm" variant="ghost" icon={FileText} onClick={() => setDrawer(t)}>التقرير</Button>}
                      {isL && user.canDelegate && !['STS15', 'STS16'].includes(r.status) && <Button size="sm" variant="ghost" icon={Users} onClick={() => setDelegate({ testId: t.id })}>تفويض</Button>}
                    </div>
                  </div>
                </li>) })}</ul>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-sm border border-ink-200">
                    <div className="flex items-center justify-between border-b border-ink-100 px-3 py-1.5"><span className="section-title text-[12.5px]">مهل التنفيذ والاعتماد</span><span className="meta">من الاستلام حتى الموعد النهائي</span></div>
                    <ul className="grid gap-2 p-3">{r.tests.map(t => { const start = t.sample?.receivedAt ?? t.startedAt ?? r.chosenSlot?.date ?? r.createdAt; const end = t.deadlineAt ?? new Date(new Date(start).getTime() + t.sla * 864e5).toISOString(); const span = Math.max(1, new Date(end).getTime() - new Date(start).getTime()); const el = Math.min(1, Math.max(0, (Date.now() - new Date(start).getTime()) / span)); const tone = t.status === 'STS20' ? 'bg-ok-500' : t.status === 'STS21' ? 'bg-danger-500' : el > 0.8 ? 'bg-warn-500' : 'bg-brand-500'; return (
                      <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[11.5px]"><span className="truncate font-medium">{name(t.refTestId)}</span><span className="num text-ink-500">{t.sla} أيام</span><div className="col-span-2 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full rounded-full', tone)} style={{ width: `${(t.status === 'STS20' || t.status === 'STS21' ? 1 : el) * 100}%` }} /></div><span className="num shrink-0 whitespace-nowrap text-[10.5px] text-ink-500">{fmtShort(start)} ← {fmtShort(end)}</span></div></li>) })}</ul>
                  </div>
                  <div className="rounded-sm border border-ink-200">
                    <div className="flex items-center justify-between border-b border-ink-100 px-3 py-1.5"><span className="section-title text-[12.5px]">حقول النتائج والمرجعيات</span><span className="meta">قاعدة المعرفة</span></div>
                    <table className="w-full text-[11.5px]"><tbody>{r.tests.map(t => { const rt = refTests.find(x => x.id === t.refTestId); return (rt?.resultFields ?? []).slice(0, 2).map((f, i) => <tr key={t.id + f.key} className="border-b border-ink-100 last:border-0"><td className="px-3 py-1 text-ink-700">{i === 0 ? <b>{rt?.nameAr}</b> : ''}</td><td className="px-2 py-1 text-ink-600">{f.label}</td><td className="num px-2 py-1 text-ink-500">{f.unit}</td><td className="px-3 py-1"><Code>{t.method}</Code></td></tr>) })}</tbody></table>
                  </div>
                </div></>}
              {tab === 'timeline' && <Timeline entries={r.history} />}
              {tab === 'docs' && <>{(r.attachments?.length ?? 0) > 0 && <div className="mb-3"><div className="data-label mb-1.5">مرفقات الطلب من المقاول (B.R.133)</div><ul className="grid gap-1.5 sm:grid-cols-2">{r.attachments!.map(a => <li key={a.file || a.name} className="flex items-center justify-between rounded-sm border border-ink-200 bg-ink-50 px-3 py-1.5 text-[12.5px]"><button type="button" className="flex min-w-0 items-center gap-2 text-start" onClick={() => a.file && openFile(a.file)}><Paperclip className="size-3.5 shrink-0 text-brand-600" /><span className="truncate font-medium text-brand-700 hover:underline">{a.name}</span></button><span className="meta">{a.size}</span></li>)}</ul></div>}<Table><thead><tr><Th>المستند</Th><Th>النوع</Th><Th>الحجم</Th><Th>الإصدار</Th><Th>التاريخ</Th><Th>التصنيف</Th><Th></Th></tr></thead><tbody>{docs.map(d => <tr key={d.id}><Td className="font-medium text-brand-700">{d.name}</Td><Td><Badge tone="neutral" size="xs">{{ report: 'تقرير', 'borehole-log': 'سجل جسة', 'test-result': 'نتيجة اختبار', certificate: 'شهادة', contract: 'عقد', deed: 'قرار مساحي', invoice: 'فاتورة', photo: 'صورة' }[d.type]}</Badge></Td><Td className="num">{d.size}</Td><Td className="num">v{d.version}</Td><Td className="num">{fmtDate(d.at)}</Td><Td><Badge tone={d.classification === 'سري' ? 'danger' : d.classification === 'داخلي' ? 'warn' : 'ok'} size="xs">{d.classification}</Badge></Td><Td>{d.file ? <Button size="xs" variant="ghost" onClick={() => downloadUrl(d.file!, d.name)}>تنزيل</Button> : <span className="meta">—</span>}</Td></tr>)}{docs.length === 0 && <tr><Td colSpan={7} className="text-center text-ink-500">لا مستندات مولّدة بعد — تُضاف تلقائياً عند رفع النتائج</Td></tr>}</tbody></Table></>}
              {tab === 'finance' && <div className="grid gap-3 md:grid-cols-2"><Table><thead><tr><Th>الاختبار</Th><Th>الطريقة</Th><Th className="text-end">السعر</Th></tr></thead><tbody>{r.tests.map(t => <tr key={t.id}><Td>{name(t.refTestId)}</Td><Td><Code>{t.method}</Code></Td><Td className="num text-end">{fmtSAR(t.price)}</Td></tr>)}<tr><Td colSpan={2} className="font-semibold">المجموع قبل الضريبة</Td><Td className="num text-end font-semibold">{fmtSAR(total)}</Td></tr><tr><Td colSpan={2}>ضريبة القيمة المضافة {rules.vat}%</Td><Td className="num text-end">{fmtSAR(vat)}</Td></tr><tr className="bg-brand-50"><Td colSpan={2} className="font-bold">الإجمالي</Td><Td className="num text-end font-bold text-brand-800">{fmtSAR(total + vat)}</Td></tr></tbody></Table><div className="grid content-start gap-2">{inv ? <KV cols={2} items={[{ k: 'الفاتورة', v: inv.id }, { k: 'الحالة', v: <Badge tone={inv.status === 'paid' ? 'ok' : inv.status === 'overdue' ? 'danger' : inv.status === 'due' ? 'warn' : 'neutral'}>{{ paid: 'مسددة', due: 'مستحقة', overdue: 'متأخرة', draft: 'مسودة' }[inv.status]}</Badge> }, { k: 'الإصدار', v: fmtDate(inv.issuedAt) }, { k: 'الاستحقاق', v: fmtDate(inv.dueAt) }, { k: 'السداد', v: fmtDate(inv.paidAt) }, { k: 'آلية الدفع', v: contract?.payment === 'advance' ? 'مقدّم' : 'عند الإتمام' }]} /> : <Callout tone="info" compact>تُصدر الفاتورة تلقائياً عند قبول المختبر للطلب وفق آلية الدفع في العقد.</Callout>}<ButtonLink to="/invoices" variant="secondary" size="sm" icon={Receipt}>كل الفواتير</ButtonLink></div></div>}
              {tab === 'gov' && <div className="grid gap-3"><KV cols={3} items={[{ k: r.rules ? 'قواعد الأعمال المجمّدة عند الإرسال' : 'قواعد الأعمال (حيّة — يُجمَّد عند الإرسال)', v: `مهلة المختبر ${rules.labDecisionHours} س · الاستشاري ${rules.consultantDecisionHours} س · VAT ${rules.vat}% · النطاق ${rules.geofenceMeters} م` }, { k: 'أساس الطلب', v: `عقد ${r.contractId} — ${contract?.active ? 'فعّال' : 'منتهٍ'}` }, { k: 'الاعتمادات التلقائية', v: r.tests.filter(t => t.autoApproved).length }, { k: 'التفويضات', v: state.delegations.filter(d => d.requestId === r.id).length }, { k: 'الطلبات المرتبطة', v: related.length ? related.map(x => <Link key={x.id} to={`/requests/${x.id}`} className="me-2 text-brand-700 underline">{x.id}</Link>) : '—' }, { k: 'الأثر على التقييم', v: r.tests.some(t => t.status === 'STS18' && t.deadlineAt && new Date(t.deadlineAt).getTime() < Date.now()) ? 'تجاوز SLA — يُحتسب' : 'ضمن المهل' }]} /><Callout tone="info" compact>كل إجراء على هذا الطلب مسجَّل في سجل التدقيق بالمنفّذ والدور والوقت وعنوان الجهاز، ولا يمكن تعديل الطلب بعد إرساله (B.R.145).</Callout></div>}
            </div>
          </div>
        </div>
        <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
          <Section title="بيانات الطلب" icon={Info} bodyClass="p-3">
            <KV cols={2} dense items={[{ k: 'العقد', v: <Link to="/contracts" className="text-brand-700 hover:underline">{r.contractId}</Link> }, { k: 'المقاول', v: org(r.contractorId) }, { k: 'المختبر', v: org(r.labId) }, { k: 'الاستشاري', v: org(r.consultantId) }, { k: 'الموعد المعتمد', v: r.chosenSlot ? fmtSlot(r.chosenSlot) : '—' }, { k: 'المواعيد المقترحة', v: r.slots.map(s => fmtDate(s.date).split(' ').slice(0, 2).join(' ')).join(' · ') || '—' }, { k: 'الأولوية', v: r.priority }, { k: 'المدينة', v: r.city }]} />
            <div className="mt-3 rounded-sm bg-ink-50 p-2 text-[12px]"><div className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-600" /><div><div className="font-medium">{r.location}</div><div className="meta">التحقق الجغرافي عند استلام العينات ضمن {rules.geofenceMeters} م</div></div></div>{siteCoord && <div className="mt-2"><GeoMap center={siteCoord} zoom={16} pins={[{ lat: siteCoord[0], lng: siteCoord[1], label: 'موقع التنفيذ', tone: 'brand', sub: r.location }, ...evidenceSamples.filter(sm => sm.lat != null && sm.lng != null).map(sm => ({ lat: sm.lat, lng: sm.lng, label: sm.id, tone: 'ok' as const, sub: sm.designation }))]} geofenceM={rules.geofenceMeters * 10} height={170} /></div>}</div>
            {r.notes && <div className="mt-2 rounded-sm border border-warn-100 bg-warn-25 p-2 text-[12px]"><span className="data-label">ملاحظات المقاول</span><div>{r.notes}</div></div>}
          </Section>
          <Section title="آخر الإجراءات" icon={ScrollText} bodyClass="p-3" actions={<button className="text-[11.5px] font-semibold text-brand-700 hover:underline" onClick={() => setTab('timeline')}>الكل</button>}><Timeline entries={r.history} limit={4} /></Section>
        </div>
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer ? name(drawer.refTestId) : ''} sub={drawer ? `${r.id} · ${drawer.method} · ورقة الاختبار والأدلة` : ''} width="w-[720px]">
        {drawer && <div className="grid gap-4">
          <TestSheet requestId={r.id} testId={drawer.id} />
          <KV cols={2} dense items={[{ k: 'الحالة', v: <StatusPill code={drawer.status} size="xs" /> }, { k: 'السعر', v: fmtSAR(drawer.price) }, { k: 'SLA', v: `${drawer.sla} أيام` }, { k: 'بدء التنفيذ', v: fmtDateTime(drawer.startedAt) }, { k: 'الرفع للاستشاري', v: fmtDateTime(drawer.submittedAt) }, { k: 'القرار', v: fmtDateTime(drawer.decidedAt) }]} />
          {drawer.sample && <div><div className="section-title mb-2">بيانات العينة</div><KV cols={2} dense items={[{ k: 'رقم العينة', v: drawer.sample.id }, { k: 'العمق', v: `${drawer.sample.depth} م` }, { k: 'الفني', v: drawer.sample.technician }, { k: 'التحقق الجغرافي', v: drawer.sample.geoVerified ? <Badge tone="ok" size="xs">مطابق</Badge> : <Badge tone="danger" size="xs">خارج النطاق</Badge> }, { k: 'تأكيد المقاول', v: drawer.sample.confirmedByContractor ? <span className="flex items-center gap-1.5"><Badge tone="ok" size="xs">مؤكَّد</Badge><span className="meta">{fmtDateTime(drawer.sample.confirmedAt)}</span></span> : <Badge tone="warn" size="xs">بانتظار التأكيد</Badge> }, { k: 'الاستلام', v: fmtDateTime(drawer.sample.receivedAt) }]} /></div>}
          {drawer.result && <div><div className="section-title mb-2">نتائج الاختبار</div><Table><thead><tr><Th>الحقل</Th><Th>القيمة</Th><Th>الوحدة</Th></tr></thead><tbody>{Object.entries(drawer.result).map(([k, v]) => { const f = refTests.find(t => t.id === drawer.refTestId)?.resultFields?.find(x => x.key === k); return <tr key={k}><Td>{f?.label ?? k}</Td><Td className="num font-semibold">{v}</Td><Td className="text-ink-500">{f?.unit}</Td></tr> })}</tbody></Table></div>}
          {drawer.report && <div><div className="section-title mb-2">التقرير المرفق</div><div className="flex items-center justify-between rounded-sm border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px]"><span className="font-medium text-brand-700">{drawer.report.name}</span><span className="flex items-center gap-2"><span className="meta">{drawer.report.size}</span><Button size="xs" variant="secondary" onClick={() => openFile(drawer.report?.file)}>عرض</Button><Button size="xs" variant="secondary" onClick={() => downloadUrl(drawer.report!.file || '', drawer.report!.name)}>تنزيل</Button></span></div></div>}
          <div><div className="section-title mb-2">سجل إجراءات الاختبار</div><Timeline entries={r.history.filter(h => h.action.includes(name(drawer.refTestId)) || (drawer.sample && h.detail?.includes(drawer.sample.id)))} /></div>
        </div>}
      </Drawer>

      <Modal open={cancel} onClose={() => setCancel(false)} title="إلغاء الطلب" width="sm" footer={<><Button variant="secondary" onClick={() => setCancel(false)}>تراجع</Button><Button variant="danger" onClick={() => { cancelRequest(r.id); setCancel(false) }}>نعم، ألغِ الطلب</Button></>}><p className="text-[13px]">هل تريد إلغاء طلب الاختبار {r.id}؟ سيُشعر المختبر وجميع الأطراف ويُسجَّل في سجل التدقيق، ولا يمكن التراجع.</p></Modal>
      <Modal open={reject} onClose={() => setReject(false)} title="رفض الطلب" width="sm" footer={<><Button variant="secondary" onClick={() => setReject(false)}>تراجع</Button><Button variant="danger" disabled={reason.trim().length < 5} onClick={() => { labDecide(r.id, false, undefined, reason); setReject(false) }}>نعم، ارفض</Button></>}><Field label="سبب الرفض" required hint="يظهر للمقاول ويُسجَّل في سجل العمليات ومؤشرات المختبر"><Textarea value={reason} onChange={e => setReason(e.target.value)} autoFocus /></Field></Modal>
      <Modal open={!!confirmSampleFor} onClose={() => setConfirmSampleFor(null)} title="تأكيد استلام العينة" width="md" footer={<><Button variant="danger" disabled={sampleReject.trim().length < 5} onClick={() => { confirmSample(r.id, confirmSampleFor!.id, false, sampleReject); setConfirmSampleFor(null) }}>رفض التأكيد</Button><Button variant="success" onClick={() => { confirmSample(r.id, confirmSampleFor!.id, true); setConfirmSampleFor(null); useStore.getState().toast({ title: 'تم تأكيد الاستلام', body: 'بدأ عداد SLA للاختبار.', tone: 'ok' }) }}>تأكيد الاستلام</Button></>}>
        {confirmSampleFor?.sample && <div className="grid gap-3"><Callout tone="info" compact>سجّل المختبر استلام العينة في الموقع. راجع البيانات وأكّد الاستلام أو ارفضه. يبدأ عداد SLA فور تأكيدك.</Callout><KV cols={2} dense items={[{ k: 'الاختبار', v: name(confirmSampleFor.refTestId) }, { k: 'رقم العينة', v: confirmSampleFor.sample.id }, { k: 'عمق العينة', v: `${confirmSampleFor.sample.depth} م` }, { k: 'الفني المستلم', v: confirmSampleFor.sample.technician }, { k: 'وقت التسجيل', v: fmtDateTime(confirmSampleFor.sample.receivedAt) }, { k: 'التحقق الجغرافي', v: <Badge tone="ok" size="xs">داخل نطاق المشروع</Badge> }]} /><Field label="سبب الرفض (إلزامي عند الرفض)"><Textarea value={sampleReject} onChange={e => setSampleReject(e.target.value)} /></Field></div>}
      </Modal>
      {delegate && <DelegationModal open onClose={() => setDelegate(null)} requestId={r.id} testId={delegate.testId} />}
      {isK && canP('output.approve') && r.tests.some(t => t.status === 'STS19' && t.deadlineAt && new Date(t.deadlineAt).getTime() < Date.now()) && <Callout tone="warn" className="mt-3" compact>انتهت مهلة الاعتماد لأحد المخرجات — <button className="font-semibold underline" onClick={() => r.tests.filter(t => t.status === 'STS19').forEach(t => consultantDecide(r.id, t.id, true, undefined, true))}>تطبيق الاعتماد التلقائي</button></Callout>}
    </>
  )
}
