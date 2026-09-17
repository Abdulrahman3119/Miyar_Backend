import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileSignature, Send, CheckCircle2, XCircle, Clock, Building2, Plus, ShieldCheck } from 'lucide-react'
import { useStore, useSel } from '@/lib/store'
import { PageHeader, FlowSteps } from '@/ds/composite'
import { Kpi, Section, Badge, Button, Drawer, KV, Input, Field, Select, Textarea, Modal, Checkbox, Callout, Code, cx } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { fmtSAR, fmtDate } from '@/lib/format'
import type { Quote, QuoteItem, Organization, ServiceType } from '@/lib/types'

const QS: Record<Quote['status'], { ar: string; tone: 'neutral' | 'info' | 'accent' | 'ok' | 'warn' | 'danger' }> = { pending: { ar: 'بانتظار رد المختبر', tone: 'warn' }, quoted: { ar: 'عرض مقدَّم', tone: 'info' }, accepted: { ar: 'مقبول — عقد', tone: 'ok' }, rejected: { ar: 'مرفوض', tone: 'danger' }, expired: { ar: 'منتهي الصلاحية', tone: 'neutral' } }
const total = (q: Quote) => q.items.reduce((a, i) => a + i.price, 0)

/* ───────── Request a quote from a lab profile (contractor) ───────── */
export function RequestQuoteModal({ lab, onClose }: { lab: Organization; onClose: () => void }) {
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const refTests = useStore(s => s.refTests)
  const orgs = useStore(s => s.orgs)
  const catalog = useSel(s => s.catalog.filter(c => c.labId === lab.id && c.status === 'STS01'))
  const requestQuote = useStore(s => s.requestQuote)
  const [project, setProject] = useState(''); const [city, setCity] = useState(lab.city)
  const [consultantId, setConsultantId] = useState(orgs.find(o => o.type === 'consultant' && o.active)?.id ?? '')
  const [payment, setPayment] = useState<'advance' | 'on-completion'>('on-completion')
  const [sel, setSel] = useState<string[]>([]); const [notes, setNotes] = useState('')
  const geoRt = refTests.find(t => t.isGeotech)?.id
  const geo = catalog.some(c => c.refTestId === geoRt && sel.includes(c.id))
  const services: ServiceType[] = [...(sel.some(id => catalog.find(c => c.id === id)?.refTestId !== geoRt) ? ['standard' as const] : []), ...(geo ? ['geotech' as const] : [])]
  const items: QuoteItem[] = sel.map(id => { const c = catalog.find(x => x.id === id)!; return { refTestId: c.refTestId, method: c.methods[0], basePrice: c.basePrice!, price: c.basePrice!, sla: c.sla! } })
  const ok = project.trim().length >= 5 && sel.length > 0 && consultantId
  return (
    <Modal open onClose={onClose} title={`طلب عرض سعر — ${lab.name}`} sub="يرد المختبر بأسعاره النهائية (قد تختلف عن الأساسية — B.R.116) ثم تقبل العرض ليُبرم العقد إلكترونياً" width="lg"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button icon={Send} disabled={!ok} onClick={async () => { await requestQuote({ contractorId: user.orgId, labId: lab.id, consultantId, project, city, services, payment, items, notes }); onClose(); nav('/quotes') }}>إرسال طلب عرض السعر</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="المشروع" required><Input value={project} onChange={e => setProject(e.target.value)} placeholder="مثال: مستودعات لوجستية — المنطقة الصناعية الثانية" /></Field>
        <Field label="المدينة"><Input value={city} onChange={e => setCity(e.target.value)} /></Field>
        <Field label="المكتب الاستشاري المشرف" required hint="يشرف على الاعتماد وفق SBC 303"><Select value={consultantId} onChange={e => setConsultantId(e.target.value)}>{orgs.filter(o => o.type === 'consultant' && o.active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="آلية الدفع"><Select value={payment} onChange={e => setPayment(e.target.value as any)}><option value="on-completion">عند الإتمام</option><option value="advance">دفع مقدّم عند القبول</option></Select></Field>
      </div>
      <div className="mt-3 data-label">الاختبارات المطلوبة — من قائمة المختبر المفعّلة ({catalog.length})</div>
      <ul className="mt-1.5 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">{catalog.map(c => { const rt = refTests.find(t => t.id === c.refTestId)!; const on = sel.includes(c.id); return <li key={c.id}><button type="button" onClick={() => setSel(on ? sel.filter(x => x !== c.id) : [...sel, c.id])} className={cx('flex w-full items-center gap-2 rounded-sm border px-2.5 py-1.5 text-start text-[12px]', on ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}><Checkbox checked={on} onChange={() => {}} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{rt.nameAr}</span><span className="meta">{c.methods[0]} · SLA {c.sla} أيام</span></span><span className="num shrink-0 font-semibold text-brand-700">{fmtSAR(c.basePrice)}</span></button></li> })}</ul>
      <div className="mt-2 flex items-center justify-between rounded-sm bg-ink-50 px-3 py-2 text-[12.5px]"><span>{sel.length} اختبار · الخدمات: {services.map(s => s === 'geotech' ? 'دراسة جيوتقنية' : 'قياسية').join(' + ') || '—'}</span><span className="num font-bold">تقديري {fmtSAR(items.reduce((a, i) => a + i.price, 0))} + ضريبة</span></div>
      <Field label="ملاحظات للمختبر" className="mt-3"><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-14" placeholder="نطاق الأعمال، الكميات المتوقعة، المواعيد…" /></Field>
    </Modal>
  )
}

/* ───────── Quotes page (contractor / lab / consultant) ───────── */
export default function QuotesPage() {
  const user = useStore(s => s.user)!
  const orgs = useStore(s => s.orgs); const refTests = useStore(s => s.refTests)
  const quotes = useSel(s => s.quotes.filter(q => user.role === 'admin' || user.role === 'supervisor' || user.role === 'support' || q.contractorId === user.orgId || q.labId === user.orgId || q.consultantId === user.orgId))
  const respondQuote = useStore(s => s.respondQuote); const decideQuote = useStore(s => s.decideQuote)
  const catalogIncomplete = useSel(s => s.catalog.filter(c => c.labId === user.orgId && c.status === 'STS03').length)
  const [open, setOpen] = useState<Quote | null>(null)
  const [items, setItems] = useState<QuoteItem[]>([]); const [labNotes, setLabNotes] = useState('')
  const [otp, setOtp] = useState<Quote | null>(null); const [code, setCode] = useState('')
  const [reject, setReject] = useState<Quote | null>(null); const [reason, setReason] = useState('')
  const org = (id: string) => orgs.find(o => o.id === id)?.name ?? id
  const name = (id: string) => refTests.find(t => t.id === id)?.nameAr ?? id
  const isC = user.role === 'contractor', isL = user.role === 'lab'
  const openQ = (q: Quote) => { setOpen(q); setItems(q.items.map(i => ({ ...i }))); setLabNotes(q.labNotes ?? '') }
  const cols: Column<Quote>[] = [
    { key: 'id', header: 'العرض', width: '130px', sortValue: q => q.id, exportValue: q => q.id, cell: q => <button type="button" onClick={() => openQ(q)} className="whitespace-nowrap font-semibold text-brand-700 hover:underline">{q.id}</button> },
    { key: 'project', header: 'المشروع', sortValue: q => q.project, cell: q => <div className="min-w-48"><div className="font-medium">{q.project}</div><div className="meta">{q.city} · {q.services.map(s => s === 'geotech' ? 'جيوتقنية' : 'قياسية').join(' + ')}</div></div> },
    { key: 'party', header: isL ? 'المقاول' : 'المختبر', cell: q => <span className="block max-w-44 truncate text-[12px]">{org(isL ? q.contractorId : q.labId)}</span> },
    { key: 'n', header: 'الاختبارات', width: '90px', sortValue: q => q.items.length, cell: q => <span className="num">{q.items.length}</span> },
    { key: 'total', header: 'الإجمالي', width: '120px', align: 'end', sortValue: q => total(q), cell: q => <span className="num whitespace-nowrap font-semibold">{fmtSAR(total(q))}</span> },
    { key: 'pay', header: 'الدفع', width: '100px', cell: q => <span className="whitespace-nowrap text-[12px]">{q.payment === 'advance' ? 'مقدّم' : 'عند الإتمام'}</span> },
    { key: 'at', header: 'التاريخ', width: '120px', sortValue: q => q.createdAt, cell: q => <span className="num whitespace-nowrap text-[12px]">{fmtDate(q.createdAt)}</span> },
    { key: 'status', header: 'الحالة', width: '150px', sortValue: q => q.status, cell: q => <Badge tone={QS[q.status].tone} dot size="xs">{QS[q.status].ar}</Badge> },
    { key: 'act', header: '', width: '110px', hideable: false, cell: q => <Button size="xs" variant={(isL && q.status === 'pending') || (isC && q.status === 'quoted') ? 'primary' : 'ghost'} onClick={() => openQ(q)}>{isL && q.status === 'pending' ? 'تقديم العرض' : isC && q.status === 'quoted' ? 'مراجعة العرض' : 'التفاصيل'}</Button> },
  ]
  const flowIdx = (q: Quote) => q.status === 'pending' ? 1 : q.status === 'quoted' ? 2 : 3
  return (
    <>
      <PageHeader title="عروض الأسعار والتعاقد" sub="طلب عرض السعر من دليل المنشآت → رد المختبر بأسعاره النهائية → قبول المقاول → عقد إلكتروني موقّع بـ OTP (B.R.116 · B.R.119 · A.S.08)" actions={isC && <Link to="/directory"><Button icon={Plus}>طلب عرض سعر جديد</Button></Link>} />
      {isL && catalogIncomplete > 0 && <Callout tone="danger" compact className="mb-3">لديك {catalogIncomplete} اختبار ببيانات ناقصة — لا يمكنك الرد على عروض الأسعار قبل استكمال القائمة (B.R.119). <Link to="/catalog" className="font-semibold underline">قائمة الاختبارات</Link></Callout>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="عروض الأسعار" value={quotes.length} icon={FileSignature} />
        <Kpi label={isL ? 'تنتظر ردّك' : 'بانتظار المختبر'} value={quotes.filter(q => q.status === 'pending').length} tone="warn" icon={Clock} />
        <Kpi label={isC ? 'تنتظر قرارك' : 'عروض مقدَّمة'} value={quotes.filter(q => q.status === 'quoted').length} tone="info" />
        <Kpi label="تحوّلت إلى عقود" value={quotes.filter(q => q.status === 'accepted').length} tone="ok" icon={CheckCircle2} hint={`معدل القبول ${Math.round((quotes.filter(q => q.status === 'accepted').length / Math.max(1, quotes.filter(q => q.status !== 'pending' && q.status !== 'quoted').length)) * 100)}%`} />
        <Kpi label="قيمة العروض المفتوحة" value={(quotes.filter(q => q.status === 'pending' || q.status === 'quoted').reduce((a, q) => a + total(q), 0) / 1000).toFixed(1)} unit="ألف ر.س" />
      </div>
      <div className="mt-3"><DataTable rows={quotes} columns={cols} rowKey={q => q.id} onRowClick={openQ} searchable={q => `${q.id} ${q.project} ${org(q.labId)} ${org(q.contractorId)}`} exportName="quotes" defaultSort={{ key: 'at', dir: 'desc' }} filters={[{ key: 'st', label: 'الحالة', options: Object.entries(QS).map(([v, s]) => ({ value: v, label: s.ar })), match: (q, v) => q.status === v }]} /></div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `عرض السعر ${open.id}` : ''} sub={open?.project} width="w-[760px]"
        footer={open && <>
          {isL && open.status === 'pending' && <Button icon={Send} disabled={catalogIncomplete > 0} onClick={() => { respondQuote(open.id, items, labNotes); setOpen(null) }}>إرسال العرض للمقاول</Button>}
          {isC && open.status === 'quoted' && <><Button variant="danger" icon={XCircle} onClick={() => { setReject(open); setReason('') }}>رفض العرض</Button><Button variant="success" icon={ShieldCheck} onClick={() => { setOtp(open); setCode('') }}>قبول العرض وتوقيع العقد</Button></>}
          {open.status === 'accepted' && open.contractId && <Link to="/contracts"><Button icon={FileSignature}>فتح العقد {open.contractId}</Button></Link>}
          <Button variant="secondary" onClick={() => setOpen(null)}>إغلاق</Button>
        </>}>
        {open && <div className="grid gap-3">
          <FlowSteps steps={[{ label: 'طلب عرض السعر', hint: fmtDate(open.createdAt) }, { label: 'رد المختبر', hint: open.quotedAt ? fmtDate(open.quotedAt) : 'خلال يومي عمل' }, { label: 'قرار المقاول', hint: open.decidedAt ? fmtDate(open.decidedAt) : open.validUntil ? `صالح حتى ${fmtDate(open.validUntil)}` : '—' }, { label: 'العقد الإلكتروني', hint: open.contractId ?? 'توقيع بـ OTP' }]} current={flowIdx(open)} failedAt={open.status === 'rejected' ? 2 : undefined} />
          <KV cols={3} dense items={[{ k: 'المقاول', v: org(open.contractorId) }, { k: 'المختبر', v: <Link to={`/directory/${open.labId}`} className="hover:underline">{org(open.labId)}</Link> }, { k: 'الاستشاري المشرف', v: org(open.consultantId) }, { k: 'الخدمات', v: open.services.map(s => s === 'geotech' ? 'دراسة جيوتقنية' : 'اختبارات قياسية').join(' + ') }, { k: 'آلية الدفع', v: open.payment === 'advance' ? 'دفع مقدّم عند القبول' : 'عند الإتمام' }, { k: 'الحالة', v: <Badge tone={QS[open.status].tone} size="xs">{QS[open.status].ar}</Badge> }]} />
          {open.notes && <Callout tone="info" compact><b>ملاحظات المقاول:</b> {open.notes}</Callout>}
          <Section title="بنود العرض" desc={isL && open.status === 'pending' ? 'عدّل السعر النهائي لكل بند — السعر الأساسي في قائمتك لا يتغير (B.R.116)' : 'الأسعار النهائية المعروضة'} bodyClass="p-0">
            <table className="w-full text-[12.5px]"><thead><tr className="bg-ink-50 text-[11px] text-ink-500"><th className="px-3 py-1.5 text-start font-semibold">الاختبار</th><th className="px-2 py-1.5 text-start font-semibold">الطريقة</th><th className="px-2 py-1.5 text-start font-semibold">SLA</th><th className="px-2 py-1.5 text-end font-semibold">السعر الأساسي</th><th className="px-3 py-1.5 text-end font-semibold">السعر النهائي</th></tr></thead>
              <tbody>{items.map((it, i) => <tr key={i} className="border-t border-ink-100"><td className="px-3 py-1.5 font-medium">{name(it.refTestId)}</td><td className="px-2 py-1.5"><Code>{it.method}</Code></td><td className="num px-2 py-1.5">{it.sla} أيام</td><td className="num px-2 py-1.5 text-end text-ink-500">{fmtSAR(it.basePrice)}</td><td className="px-3 py-1.5 text-end">{isL && open.status === 'pending' ? <Input value={String(it.price)} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, price: +e.target.value || 0 } : x))} className="ltr h-7 w-28! text-end" inputMode="decimal" /> : <span className={cx('num font-semibold', it.price < it.basePrice ? 'text-ok-600' : it.price > it.basePrice ? 'text-warn-600' : '')}>{fmtSAR(it.price)}</span>}</td></tr>)}</tbody>
              <tfoot><tr className="border-t border-ink-200 bg-ink-25 font-semibold"><td className="px-3 py-2" colSpan={3}>الإجمالي قبل الضريبة</td><td className="num px-2 py-2 text-end text-ink-500">{fmtSAR(items.reduce((a, i) => a + i.basePrice, 0))}</td><td className="num px-3 py-2 text-end text-brand-800">{fmtSAR(items.reduce((a, i) => a + i.price, 0))} <span className="meta">+ 15%</span></td></tr></tfoot></table>
          </Section>
          {isL && open.status === 'pending' ? <Field label="ملاحظات العرض للمقاول"><Textarea value={labNotes} onChange={e => setLabNotes(e.target.value)} className="min-h-14" placeholder="صلاحية العرض، توفر الفرق، شروط خاصة…" /></Field> : open.labNotes && <Callout tone="ok" compact><b>ملاحظات المختبر:</b> {open.labNotes}</Callout>}
          {open.rejectReason && <Callout tone="danger" compact><b>سبب الرفض:</b> {open.rejectReason}</Callout>}
          <Section title="ما يحدث عند القبول" bodyClass="p-3"><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['يُولَّد العقد الإلكتروني من القالب الساري بالأسعار النهائية المثبّتة', 'يوقّع الطرفان بـ OTP ويُعتبر ملزماً قانونياً (A.S.08)', 'يُحفظ العقد في الأرشيف ويُشعر الاستشاري المشرف', 'يصبح العقد فعّالاً فوراً ويمكن إنشاء طلبات الاختبارات عليه (B.R.132)'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></Section>
        </div>}
      </Drawer>

      <Modal open={!!otp} onClose={() => setOtp(null)} title="توقيع العقد الإلكتروني" sub="أُرسل رمز التحقق إلى جوال المفوّض الرئيسي" width="sm" footer={<><Button variant="secondary" onClick={() => setOtp(null)}>تراجع</Button><Button icon={CheckCircle2} disabled={code.length !== 4} onClick={() => { decideQuote(otp!.id, true); setOtp(null); setOpen(null) }}>توقيع وإبرام العقد</Button></>}>
        {otp && <div className="grid gap-3"><KV cols={2} dense items={[{ k: 'المختبر', v: org(otp.labId) }, { k: 'الإجمالي', v: `${fmtSAR(total(otp))} + ضريبة` }, { k: 'الدفع', v: otp.payment === 'advance' ? 'مقدّم' : 'عند الإتمام' }, { k: 'الاستشاري', v: org(otp.consultantId) }]} /><Field label="رمز التحقق OTP" hint="للعرض التجريبي أي 4 أرقام"><Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} className="ltr text-center tracking-[0.5em]" /></Field><Checkbox checked label="أقرّ بأنني المفوّض الرئيسي وأن العقد ملزم قانونياً بعد التحقق" onChange={() => {}} /></div>}
      </Modal>
      <Modal open={!!reject} onClose={() => setReject(null)} title="رفض عرض السعر" width="sm" footer={<><Button variant="secondary" onClick={() => setReject(null)}>تراجع</Button><Button variant="danger" disabled={reason.trim().length < 5} onClick={() => { decideQuote(reject!.id, false, reason); setReject(null); setOpen(null) }}>رفض</Button></>}>
        <Field label="سبب الرفض" required hint="يظهر للمختبر"><Textarea value={reason} onChange={e => setReason(e.target.value)} className="min-h-16" /></Field>
      </Modal>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="مختبرات معتمدة للتعاقد" icon={Building2} bodyClass="p-0"><ul className="divide-y divide-ink-100">{orgs.filter(o => o.type === 'lab' && o.active).sort((a, b) => b.rating - a.rating).slice(0, 4).map(o => <li key={o.id} className="flex items-center justify-between px-3 py-2 text-[12px]"><Link to={`/directory/${o.id}`} className="truncate font-medium hover:underline">{o.name}</Link><span className="num shrink-0 text-warn-600">★ {o.rating.toFixed(1)} <span className="meta">· التزام {o.onTime}%</span></span></li>)}</ul></Section>
        <Section title="قواعد التعاقد" bodyClass="p-3"><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['طلب عرض السعر من دليل المنشآت لمختبر مفعّل فقط', 'المختبر يعدّل السعر عند العرض دون تغيير سعره الأساسي (B.R.116)', 'لا رد على العروض قبل اكتمال قائمة الاختبارات (B.R.119)', 'العرض صالح 14 يوماً ثم ينتهي تلقائياً', 'القبول يُنشئ عقداً فعّالاً موقّعاً بـ OTP'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></Section>
        <Section title="متوسط زمن الرد على العروض" bodyClass="p-3"><div className="num text-[26px] font-bold text-brand-800">1.6 <span className="text-[13px] text-ink-500">يوم</span></div><p className="meta">الهدف ≤ 2 يوم عمل · 92% من العروض تُقدَّم في الوقت</p></Section>
      </div>
    </>
  )
}
