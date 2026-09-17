import { useState, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Sparkles, CheckCircle2, Plus, Trash2, Users, Layers, MapPin, ArrowLeft, FileText, Camera } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader, PhaseStepper, PlotMap, Countdown, Timeline } from '@/ds/composite'
import { GeoMap, PhotoGrid } from '@/ds/evidence'
import { photosFor } from '@/lib/evidence'
import { Section, KV, Badge, Button, ButtonLink, Callout, Kpi, Input, Field, Textarea, Modal, Table, Th, Td, StatusPill, Checkbox, Code, cx } from '@/ds/primitives'
import { BOREHOLE_STATUS } from '@/lib/statuses'
import { fmtDate, uid } from '@/lib/format'
import type { Borehole } from '@/lib/types'
import LabData from './LabData'
import Analysis from './Analysis'
import ReportPreview from './ReportPreview'

export default function Study() {
  const { id, phase: phaseParam } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))
  const st = useStore(s => s.studies.find(x => x.requestId === id))
  const orgs = useStore(s => s.orgs)
  if (!r || !st) return <Callout tone="danger">مسار الدراسة غير متاح لهذا الطلب.</Callout>
  // Phases ahead of the study's progress are not reachable by URL either (B.R.166/192/206)
  const requested = phaseParam ? +phaseParam : st.phase
  const view = Math.min(Math.max(1, requested || st.phase), st.phase)
  const org = (oid: string) => orgs.find(o => o.id === oid)?.name ?? oid
  const done = st.boreholes.filter(b => b.status === 'done').length
  const samples = st.boreholes.flatMap(b => b.samples)
  return (
    <>
      <PageHeader crumbs={[{ label: 'طلبات الاختبارات', to: '/requests' }, { label: r.id, to: `/requests/${r.id}` }, { label: 'الدراسة الجيوتقنية' }]}
        title={<span className="flex flex-wrap items-center gap-2">دراسة جيوتقنية — {r.project}<StatusPill code={r.status} /></span>} sub={`${st.ref} · ${r.contractId} · ${org(r.labId)} · إشراف ${org(r.consultantId)} · قطعة ${st.prelim.parcel} مخطط ${st.prelim.plan}`}
        meta={<><Badge tone="info" size="xs">SBC 303 — الفصل 2</Badge>{st.compliance != null && <Badge tone={st.compliance >= 90 ? 'ok' : 'warn'} size="xs">الالتزام بخطة الاستكشاف {st.compliance}%</Badge>}{r.status === 'STS14' && r.tests[0]?.deadlineAt && <Countdown until={r.tests[0].deadlineAt} label="SLA الدراسة" warnBelow={72} />}</>}
        actions={<>{user.role === 'lab' && user.canDelegate && <ButtonLink to="/delegations" variant="secondary" icon={Users}>الموظف المسؤول</ButtonLink>}<ButtonLink to={`/requests/${r.id}`} variant="secondary" icon={FileText}>الطلب</ButtonLink></>} />
      <div className="mb-3 grid grid-cols-3 gap-3 md:grid-cols-6">
        <Kpi label="المرحلة الحالية" value={st.phase} unit="/ 6" hint={['', 'البيانات الأولية', 'خطة الاستكشاف', 'الأعمال الميدانية', 'البيانات المعملية', 'التحليل الهندسي', 'التقرير'][st.phase]} tone="accent" />
        <Kpi label="الجسات" value={`${done}/${st.boreholes.length}`} hint="مكتملة" icon={Layers} />
        <Kpi label="الطبقات المسجّلة" value={st.boreholes.reduce((a, b) => a + b.layers.length, 0)} />
        <Kpi label="العينات" value={samples.length} hint={`${samples.filter(s => s.labStatus === 'done').length} مكتملة معملياً`} />
        <Kpi label="العمق المنفَّذ" value={st.boreholes.reduce((a, b) => a + (b.executedDepth ?? 0), 0)} unit="م" hint={`من ${st.boreholes.reduce((a, b) => a + b.approvedDepth, 0)} م معتمدة`} />
        <Kpi label="الصور الميدانية" value={st.boreholes.reduce((a, b) => a + b.photos.length, 0)} icon={Camera} />
      </div>
      <div className="mb-3"><PhaseStepper current={st.phase} onSelect={n => n <= st.phase && nav(`/requests/${r.id}/study/${n}`)} /></div>
      {requested > st.phase && <Callout tone="warn" compact className="mb-3">المرحلة {requested} لم تبدأ بعد — الدراسة في المرحلة {st.phase} ({['', 'البيانات الأولية', 'خطة الاستكشاف', 'الأعمال الميدانية', 'البيانات المعملية', 'التحليل الهندسي', 'التقرير'][st.phase]}). لا يمكن تجاوز المراحل (B.R.192/206).</Callout>}
      {view === 1 && <Phase1 />}{view === 2 && <Phase2 />}{view === 3 && <Phase3 />}{view === 4 && <LabData />}{view === 5 && <Analysis />}{view === 6 && <ReportPreview />}
      {view < st.phase && <p className="meta mt-3">تعرض هذه المرحلة للقراءة فقط — المرحلة الحالية {st.phase}. حالة الطلب محكومة بالإطار العام؛ الشريط يعرض تقدّم الدراسة فقط (B.R.166).</p>}
    </>
  )
}

