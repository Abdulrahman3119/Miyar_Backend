import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Sparkles, CheckCircle2, Plus, Beaker, FlaskConical } from 'lucide-react'
import { useStore } from '@/lib/store'
import { FileTile } from '@/ds/composite'
import { Section, Field, Input, Select, Textarea, Button, Callout, Badge, Table, Th, Td, Code, Modal, Tabs, Checkbox, Kpi, cx } from '@/ds/primitives'
import type { Sample, USCS, SampleTest } from '@/lib/types'
import { uid } from '@/lib/format'

const OPTIONAL = [{ name: 'اختبار الضغط غير المحصور (UCS)', method: 'ASTM D2166' }, { name: 'القص المباشر (Direct Shear)', method: 'ASTM D3080' }, { name: 'الكبريتات الكلية', method: 'BS 1377-3' }, { name: 'الانتفاخ الحر (Free Swell)', method: 'ASTM D4829' }, { name: 'الانضغاطية (Consolidation)', method: 'ASTM D2435' }, { name: 'الانهيارية (Collapse Index)', method: 'ASTM D5333' }]

export default function LabData() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))!
  const st = useStore(s => s.studies.find(x => x.requestId === id))!
  const patch = useStore(s => s.patchStudy)
  const [tab, setTab] = useState<'samples' | 'chemical'>('samples')
  const [open, setOpen] = useState<{ bh: string; s: Sample } | null>(null)
  const [partial, setPartial] = useState(false)
  const [partialReason, setPartialReason] = useState('')
  const isL = user.role === 'lab'
  const all = st.boreholes.flatMap(b => b.samples.map(s => ({ bh: b.code, bhId: b.id, s })))
  const doneCount = all.filter(x => x.s.labStatus === 'done').length
  const mandatoryDone = all.every(x => x.s.labStatus === 'done')
  const chem = st.chemical!
  const chemDone = chem.results.every(t => t.value && t.attachment)
  const sabkha = st.boreholes.some(b => b.layers.some(l => l.n != null && l.n <= 8))
  const evalChem = (t: SampleTest) => { if (!t.value) return undefined; const v = parseFloat(t.value); const lim = t.limit ?? ''; if (lim.includes('–')) { const [a, b] = lim.split('–').map(x => parseFloat(x)); return v >= a && v <= b ? 'ok' : 'fail' } const m = lim.match(/<\s*([\d.]+)/); return m ? (v < +m[1] ? 'ok' : 'fail') : undefined }
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="العينات" value={all.length} hint={`${all.filter(x => x.s.kind === 'rock').length} صخرية`} icon={FlaskConical} /><Kpi label="مكتملة معملياً" value={doneCount} tone="ok" hint={`${Math.round((doneCount / Math.max(1, all.length)) * 100)}%`} /><Kpi label="اختبارات إلزامية" value={all.reduce((a, x) => a + x.s.tests.filter(t => t.mandatory).length, 0)} hint="لا يجوز حذفها" /><Kpi label="اختبارات اختيارية" value={all.reduce((a, x) => a + x.s.tests.filter(t => !t.mandatory).length, 0)} /><Kpi label="الكيميائية" value={`${chem.results.filter(t => t.value).length}/${chem.results.length}`} tone={chemDone ? 'ok' : 'warn'} hint={chem.done ? 'معتمدة' : 'إلزامية على عينة واحدة'} /></div>
      {sabkha && <Callout tone="warn" compact><b>محفّز المحرك الذكي:</b> قيم SPT ≤ 8 في إحدى الطبقات — مؤشر تربة سبخة. يشترط SBC 303 §2.5.3 تحليلاً كيميائياً كاملاً للتربة <b>والمياه الجوفية</b> والتجفيف عند 60°C.</Callout>}
      <div className="card"><Tabs value={tab} onChange={setTab} className="px-3 pt-1" items={[{ value: 'samples', label: 'العينات والاختبارات المعملية', count: all.length }, { value: 'chemical', label: 'الاختبارات الكيميائية الإلزامية' }]} />
        <div className="p-3">
          {tab === 'samples' && <><Callout tone="info" compact className="mb-2">الإلزامي يُحدَّد تلقائياً بنوع العينة — سياسة المنصة المبنية على إحالات SBC 303 (ASTM D422 / D4318 / D2216 / D2487، وللصخر D7012). التصنيف المعملي (USCS) هو النهائي ويبقى الحقلي للمقارنة (B.R.199).</Callout>
            <Table><thead><tr><Th>الجسة</Th><Th>الطبقة</Th><Th>العينة</Th><Th>العمق</Th><Th>النوع</Th><Th>USCS حقلي</Th><Th>USCS معملي</Th><Th>الاختبارات</Th><Th>الحالة</Th><Th></Th></tr></thead><tbody>{all.map(({ bh, bhId, s }) => <tr key={s.id} className="hover:bg-ink-50"><Td className="font-bold text-brand-700">{bh}</Td><Td>{s.layerId}</Td><Td className="font-semibold">{s.id}</Td><Td className="num text-[12px]">{s.from}–{s.to} م</Td><Td><Badge tone={s.kind === 'rock' ? 'neutral' : 'info'} size="xs">{s.kind === 'rock' ? 'صخر' : 'تربة'} · {s.type}</Badge></Td><Td><Code>{s.fieldUSCS}</Code></Td><Td>{s.labUSCS ? <Code>{s.labUSCS}</Code> : <span className="meta">—</span>}</Td><Td className="text-[12px]"><span className="num">{s.tests.filter(t => t.value || t.attachment).length}/{s.tests.length}</span> <span className="meta">({s.tests.filter(t => t.mandatory).length} إلزامي)</span></Td><Td><Badge tone={s.labStatus === 'done' ? 'ok' : s.labStatus === 'in-progress' ? 'accent' : 'neutral'} dot size="xs">{{ ready: 'جاهزة', 'in-progress': 'قيد التنفيذ', done: 'مكتملة' }[s.labStatus]}</Badge></Td><Td><Button size="xs" variant={s.labStatus === 'done' ? 'ghost' : 'secondary'} onClick={() => setOpen({ bh: bhId, s })}>{s.labStatus === 'done' ? 'عرض' : 'تنفيذ'}</Button></Td></tr>)}</tbody></Table></>}
          {tab === 'chemical' && <div className="grid grid-cols-12 gap-3">
            <Section title="اختيار العينة" icon={Sparkles} desc="عينة واحدة على الأقل (B.R.204)" className="col-span-12 xl:col-span-4" bodyClass="p-2"><ul className="grid gap-1.5">{all.filter(x => x.s.kind === 'soil').map(({ bh, s }) => { const rec = chem.engineSuggestedSampleId === s.id; const sel = (chem.sampleId ?? chem.engineSuggestedSampleId) === s.id; return <li key={s.id}><button type="button" disabled={!isL || chem.done} onClick={() => patch(st.id, x => { x.chemical!.sampleId = s.id })} className={cx('w-full rounded-sm border p-2 text-start text-[12px]', sel ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}><div className="flex items-center justify-between font-semibold">{s.id} — {bh} · {s.layerId}{rec && <Badge tone="accent" size="xs"><Sparkles className="size-3" />موصى بها</Badge>}</div><div className="meta">{s.from}–{s.to} م{rec && ' — ضمن عمق التأسيس وتربة متجانسة في كل الجسات'}</div></button></li> })}</ul>{chem.sampleId && chem.sampleId !== chem.engineSuggestedSampleId && <Field label="سبب اختيار عينة غير الموصى بها" required className="mt-2"><Textarea value={chem.reasonOverride ?? ''} onChange={e => patch(st.id, x => { x.chemical!.reasonOverride = e.target.value })} disabled={chem.done} className="min-h-14" /></Field>}</Section>
            <Section title={`نتائج التحليل الكيميائي — عينة ${chem.sampleId ?? chem.engineSuggestedSampleId}`} icon={Beaker} desc="المطابقة لكل اختبار وفق الحدود المرجعية (SBC 303/304)" className="col-span-12 xl:col-span-8" bodyClass="p-0"><Table className="border-0"><thead><tr><Th>الاختبار</Th><Th>الطريقة</Th><Th>الحد المرجعي</Th><Th>النتيجة</Th><Th>المرفق</Th><Th>المطابقة</Th></tr></thead><tbody>{chem.results.map(t => { const c = evalChem(t); return <tr key={t.id}><Td className="font-semibold">{t.name}</Td><Td><Code>{t.method}</Code></Td><Td className="ltr num text-[12px]">{t.limit}</Td><Td><Input value={t.value ?? ''} onChange={e => patch(st.id, x => { x.chemical!.results.find(y => y.id === t.id)!.value = e.target.value })} suffix={t.unit} className="ltr h-8 w-28!" disabled={!isL || chem.done} /></Td><Td>{t.attachment ? <span className="text-[11.5px] text-brand-700">{t.attachment}</span> : <button type="button" disabled={!isL || chem.done} onClick={() => patch(st.id, x => { x.chemical!.results.find(y => y.id === t.id)!.attachment = `${t.id}-report.pdf` })} className="text-[11.5px] text-ink-600 underline">رفع التقرير</button>}</Td><Td>{c ? <Badge tone={c === 'ok' ? 'ok' : 'danger'} dot size="xs">{c === 'ok' ? 'متوافق' : 'غير متوافق'}</Badge> : <span className="meta">—</span>}</Td></tr> })}</tbody></Table>
              {isL && !chem.done && <div className="border-t border-ink-200 p-3">{!mandatoryDone && <div className="grid gap-2"><Checkbox checked={partial} onChange={setPartial} label={`لم تكتمل جميع اختبارات العينات (${all.length - doneCount} عينة) — إكمال المرحلة جزئياً`} />{partial && <Field label="سبب الإكمال الجزئي" required hint="يظهر في تفاصيل الدراسة ومعاينة التقرير (B.R.206)"><Textarea value={partialReason} onChange={e => setPartialReason(e.target.value)} className="min-h-14" /></Field>}</div>}<div className="mt-2 flex justify-end"><Button icon={CheckCircle2} disabled={!chemDone || (!mandatoryDone && (!partial || partialReason.trim().length < 10))} onClick={() => { patch(st.id, x => { x.chemical!.done = true; x.chemical!.partialReason = partial ? partialReason : undefined; x.phase = 5 }); nav(`/requests/${r.id}/study/5`) }}>اعتماد النتائج — اكتمال البيانات المعملية</Button></div></div>}
              {chem.done && <Callout tone="ok" compact className="m-3">اكتملت البيانات المعملية.{chem.partialReason && ` إكمال جزئي — ${chem.partialReason}`}</Callout>}
            </Section>
          </div>}
        </div>
      </div>
      {open && <SampleModal bhId={open.bh} sample={open.s} onClose={() => setOpen(null)} readOnly={!isL || open.s.labStatus === 'done'} />}
    </div>
  )
}

