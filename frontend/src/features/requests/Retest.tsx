import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RotateCcw, Send } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader } from '@/ds/composite'
import { Section, Field, Input, Textarea, Button, Callout, KV, Code, Modal, Table, Th, Td } from '@/ds/primitives'
import { fmtSAR, fmtDateTime } from '@/lib/format'
import type { TimeSlot } from '@/lib/types'

export default function Retest() {
  const { id, testId } = useParams()
  const nav = useNavigate()
  const r = useStore(s => s.requests.find(x => x.id === id))
  const refTests = useStore(s => s.refTests)
  const orgs = useStore(s => s.orgs)
  const rules = useStore(s => s.rules)
  const createRetest = useStore(s => s.createRetest)
  const t = r?.tests.find(x => x.id === testId)
  const rt = refTests.find(x => x.id === t?.refTestId)
  const minDate = new Date(Date.now() + rules.minLeadHours * 36e5).toISOString().slice(0, 10)
  const [slots, setSlots] = useState<TimeSlot[]>(Array.from({ length: rules.proposedSlots }, (_, i) => ({ date: new Date(Date.now() + (rules.minLeadHours + 24 * i) * 36e5).toISOString().slice(0, 10), from: '09:00', to: '12:00' })))
  const [notes, setNotes] = useState('يرجى التأكد من سحب العينة من العمق الصحيح المحدد في المخططات.')
  const [confirm, setConfirm] = useState(false)
  const existing = useStore(s => s.requests.find(x => x.parentRequestId === id && x.retestOf === testId))
  if (!r || !t || !rt) return <Callout tone="danger">الاختبار غير موجود.</Callout>
  if (t.status !== 'STS21') return <Callout tone="warn">إعادة الاختبار متاحة فقط للمخرجات المرفوضة من المكتب الاستشاري. <Link to={`/requests/${r.id}`} className="font-semibold underline">العودة إلى الطلب</Link></Callout>
  if (existing) return <Callout tone="info">سبق إنشاء طلب إعادة لهذا الاختبار: <Link to={`/requests/${existing.id}`} className="font-semibold underline">{existing.id}</Link> — يخضع لنفس دورة الحياة، ولا يمكن إنشاء إعادة ثانية قبل صدور قرار عليه.</Callout>
  const ok = slots.every(s => s.date >= minDate)
  return (
    <>
      <PageHeader crumbs={[{ label: 'طلبات الاختبارات', to: '/requests' }, { label: r.id, to: `/requests/${r.id}` }, { label: 'إعادة اختبار' }]} title="طلب إعادة الاختبار" sub={`رفض المكتب الاستشاري نتيجة ${rt.nameAr} — ${fmtDateTime(t.decidedAt)}`} />
      <Callout tone="danger" compact className="mb-3"><b>السبب الفني:</b> {t.rejectReason}</Callout>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <Section title="الاختبار المراد إعادته" bodyClass="p-3"><KV cols={3} dense items={[{ k: 'الاختبار', v: rt.nameAr }, { k: 'الطريقة', v: <Code>{t.method}</Code> }, { k: 'السعر', v: fmtSAR(t.price) }, { k: 'المختبر', v: orgs.find(o => o.id === r.labId)?.name }, { k: 'العقد', v: r.contractId }, { k: 'الطلب الأصلي', v: r.id }]} />
            {t.result && <Table className="mt-3"><thead><tr><Th>الحقل</Th><Th>النتيجة المرفوضة</Th></tr></thead><tbody>{Object.entries(t.result).map(([k, v]) => <tr key={k}><Td>{rt.resultFields?.find(f => f.key === k)?.label ?? k}</Td><Td className="num font-semibold text-danger-700">{v} {rt.resultFields?.find(f => f.key === k)?.unit}</Td></tr>)}</tbody></Table>}
          </Section>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="ملاحظات للمختبر بشأن الإعادة" bodyClass="p-3"><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-24" /></Section>
            <Section title="المواعيد المقترحة للإعادة" desc={`أول موعد ≥ ${rules.minLeadHours} ساعة`} bodyClass="p-3"><div className="grid gap-2">{slots.map((s, i) => <div key={i} className="grid grid-cols-[1fr_auto_auto] items-end gap-2"><Field label={`النطاق ${['الأول', 'الثاني', 'الثالث'][i]}`} required><Input type="date" min={minDate} value={s.date} onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} className="ltr" /></Field><Field label="من"><Input type="time" value={s.from} onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} className="ltr w-24!" /></Field><Field label="إلى"><Input type="time" value={s.to} onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} className="ltr w-24!" /></Field></div>)}</div></Section>
          </div>
        </div>
        <div className="col-span-12 xl:col-span-4"><Section title="ما سيحدث" icon={RotateCcw} bodyClass="p-3"><ol className="grid gap-2 text-[12.5px]">{['يُنشأ طلب اختبار جديد مستقل بلاحقة -R1 مرتبط بالطلب الأصلي (B.R.153)', `يُرسل للمختبر نفسه لاتخاذ قرار القبول خلال ${rules.labDecisionHours} ساعة`, 'يخضع لنفس دورة الحياة: عينة → تنفيذ → اعتماد الاستشاري', 'يُحتسب سعر الاختبار وفق العقد — دون رسوم إضافية للرفض الفني', 'يبقى الطلب الأصلي مكتملاً في السجل مع قرار الرفض'].map((s, i) => <li key={i} className="flex gap-2"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">{i + 1}</span>{s}</li>)}</ol><div className="mt-4 grid gap-2"><Button icon={Send} disabled={!ok} onClick={() => setConfirm(true)}>إرسال طلب الإعادة</Button><Button variant="ghost" onClick={() => nav(`/requests/${r.id}`)}>إلغاء</Button></div></Section></div>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="إرسال طلب الإعادة" width="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>تراجع</Button><Button onClick={async () => { const nid = await createRetest(r.id, t.id, slots, notes); if (nid) nav(`/requests/${nid}`) }}>نعم، أرسل</Button></>}><p className="text-[13px]">سيُنشئ النظام طلب اختبار جديداً مرتبطاً بالطلب الأصلي {r.id} ويُرسله للمختبر لاتخاذ قرار القبول.</p></Modal>
    </>
  )
}