function Phase1() {
  const { id } = useParams()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))!
  const st = useStore(s => s.studies.find(x => x.requestId === id))!
  const patch = useStore(s => s.patchStudy)
  const runEngine = useStore(s => s.runEngine)
  const [notes, setNotes] = useState(st.prelim.reviewNotes ?? '')
  const [edit, setEdit] = useState(false)
  const [p, setP] = useState(st.prelim)
  const isK = user.role === 'consultant'; const p0 = st.prelim
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
        {isK && !p0.approvedByConsultant && <Callout tone="warn" compact>الطلب بانتظارك — راجع البيانات الأولية كما أرسلها المقاول، يمكنك تعديل المستخرج مع تسجيل التعديل (B.R.171)، ثم اعتمد لتشغيل المحرك الذكي.</Callout>}
        {p0.approvedByConsultant && <Callout tone="ok" compact>اعتُمدت البيانات الأولية من المكتب الاستشاري{p0.reviewNotes && ` — ${p0.reviewNotes}`}.</Callout>}
        <Section title="بيانات الموقع (من القرار المساحي)" icon={MapPin} actions={isK && !p0.approvedByConsultant && <Button size="xs" variant="secondary" onClick={() => setEdit(true)}>تعديل المستخرج</Button>} bodyClass="p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_260px]"><KV cols={3} dense items={[{ k: 'رقم القطعة / المخطط', v: `${p0.parcel} / ${p0.plan}` }, { k: 'الحي / المدينة', v: `${p0.district} — ${p0.city}` }, { k: 'المنطقة', v: p0.region }, { k: 'مساحة الأرض', v: `${p0.area} م²` }, { k: 'المساحة المحسوبة', v: `${p0.computedArea} م²` }, { k: 'التحقق من الحدود', v: <Badge tone="ok" size="xs">مطابق</Badge> }, { k: 'رقم الصك', v: p0.deedNo }, { k: 'تاريخ الصك', v: p0.deedDate }, { k: 'الملف', v: p0.deedFile }]} /><PlotMap polygon={st.polygon} pins={[]} height={140} /></div>
        </Section>
        <div className="grid gap-3 md:grid-cols-2"><Section title="المالك والمشروع" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'المالك', v: p0.owner }, { k: 'الهوية', v: p0.ownerId }, { k: 'نوع المنشأ', v: { residential: 'سكني', commercial: 'تجاري', industrial: 'صناعي' }[p0.buildingType ?? 'residential'] }, { k: 'الهيكل', v: p0.structure === 'rc' ? 'خرساني مسلح' : 'معدني' }, { k: 'الأدوار', v: p0.floors }, { k: 'المساحة المبنية', v: `${p0.builtArea} م²` }, { k: 'الأساسات المتوقعة', v: { unknown: 'غير محدد', isolated: 'منفصلة', raft: 'لبشة' }[p0.foundationType ?? 'unknown'] }, { k: 'عمق التأسيس', v: `${p0.foundationDepth} م` }]} /></Section><Section title="عوامل الموقع" bodyClass="p-3"><KV cols={1} dense items={[{ k: 'معلومات سابقة عن التربة', v: p0.priorInfo ? 'نعم' : 'لا' }, { k: 'مبانٍ مجاورة قريبة', v: p0.neighbors ? 'نعم — يُراعى في عمق الجسات (§2.4.3)' : 'لا' }, { k: 'ظروف الموقع', v: p0.siteConditions.join('، ') || '—' }, { k: 'رخصة البناء', v: p0.permitNo ?? '—' }]} /></Section></div>
      </div>
      <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
        {isK && !p0.approvedByConsultant ? <Section title="قرار المراجعة" className="border-brand-300 ring-2 ring-brand-100" bodyClass="p-3"><Field label="ملاحظات المراجعة (اختياري)"><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-16" /></Field><Button className="mt-3 w-full" icon={CheckCircle2} onClick={() => { patch(st.id, s => { s.prelim.approvedByConsultant = true; s.prelim.reviewNotes = notes; s.phase = 2 }); runEngine(st.id); useStore.getState().toast({ title: 'اعتُمدت البيانات الأولية', body: 'شغّل المحرك الذكي خطة الاستكشاف المقترحة.', tone: 'ok' }) }}>اعتماد وتشغيل المحرك الذكي</Button></Section> : <Section title="سجل الدراسة" bodyClass="p-3"><Timeline entries={r.history.filter(h => h.actorRole === 'consultant' || h.action.includes('الأولية'))} limit={5} /></Section>}
        <Section title="اكتمال البيانات الأولية" desc="متطلبات B.R.160–165" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]">{[['القرار المساحي مرفوع ومستخرج آلياً', !!p0.deedFile], ['المساحة المحسوبة مطابقة للصك (±1%)', !!p0.boundaryOk], ['بيانات المالك والهوية', !!p0.owner && !!p0.ownerId], ['نوع المنشأة والهيكل وعدد الأدوار', !!p0.buildingType && !!p0.floors], ['المساحة المبنية وعمق التأسيس', !!p0.builtArea && p0.foundationDepth != null], ['ظروف الموقع والمباني المجاورة', (p0.siteConditions?.length ?? 0) > 0]].map(([t, ok]: any) => <li key={t} className="flex items-center gap-2">{ok ? <CheckCircle2 className="size-3.5 shrink-0 text-ok-500" /> : <span className="size-3.5 shrink-0 rounded-full border-2 border-warn-500" />}<span className={ok ? 'text-ink-700' : 'text-warn-700'}>{t}</span></li>)}</ul></Section>
      </div>
      <Modal open={edit} onClose={() => setEdit(false)} title="تعديل البيانات المستخرجة" sub="يُسجَّل التعديل في سجل الدراسة" width="lg" footer={<><Button variant="secondary" onClick={() => setEdit(false)}>إلغاء</Button><Button onClick={() => { patch(st.id, s => { s.prelim = { ...p } }); setEdit(false); useStore.getState().toast({ title: 'عُدّلت البيانات', tone: 'ok' }) }}>حفظ</Button></>}><div className="grid gap-3 sm:grid-cols-3">{(['parcel', 'plan', 'district', 'city', 'deedNo', 'owner'] as const).map(k => <Field key={k} label={{ parcel: 'رقم القطعة', plan: 'المخطط', district: 'الحي', city: 'المدينة', deedNo: 'رقم الصك', owner: 'المالك' }[k]}><Input value={(p as any)[k] ?? ''} onChange={e => setP({ ...p, [k]: e.target.value })} /></Field>)}<Field label="المساحة"><Input type="number" value={p.area ?? ''} onChange={e => setP({ ...p, area: +e.target.value })} suffix="م²" className="ltr" /></Field><Field label="المساحة المبنية"><Input type="number" value={p.builtArea ?? ''} onChange={e => setP({ ...p, builtArea: +e.target.value })} suffix="م²" className="ltr" /></Field><Field label="عدد الأدوار"><Input type="number" value={p.floors ?? ''} onChange={e => setP({ ...p, floors: +e.target.value })} className="ltr" /></Field></div></Modal>
    </div>
  )
}