function SampleModal({ bhId, sample: s0, onClose, readOnly }: { bhId: string; sample: Sample; onClose: () => void; readOnly: boolean }) {
  const { id } = useParams()
  const st = useStore(s => s.studies.find(x => x.requestId === id))!
  const patch = useStore(s => s.patchStudy)
  const s = st.boreholes.find(b => b.id === bhId)!.samples.find(x => x.id === s0.id)!
  const [uscs, setUscs] = useState<USCS | ''>(s.labUSCS ?? '')
  const [addOpt, setAddOpt] = useState(false)
  const upd = (fn: (x: Sample) => void) => patch(st.id, st2 => { const x = st2.boreholes.find(b => b.id === bhId)!.samples.find(y => y.id === s.id)!; fn(x); if (x.labStatus === 'ready') x.labStatus = 'in-progress' })
  const isUscs = (t: { id: string }) => t.id.endsWith('-uscs')
  const mandatoryOk = s.tests.filter(t => t.mandatory && !isUscs(t)).every(t => (t.unit ? t.value : t.attachment))
  const canApprove = mandatoryOk && (s.kind === 'rock' || uscs)
  const pi = s.tests.find(t => t.name.includes('أتربرج'))?.value?.match(/PI\s*(\d+)/)?.[1]
  return (
    <Modal open onClose={onClose} title={`عينة ${s.id} — ${s.kind === 'rock' ? 'صخر' : 'تربة'}`} sub={`عمق ${s.from}–${s.to} م · الطبقة ${s.layerId} · حقلي ${s.fieldUSCS}`} width="lg" footer={<><Button variant="secondary" onClick={onClose}>{readOnly ? 'إغلاق' : 'حفظ كمسودة'}</Button>{!readOnly && <Button icon={CheckCircle2} disabled={!canApprove} onClick={() => { upd(x => { x.labStatus = 'done'; if (uscs) { x.labUSCS = uscs as USCS; const u = x.tests.find(isUscs); if (u) u.value = uscs } }); onClose() }}>{s.kind === 'rock' ? 'اعتماد النتيجة' : 'اعتماد التصنيف المعملي وحفظ النتائج'}</Button>}</>}>
      <div className="mb-2 data-label">الاختبارات الإلزامية</div>
      <ul className="grid gap-1.5">{s.tests.filter(t => t.mandatory && !isUscs(t)).map(t => <li key={t.id} className="grid items-center gap-2 rounded-sm border border-ink-200 p-2 sm:grid-cols-[1fr_170px_200px]"><div><Badge tone="danger" size="xs">إلزامي</Badge> <span className="ms-1 text-[12.5px] font-semibold">{t.name}</span> <Code>{t.method}</Code></div><Input value={t.value ?? ''} onChange={e => upd(x => { x.tests.find(y => y.id === t.id)!.value = e.target.value })} placeholder={t.unit ? `النتيجة (${t.unit})` : 'ملخص النتيجة'} className="ltr h-8" disabled={readOnly} />{t.unit ? <span className="meta">يُدخل كرقم</span> : <FileTile name={t.attachment} size={t.attachment ? '0.9 MB' : undefined} onChange={readOnly ? undefined : () => upd(x => { x.tests.find(y => y.id === t.id)!.attachment = `${t.method.replace(/\s/g, '')}-${s.id}.pdf` })} hint="تقرير الاختبار" />}</li>)}</ul>
      {pi && +pi >= 15 && <Callout tone="warn" compact className="mt-2"><Sparkles className="me-1 inline size-3.5" />PI = {pi} ≥ 15 — أحد معايير التربة الانتفاخية في SBC 303؛ يوصي المحرك بإضافة اختبار الانتفاخ (ASTM D4829).</Callout>}
      <div className="mt-3 flex items-center justify-between"><span className="data-label">الاختبارات الاختيارية</span>{!readOnly && <Button size="xs" variant="secondary" icon={Plus} onClick={() => setAddOpt(true)}>إضافة</Button>}</div>
      {s.tests.filter(t => !t.mandatory).length === 0 ? <p className="meta mt-1">لا اختبارات اختيارية على هذه العينة.</p> : <ul className="mt-1.5 grid gap-1.5">{s.tests.filter(t => !t.mandatory).map(t => <li key={t.id} className="grid items-center gap-2 rounded-sm border border-ink-200 p-2 sm:grid-cols-[1fr_170px]"><div className="text-[12.5px]"><b>{t.name}</b> <Code>{t.method}</Code></div><Input value={t.value ?? ''} onChange={e => upd(x => { x.tests.find(y => y.id === t.id)!.value = e.target.value })} placeholder="النتيجة" className="ltr h-8" disabled={readOnly} /></li>)}</ul>}
      {s.kind === 'soil' && <div className="mt-3 rounded-sm bg-ink-50 p-3"><div className="mb-2 text-[12.5px] font-bold">التصنيف المعملي النهائي (USCS — ASTM D2487)</div><div className="grid gap-3 sm:grid-cols-2"><Field label="التصنيف الحقلي"><Input value={`${s.fieldUSCS} (للمقارنة فقط)`} readOnly /></Field><Field label="التصنيف المعملي المعتمد" required><Select value={uscs} onChange={e => setUscs(e.target.value as USCS)} disabled={readOnly}><option value="">اختر…</option>{['SM', 'SC', 'SW', 'SP', 'ML', 'CL', 'CH', 'GW', 'GP'].map(u => <option key={u} value={u}>{u}</option>)}</Select></Field></div></div>}
      <Modal open={addOpt} onClose={() => setAddOpt(false)} title="إضافة اختبار اختياري" sub="من قائمة إدارة المنتج" width="sm"><ul className="divide-y divide-ink-100">{OPTIONAL.map(o => <li key={o.method} className="flex items-center justify-between py-2 text-[12.5px]"><span>{o.name} <Code>{o.method}</Code></span><Button size="xs" variant="secondary" onClick={() => { upd(x => { x.tests.push({ id: uid('t'), name: o.name, method: o.method, mandatory: false }) }); setAddOpt(false) }}>اختيار</Button></li>)}</ul></Modal>
    </Modal>
  )
}