function Phase2() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))!
  const st = useStore(s => s.studies.find(x => x.requestId === id))!
  const patch = useStore(s => s.patchStudy)
  const rules = useStore(s => s.rules)
  const [just, setJust] = useState(st.plan.justification ?? '')
  const [addBH, setAddBH] = useState(false)
  const [newDepth, setNewDepth] = useState(String(st.plan.engineSuggestion?.depth ?? rules.minBoreholeDepth))
  const [del, setDel] = useState<Borehole | null>(null)
  const [confirm, setConfirm] = useState(false)
  const e = st.plan.engineSuggestion
  const isK = user.role === 'consultant' && useStore.getState().can('study.plan.approve') && !st.plan.approved
  // Snapshot of the engine's proposal at first render — any deviation (count, position, depth) must be justified (B.R.174)
  const proposal = useRef<Record<string, { n: number; e: number; d: number }>>(Object.fromEntries(st.boreholes.map(b => [b.id, { n: b.approved.n, e: b.approved.e, d: b.approvedDepth }])))
  const reduced = !!e && st.boreholes.length < e.count
  const added = !!e && st.boreholes.length > e.count
  const moved = st.boreholes.some(b => b.approvedDepth !== e?.depth)
  const movedPos = st.boreholes.some(b => { const o = proposal.current[b.id]; return o && (Math.abs(o.n - b.approved.n) > 0.00002 || Math.abs(o.e - b.approved.e) > 0.00002) })
  const deviates = reduced || added || moved || movedPos
  const needsJust = deviates && just.trim().length < 10
  const maxSpacing = (() => { let m = 0; for (const a of st.boreholes) for (const b of st.boreholes) m = Math.max(m, Math.hypot((a.approved.n - b.approved.n) * 111000, (a.approved.e - b.approved.e) * 101000)); return Math.round(m) })()
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
        {e?.special ? <Callout tone="danger" compact><b>يتطلب دراسة خاصة (Special investigation).</b> ≥ 5 أدوار أو مساحة مبنية &gt; 5000 م² — الكود لا يحدد عدداً افتراضياً؛ يحدد الاستشاري عدد الجسات وأعماقها بمبرر فني.</Callout> : e ? <Callout tone="info" compact><Sparkles className="me-1 inline size-3.5" />اقترح المحرك الذكي الخطة وفق <b>{e.ref}</b> — يمكنك تعديل المواقع بالسحب أو الأعماق أو إضافة/حذف جسات مع توضيح المبرر عند التقليل (B.R.174).</Callout> : <Callout tone="warn" compact><b>لم يُنتج المحرك الذكي خطة</b> (لم يُشغَّل أو تعذّرت المعالجة — B.R.230). يستمر الإجراء النظامي: يضيف الاستشاري الجسات يدوياً من زر «إضافة جسة» ويعتمد الخطة بمبرر فني.</Callout>}
        <div className="grid grid-cols-3 gap-3"><Kpi label="عدد الجسات" value={st.boreholes.length} hint={e ? `المقترح ${e.count} · ${e.ref.split('،')[1]?.trim()}` : ''} icon={MapPin} tone={reduced ? 'warn' : 'neutral'} /><Kpi label="أقصى تباعد" value={maxSpacing} unit="م" hint="محسوب من التوزيع الحالي" /><Kpi label="العمق المقترح" value={e?.depth ?? '—'} unit="م" hint={`حد المنصة ${rules.minBoreholeDepth} م · الكود من قاع الأساس`} /></div>
        <Section title="خريطة الجسات المقترحة" icon={MapPin} desc={isK ? 'اسحب الجسة لتغيير موقعها' : undefined} bodyClass="p-2"><PlotMap polygon={st.polygon} pins={st.boreholes.map(b => ({ code: b.code, ...b.approved }))} height={260} onDrag={isK ? (code, c) => patch(st.id, s => { const b = s.boreholes.find(x => x.code === code)!; b.approved = c }) : undefined} /></Section>
        <Section title="تفاصيل الجسات" actions={isK && <Button size="xs" variant="secondary" icon={Plus} onClick={() => setAddBH(true)}>إضافة جسة</Button>} bodyClass="p-0"><Table className="border-0"><thead><tr><Th>الجسة</Th><Th>الإحداثيات (N, E)</Th><Th>العمق (م)</Th><Th>المصدر</Th>{isK && <Th></Th>}</tr></thead><tbody>{st.boreholes.map(b => <tr key={b.id}><Td className="font-bold text-brand-700">{b.code}</Td><Td className="ltr num text-[12px]">{b.approved.n.toFixed(5)}, {b.approved.e.toFixed(5)}</Td><Td>{isK ? <Input type="number" value={b.approvedDepth} onChange={ev => patch(st.id, s => { s.boreholes.find(x => x.id === b.id)!.approvedDepth = +ev.target.value })} className="ltr h-8 w-24!" /> : <span className="num">{b.approvedDepth}</span>}</Td><Td><Badge tone="accent" size="xs">المحرك الذكي</Badge></Td>{isK && <Td><Button size="xs" variant="ghost" icon={Trash2} className="text-danger-600" onClick={() => setDel(b)}>حذف</Button></Td>}</tr>)}</tbody></Table></Section>
      </div>
      <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
        <Section title="أساس التوصية" icon={Sparkles} bodyClass="p-3"><ul className="grid gap-1.5 text-[12px] text-ink-700">{e?.basis.map(b => <li key={b} className="flex gap-1.5"><span className="text-brand-600">•</span>{b}</li>)}</ul><div className="mt-2 border-t border-ink-100 pt-2 meta">المرجع: {e?.ref}. القيم من طبعتي 2007/2018 — تأكيد طبعة 2024 مطلوب من الإدارة العامة لكود البناء.</div></Section>
        {isK ? <Section title="اعتماد خطة الاستكشاف" className="border-brand-300 ring-2 ring-brand-100" bodyClass="p-3">{deviates && <Field label="المبرر الفني" required hint={`إلزامي عند أي تعديل على مقترح المحرك — ${[reduced && 'تقليل العدد', added && 'إضافة جسات', movedPos && 'تغيير المواقع', moved && 'تعديل الأعماق'].filter(Boolean).join('، ')} (B.R.174)`}><Textarea value={just} onChange={ev => setJust(ev.target.value)} className="min-h-16" /></Field>}<Callout tone="warn" compact className="mt-2">بعد الاعتماد تُجمَّد الخطة كمرجع رسمي لقياس الالتزام، ويُحال الطلب للمختبر لقرار القبول خلال {rules.labDecisionHours} ساعة.</Callout><div className="mt-3 grid gap-2"><Button icon={CheckCircle2} disabled={st.boreholes.length === 0 || needsJust} onClick={() => setConfirm(true)}>اعتماد الخطة وإرسال الطلب للمختبر</Button><Button variant="ghost" onClick={() => nav(`/requests/${r.id}/study/1`)}>رجوع</Button></div></Section>
          : st.plan.approved ? <Callout tone="ok" compact>اعتُمدت خطة الاستكشاف بتاريخ {fmtDate(st.plan.approvedAt)} — {st.boreholes.length} جسات.{st.plan.justification && ` المبرر: ${st.plan.justification}`}</Callout> : <Callout tone="info" compact>بانتظار اعتماد المكتب الاستشاري لخطة الاستكشاف.</Callout>}
        <Section title="SBC 303 — Table 2.1 (مرجع المحرك)" desc="عدد الجسات وعمقها" bodyClass="p-0">
          <table className="w-full text-[11.5px]"><thead><tr className="bg-ink-50 text-[10.5px] text-ink-500"><th className="px-3 py-1.5 text-start font-semibold">الصف</th><th className="px-2 py-1.5 text-start font-semibold">الجسات</th><th className="px-3 py-1.5 text-start font-semibold">العمق من قاع الأساس</th></tr></thead>
            <tbody>{[['≤2 دور · < 600 م²', '3', '⅔ ≥ 4 م · ⅓ ≥ 6 م'], ['≤2 دور · 600–5000 م²', '3 + 1/700 م²', '⅔ ≥ 5 م · ⅓ ≥ 8 م'], ['3–4 أدوار · < 600 م²', '3', '⅔ ≥ 6 م · ⅓ ≥ 9 م'], ['3–4 أدوار · 600–5000 م²', '3 + 1/700 م²', '⅔ ≥ 8 م · ⅓ ≥ 12 م'], ['≤4 أدوار · > 5000 م²', 'دراسة خاصة', 'حسب الاستشاري'], ['≥5 أدوار · أي مساحة', 'دراسة خاصة', 'حسب الاستشاري']].map(([a, b, c], idx) => { const active = (st.plan.engineSuggestion?.basis[0] ?? '').includes(a.split(' · ')[0]) && (st.plan.engineSuggestion?.basis[0] ?? '').includes(a.split(' · ')[1].replace('< 600 م²', '< 600').slice(0, 5)); return <tr key={idx} className={cx('border-t border-ink-100', active && 'bg-brand-50 font-semibold text-brand-800')}><td className="px-3 py-1.5">{a}</td><td className="num px-2 py-1.5">{b}</td><td className="px-3 py-1.5">{c}</td></tr> })}</tbody></table>
          <p className="meta px-3 py-2">الصف المظلّل هو المطبّق على هذه الدراسة. الحد الأدنى 10 م سياسة منصة قابلة للتهيئة من الإعدادات.</p>
        </Section>
      </div>
      <Modal open={addBH} onClose={() => setAddBH(false)} title="إضافة جسة" width="sm" footer={<><Button variant="secondary" onClick={() => setAddBH(false)}>إلغاء</Button><Button onClick={() => { patch(st.id, s => { const c = s.polygon.reduce((a, p) => ({ n: a.n + p.n / s.polygon.length, e: a.e + p.e / s.polygon.length }), { n: 0, e: 0 }); s.boreholes.push({ id: uid('bh'), code: `BH-${String(s.boreholes.length + 1).padStart(2, '0')}`, approved: { n: +c.n.toFixed(5), e: +c.e.toFixed(5) }, approvedDepth: +newDepth, status: 'ready', layers: [], samples: [], photos: [] }) }); setAddBH(false) }}>إضافة</Button></>}><Field label="العمق المقترح" required><Input type="number" value={newDepth} onChange={ev => setNewDepth(ev.target.value)} suffix="م" className="ltr" /></Field><p className="meta mt-2">بعد الإضافة اسحب الجسة إلى موقعها على الخريطة.</p></Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title={`حذف الجسة ${del?.code}`} width="sm" footer={<><Button variant="secondary" onClick={() => setDel(null)}>إلغاء</Button><Button variant="danger" disabled={just.trim().length < 10} onClick={() => { patch(st.id, s => { s.boreholes = s.boreholes.filter(x => x.id !== del!.id) }); setDel(null) }}>حذف</Button></>}><Field label="سبب الحذف" required><Textarea value={just} onChange={ev => setJust(ev.target.value)} /></Field></Modal>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="اعتماد خطة الاستكشاف" width="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>تراجع</Button><Button onClick={() => { patch(st.id, s => { s.plan.approved = true; s.plan.approvedAt = new Date().toISOString(); s.plan.justification = just || undefined; s.phase = 3; s.boreholes.forEach(b => { b.operational = { ...b.approved } }) }); useStore.setState(s => ({ requests: s.requests.map(x => x.id === r.id ? { ...x, status: 'STS11', labDeadlineAt: new Date(Date.now() + rules.labDecisionHours * 36e5).toISOString(), history: [...x.history, { id: uid('h'), at: new Date().toISOString(), actor: user.name, actorRole: 'consultant', action: 'اعتماد خطة الاستكشاف وإرسال الطلب للمختبر', detail: `${st.boreholes.length} جسات · ${e?.depth} م` }] } : x) })); setConfirm(false); nav(`/requests/${r.id}`) }}>نعم، اعتمد وأرسل</Button></>}><p className="text-[13px]">ستُثبَّت الخطة ({st.boreholes.length} جسات) كمرجع رسمي لا يتغير، ويُرسل الطلب إلى المختبر.</p></Modal>
    </div>
  )
}

function Phase3() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))!
  const st = useStore(s => s.studies.find(x => x.requestId === id))!
  const patch = useStore(s => s.patchStudy)
  const [editPlan, setEditPlan] = useState(false)
  const [addBH, setAddBH] = useState(false)
  const [reason, setReason] = useState('')
  const [ack, setAck] = useState(false)
  const isL = user.role === 'lab'
  const accepted = r.status === 'STS12' || r.status === 'STS14'
  const done = st.boreholes.filter(b => b.status === 'done').length
  const allDone = done === st.boreholes.length && st.boreholes.length > 0
  const compliance = Math.round(100 - st.boreholes.reduce((a, b) => a + (b.moved ?? 0) * 2 + (b.addedByLab ? 4 : 0), 0))
  if (!accepted) return <Callout tone="warn" compact>بانتظار قرار المختبر على الطلب (قبول/رفض) قبل بدء الأعمال الميدانية. <Link to={`/requests/${r.id}`} className="font-semibold underline">الانتقال إلى الطلب</Link></Callout>
  if (!st.fieldPlanReviewed) return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
        <Callout tone="info" compact>خطتك التشغيلية المبنية على خطة الاستشاري المعتمدة. يمكنك <b>نقل جسة</b> أو <b>إضافة جسة</b> بمبرر فني وإقرار — لا يمكن حذف جسة أو تعديل عمقها المعتمد؛ خطة الاستشاري الأصلية تبقى مرجعاً ثابتاً (B.R.178).</Callout>
        <Section title="خطة التنفيذ الميداني (خاصتك)" actions={isL && <div className="flex gap-1.5">{editPlan ? <><Button size="xs" variant="secondary" onClick={() => setEditPlan(false)}>إنهاء التعديل</Button><Button size="xs" variant="secondary" icon={Plus} onClick={() => setAddBH(true)}>إضافة جسة</Button></> : <Button size="xs" variant="secondary" onClick={() => setEditPlan(true)}>تعديل</Button>}</div>} bodyClass="p-2">
          <PlotMap polygon={st.polygon} height={260} pins={[...st.boreholes.map(b => ({ code: b.code, ...(b.operational ?? b.approved), status: b.status })), ...st.boreholes.filter(b => b.moved).map(b => ({ code: b.code + '′', ...b.approved, ghost: true }))]} onDrag={editPlan ? (code, c) => patch(st.id, s => { const b = s.boreholes.find(x => x.code === code)!; b.operational = c; b.moved = Math.round(Math.hypot((c.n - b.approved.n) * 111000, (c.e - b.approved.e) * 101000)) }) : undefined} />
          <Table className="mt-2 border-0"><thead><tr><Th>الجسة</Th><Th>المعتمد</Th><Th>التشغيلي</Th><Th>العمق (ثابت)</Th><Th>الحالة</Th></tr></thead><tbody>{st.boreholes.map(b => <tr key={b.id}><Td className="font-bold text-brand-700">{b.code}</Td><Td className="ltr num text-[11.5px]">{b.approved.n.toFixed(5)}, {b.approved.e.toFixed(5)}</Td><Td className="ltr num text-[11.5px]">{(b.operational ?? b.approved).n.toFixed(5)}, {(b.operational ?? b.approved).e.toFixed(5)}</Td><Td className="num">{b.approvedDepth} م</Td><Td>{b.addedByLab ? <Badge tone="info" size="xs">أُضيفت من المختبر</Badge> : b.moved ? <Badge tone="warn" size="xs">نُقلت {b.moved} م</Badge> : <Badge tone="ok" size="xs">مطابق</Badge>}</Td></tr>)}</tbody></Table>
        </Section>
      </div>
      <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
        <Kpi label="نسبة الالتزام بخطة الاستكشاف" value={`${compliance}%`} tone={compliance >= 90 ? 'ok' : 'warn'} hint={(st.boreholes.filter(b => b.moved).map(b => `${b.code} منقولة ${b.moved} م`).join(' · ') || 'مطابقة كاملة') + ' — القاعدة: −2% لكل متر نقل، −4% لكل جسة مضافة (سياسة منصة B.R.179)'} />
        <Section title="خطة الاستشاري الأصلية" desc="مرجع ثابت" bodyClass="p-2"><PlotMap polygon={st.polygon} pins={st.boreholes.filter(b => !b.addedByLab).map(b => ({ code: b.code, ...b.approved }))} height={140} /></Section>
        {isL && <Section title="اعتماد خطة التنفيذ" className="border-brand-300 ring-2 ring-brand-100" bodyClass="p-3">{st.boreholes.some(b => b.moved || b.addedByLab) && <div className="grid gap-2"><Field label="المبرر الفني" required><Textarea value={reason} onChange={ev => setReason(ev.target.value)} placeholder="مثال: نقل BH-02 بمقدار 4 م لوجود خط مرافق" className="min-h-14" /></Field><Checkbox checked={ack} onChange={setAck} label="أقرّ بأن التعديلات تمت بعد مناقشتها مع المكتب الاستشاري المشرف، وأتحمّل المسؤولية الفنية عنها." /></div>}<Button className="mt-3 w-full" icon={CheckCircle2} disabled={st.boreholes.some(b => b.moved || b.addedByLab) && (reason.trim().length < 10 || !ack)} onClick={() => { patch(st.id, s => { s.fieldPlanReviewed = true; s.compliance = compliance }); useStore.setState(s => ({ requests: s.requests.map(x => x.id === r.id ? { ...x, status: 'STS14', tests: x.tests.map(t => ({ ...t, status: 'STS18', startedAt: new Date().toISOString() })), history: [...x.history, { id: uid('h'), at: new Date().toISOString(), actor: user.name, actorRole: 'lab', action: 'مراجعة خطة التنفيذ الميداني', detail: reason || 'مطابقة للخطة المعتمدة' }] } : x) })) }}>حفظ الخطة وبدء الأعمال الميدانية</Button></Section>}
      </div>
      <Modal open={addBH} onClose={() => setAddBH(false)} title="إضافة جسة لخطة التنفيذ" width="sm" footer={<><Button variant="secondary" onClick={() => setAddBH(false)}>إلغاء</Button><Button disabled={reason.trim().length < 10} onClick={() => { patch(st.id, s => { const c = s.polygon.reduce((a, p) => ({ n: a.n + p.n / s.polygon.length, e: a.e + p.e / s.polygon.length }), { n: 0, e: 0 }); s.boreholes.push({ id: uid('bh'), code: `BH-${String(s.boreholes.length + 1).padStart(2, '0')}`, approved: { n: +c.n.toFixed(5), e: +c.e.toFixed(5) }, operational: { n: +c.n.toFixed(5), e: +c.e.toFixed(5) }, approvedDepth: s.boreholes[0]?.approvedDepth ?? 10, status: 'ready', layers: [], samples: [], photos: [], addedByLab: { reason } }) }); setAddBH(false); setEditPlan(true) }}>إضافة</Button></>}><Callout tone="info" compact className="mb-2">العمق ثابت وفق العمق المعتمد. بعد الإضافة اسحبها إلى موقعها.</Callout><Field label="مسبب الإضافة" required><Textarea value={reason} onChange={ev => setReason(ev.target.value)} /></Field></Modal>
    </div>
  )
  return (
    <div className="grid grid-cols-12 gap-3">
      <Section title="خريطة الجسات" icon={MapPin} className="col-span-12 xl:col-span-5" bodyClass="p-2" actions={<div className="flex gap-2 text-[11px]"><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-ink-500" />جاهزة</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-brand-600" />قيد التنفيذ</span><span className="flex items-center gap-1"><i className="size-2 rounded-full bg-ok-500" />مكتملة</span></div>}>
        <PlotMap polygon={st.polygon} height={300} pins={st.boreholes.map(b => ({ code: b.code, ...(b.actual ?? b.operational ?? b.approved), status: b.status }))} onSelect={code => nav(`/requests/${r.id}/study/borehole/${st.boreholes.find(b => b.code === code)!.id}`)} />
        <p className="meta mt-1.5">اضغط على جسة للانتقال إلى تنفيذها أو سجلها. التحقق الجغرافي ضمن {useStore.getState().rules.geofenceMeters} م من الموقع التشغيلي (B.R.183).</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">{[['العمق المعتمد', `${st.boreholes[0]?.approvedDepth ?? 10} م`], ['التباعد', `${st.plan.engineSuggestion?.spacing ?? '—'} م`], ['منسوب المياه', `${st.boreholes.find(b => b.head?.water24h)?.head?.water24h ?? '—'} م`]].map(([l, v]) => <div key={l} className="rounded-sm bg-ink-50 py-1.5"><div className="num text-[14px] font-bold text-ink-900">{v}</div><div className="text-[10.5px] text-ink-500">{l}</div></div>)}</div>
        <div className="mt-2 rounded-sm border border-ink-200 p-2.5"><div className="data-label mb-1">أساس الخطة المعتمدة — {st.plan.engineSuggestion?.ref}</div><ul className="grid gap-1 text-[11.5px] text-ink-600">{(st.plan.engineSuggestion?.basis ?? []).slice(0, 4).map(b => <li key={b} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{b}</li>)}</ul></div>
        <div className="mt-2"><div className="data-label mb-1">الموقع الفعلي — خريطة الأساس مع الجسات والنطاق الجغرافي ({useStore.getState().rules.geofenceMeters} م)</div><GeoMap polygon={st.polygon.map(c => [c.n, c.e] as [number, number])} pins={st.boreholes.map(b => { const c = b.actual ?? b.operational ?? b.approved; return { lat: c.n, lng: c.e, label: b.code, tone: b.status === 'done' ? 'ok' as const : b.status === 'in-progress' ? 'brand' as const : 'neutral' as const, sub: `${BOREHOLE_STATUS[b.status].ar} · ${b.approvedDepth} م` } })} geofenceM={useStore.getState().rules.geofenceMeters} height={220} /></div>
        <div className="mt-2"><div className="data-label mb-1">الصور الميدانية ({photosFor({ requestId: r.id }).filter(p => p.boreholeCode).length})</div><PhotoGrid photos={photosFor({ requestId: r.id }).filter(p => p.boreholeCode)} cols={4} size="sm" /></div>
      </Section>
      <div className="col-span-12 grid content-start gap-3 xl:col-span-7">
        <Section title="الجسات" desc={`${done} من ${st.boreholes.length} مكتملة · الالتزام ${st.compliance ?? compliance}%`} bodyClass="p-0"><Table className="border-0"><thead><tr><Th>الجسة</Th><Th>التشغيلي</Th><Th>المعتمد</Th><Th>المنفَّذ</Th><Th>الطبقات</Th><Th>العينات</Th><Th>الحالة</Th><Th></Th></tr></thead><tbody>{st.boreholes.map(b => <tr key={b.id} className="hover:bg-ink-50"><Td className="font-bold text-brand-700">{b.code}{b.moved ? <Badge tone="warn" size="xs" className="ms-1">+{b.moved} م</Badge> : null}</Td><Td className="ltr num text-[11.5px]">{(b.operational ?? b.approved).n.toFixed(4)}, {(b.operational ?? b.approved).e.toFixed(4)}</Td><Td className="num">{b.approvedDepth} م</Td><Td className="num">{b.executedDepth != null ? `${b.executedDepth} م` : '—'}</Td><Td className="num">{b.layers.length || '—'}</Td><Td className="num">{b.samples.length || '—'}</Td><Td><Badge tone={BOREHOLE_STATUS[b.status].tone} dot size="xs">{BOREHOLE_STATUS[b.status].ar}</Badge></Td><Td>{isL ? <ButtonLink size="xs" variant={b.status === 'done' ? 'secondary' : 'primary'} to={`/requests/${r.id}/study/borehole/${b.id}`}>{b.status === 'done' ? 'التفاصيل' : b.status === 'in-progress' ? 'متابعة' : 'بدء'}</ButtonLink> : b.status === 'done' && <ButtonLink size="xs" variant="secondary" to={`/requests/${r.id}/study/borehole/${b.id}/log`}>السجل</ButtonLink>}</Td></tr>)}</tbody></Table></Section>
        <div className="flex flex-wrap items-center justify-between gap-2">{isL && !st.fieldApproved ? <><span className="meta">لا يمكن الانتقال للمعملية إلا بعد اكتمال جميع الجسات (B.R.192).</span><Button icon={CheckCircle2} disabled={!allDone} onClick={() => { patch(st.id, s => { s.fieldApproved = true; s.phase = 4 }); useStore.getState().toast({ title: 'اكتملت الأعمال الحقلية', body: 'انتقلت الدراسة إلى مرحلة البيانات المعملية.', tone: 'ok' }); nav(`/requests/${r.id}/study/4`) }}>إكمال الأعمال الحقلية والانتقال للمعملية</Button></> : st.fieldApproved && <Callout tone="ok" compact className="w-full">اعتُمدت الأعمال الحقلية. <Link to={`/requests/${r.id}/study/4`} className="font-semibold underline">البيانات المعملية <ArrowLeft className="inline size-3" /></Link></Callout>}</div>
        <Section title="سجل الأعمال الميدانية" bodyClass="p-3"><Timeline entries={r.history.filter(h => h.action.includes('جسة') || h.action.includes('الميداني'))} limit={5} /></Section>
      </div>
    </div>
  )
}
export { Code }
