import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileText, CheckCircle2, XCircle, ChevronDown, Download, Eye, Sparkles } from 'lucide-react'
import EngineAdvisor from '@/features/engine/EngineAdvisor'
import { useStore } from '@/lib/store'
import { Section, Button, Callout, Badge, Field, Textarea, Modal, Table, Th, Td, Code, Kpi, KV, cx } from '@/ds/primitives'
import { fmtDate, uid } from '@/lib/format'

export default function ReportPreview() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))!
  const st = useStore(s => s.studies.find(x => x.requestId === id))!
  const orgs = useStore(s => s.orgs)
  const org = (oid: string) => orgs.find(o => o.id === oid)?.name ?? oid
  const patch = useStore(s => s.patchStudy)
  const [open, setOpen] = useState<string | null>('site')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState<'ok' | 'no' | null>(null)
  const [advisor, setAdvisor] = useState(false)
  const isK = user.role === 'consultant'
  const canApprove = useStore.getState().can('study.report.approve') // matrix #34/#35 — المفوّض الرئيسي للاستشاري
  const users = useStore(s => s.users)
  const lab = orgs.find(o => o.id === r.labId)!
  const labPrincipal = users.find(u => u.orgId === r.labId && u.position === 'principal')?.name ?? '—'
  const p = st.prelim, a = st.analysis
  const chem = (k: string) => st.chemical?.results.find(t => t.id === k)?.value ?? '—'
  const allSoil = st.boreholes.flatMap(b => b.samples.filter(s => s.kind === 'soil'))
  const uscsSet = [...new Set(allSoil.map(s => s.labUSCS ?? s.fieldUSCS))].join(' / ')
  const sections: { key: string; title: string; ref: string; rows: [string, any][] }[] = [
    { key: 'deed', title: 'القرار المساحي', ref: '§2.6 (1)', rows: [['رقم القرار / المخطط', `${p.parcel} / ${p.plan}`]] },
    { key: 'owner', title: 'بيانات المالك', ref: '—', rows: [['الاسم', p.owner], ['رقم الهوية', p.ownerId]] },
    { key: 'lab', title: 'بيانات المختبر', ref: '§2.6 (9)', rows: [['المختبر', lab.name], ['العنوان', lab.address], ['الرخصة البلدية', lab.license], ['اعتماد SAAC', lab.saac?.number ?? '—'], ['معد التقرير', st.boreholes[0]?.head?.technician ?? '—'], ['معتمد التقرير', labPrincipal], ['استلام العينات', fmtDate(st.boreholes[0]?.head?.date)], ['الظروف البيئية', st.boreholes[0]?.head?.weather ?? '—'], ['المرجع بالمختبر', `QLB-${r.id.slice(-3)}`], ['تاريخ الإصدار', fmtDate(new Date().toISOString())]] },
    { key: 'site', title: 'بيانات الموقع', ref: '§2.6 (1)', rows: [['القطعة', p.parcel], ['المخطط', p.plan], ['الحي', p.district], ['المدينة', p.city], ['المنطقة', p.region], ['رقم الصك', p.deedNo], ['تاريخ الصك', p.deedDate], ['مساحة القطعة', `${p.area} م²`], ['المساحة المبنية', `${p.builtArea} م²`], ['عدد الجسات المعتمدة', st.boreholes.length], ['حدود القطعة', `${st.polygon.length} أضلاع — مضلع مغلق وفق القرار المساحي`]] },
    { key: 'project', title: 'وصف المشروع', ref: '§2.6 (2)', rows: [['نوع المشروع', `${{ residential: 'سكني', commercial: 'تجاري', industrial: 'صناعي' }[p.buildingType ?? 'residential']} — ${p.floors} أدوار`], ['الهيكل', p.structure === 'rc' ? 'خرساني مسلح' : 'معدني'], ['عمق التأسيس المتوقع', `${p.foundationDepth} م`]] },
    { key: 'seismic', title: 'المعلومات الجيولوجية والزلزالية', ref: 'SBC 301 §11.8', rows: Object.entries(a.analytical).filter(([k]) => k !== 'المرجع') },
    { key: 'field', title: 'الاستكشاف الحقلي', ref: '§2.6 (4)(5)', rows: [['تاريخ الاستكشاف', fmtDate(st.boreholes[0]?.head?.date)], ['عدد الحفر', st.boreholes.length], ['الطقس', st.boreholes[0]?.head?.weather ?? '—'], ['الالتزام بخطة الاستكشاف', `${st.compliance ?? 100}%`]] },
    { key: 'special', title: 'اختبارات التربة الخاصة', ref: '§2.5', rows: [['الانتفاشية', 'غير حرجة'], ['الانهيارية', 'غير حرجة'], ['السبخية', st.boreholes.some(b => b.layers.some(l => (l.n ?? 99) <= 8)) ? 'مؤشر — تحليل كيميائي كامل' : 'لا يوجد']] },
    { key: 'labdata', title: 'طبيعة الطبقات ونتائج الاختبارات المعملية', ref: '§2.6 (9)', rows: [['طبيعة الطبقات', uscsSet], ['المطابقة', st.chemical?.results.every(t => t.value) ? 'مطابق لمتطلبات SBC 303' : 'غير مكتمل'], ['pH', chem('ch-ph')], ['SO₄ %', chem('ch-so4')], ['Cl⁻ %', chem('ch-cl')], ['كربونات %', chem('ch-carb')], ['عضوية %', chem('ch-org')], ['MC %', allSoil.find(s => s.tests.find(t => t.name.includes('الرطوبة'))?.value)?.tests.find(t => t.name.includes('الرطوبة'))?.value ?? '—'], ['LL/PL/PI', allSoil.find(s => s.tests.find(t => t.name.includes('أتربرج'))?.value)?.tests.find(t => t.name.includes('أتربرج'))?.value ?? '—'], ['qu (صخر)', st.boreholes.flatMap(b => b.samples).find(s => s.kind === 'rock')?.tests[0]?.value ?? '—']] },
    { key: 'recs', title: 'الاستنتاجات والتوصيات', ref: '§2.6 (10)(11)(12)(17)', rows: [...Object.entries(a.recommendations).filter(([k]) => k !== 'المرجع'), ['الهبوط المتوقع', `${a.computed.settlement?.value ?? '—'} mm`], ['معامل رد فعل التربة', `${a.computed.ks?.value ?? '—'} kN/m³`], ['صلاحية مواد الحفر للردم', a.manual['الردم'] ?? '—'], ['الميل الرأسي', a.manual['الميل'] ?? '—']] },
    { key: 'lateral', title: 'التكهفات ورد الفعل الجانبي', ref: 'الفصل 8', rows: [['التكهفات', a.manual['تكهفات'] ?? 'غير موجودة'], ['Ka / Kp / K0', a.computed.lateral?.value ?? '—'], ['زاوية الاحتكاك φ', a.computed.bearing?.inputs['زاوية الاحتكاك φ'] ?? '—']] },
    { key: 'attach', title: 'الرسومات والصور والمرفقات', ref: '§2.6 (4)(5)', rows: [['رسومات بيانية', a.attachments.join('، ') || 'مخططات SPT وأتربرج'], ['صور الموقع', `${st.boreholes.reduce((x, b) => x + b.photos.length, 0)} صورة`], ['مخطط مواقع الجسات', 'مرفق'], ['ملخص التوصيات', `الموقع مناسب للتأسيس على ${a.recommendations['نوع الأساس الموصى به'] ?? '—'} بعمق ${a.recommendations['عمق التأسيس الموصى به'] ?? '—'}`]] },
  ]
  const fieldCount = sections.reduce((x, s) => x + s.rows.length, 0) + st.boreholes.reduce((x, b) => x + 8 + b.layers.length, 0)
  // B.R.221/223 — the report is generated only from completed, approved phases
  const checklist: [string, boolean][] = [['جميع الجسات مكتملة وبلغت العمق المعتمد أو وُثِّق سبب عدم بلوغه', st.boreholes.length > 0 && st.boreholes.every(b => b.status === 'done')], ['اعتماد الأعمال الحقلية', !!st.fieldApproved], ['العينات المعملية مكتملة (أو إكمال جزئي بسبب موثّق)', st.boreholes.flatMap(b => b.samples).every(s => s.labStatus === 'done') || !!st.chemical?.partialReason], ['الاختبارات الكيميائية معتمدة', !!st.chemical?.done], ['الحقول الحسابية محسوبة', Object.values(a.computed).every(f => f.value)], ['الحقول التحليلية والتوصيات مولّدة', !!Object.keys(a.recommendations).length && !!Object.keys(a.analytical).length], ['اكتمال التحليل الهندسي', !!a.done], ['مطابقة القالب لـ SBC 303 §2.6', true]]
  const ready = checklist.every(([, ok]) => ok)
  const approve = () => { patch(st.id, s => { s.report = { previewed: true, approved: true, approvedAt: new Date().toISOString(), generatedFile: `تقرير-الدراسة-الجيوتقنية-${r.id}.pdf` } }); useStore.setState(s => ({ requests: s.requests.map(x => x.id === r.id ? { ...x, status: 'STS15', tests: x.tests.map(t => ({ ...t, status: 'STS20', decidedAt: new Date().toISOString() })), history: [...x.history, { id: uid('h'), at: new Date().toISOString(), actor: user.name, actorRole: 'consultant', action: 'اعتماد تقرير الدراسة الجيوتقنية وتوليد القالب الرسمي' }, { id: uid('h'), at: new Date().toISOString(), actor: 'المنصة', actorRole: 'admin', action: 'اكتمال الطلب' }] } : x) })); useStore.getState().toast({ title: 'اعتُمد التقرير', body: 'وُلّد التقرير الرسمي وأُغلق الطلب.', tone: 'ok' }); setConfirm(null); nav(`/requests/${r.id}`) }
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="الأقسام" value={sections.length + 1} hint="مطابقة لـ SBC 303 §2.6 (17 بنداً)" /><Kpi label="الحقول" value={fieldCount} /><Kpi label="الجسات الموثّقة" value={st.boreholes.length} /><Kpi label="الحالة" value={<span className="text-[14px]">{st.report?.approved ? 'معتمد' : 'معاينة'}</span>} tone={st.report?.approved ? 'ok' : 'warn'} /></div>
        {st.report?.approved ? <Callout tone="ok" compact><CheckCircle2 className="me-1 inline size-3.5" />اعتُمد التقرير بتاريخ {fmtDate(st.report.approvedAt)} ووُلّد بالقالب الرسمي v2.1: <b>{st.report.generatedFile}</b> <Button size="xs" variant="secondary" icon={Download} className="ms-2">تنزيل</Button></Callout> : <Callout tone="info" compact><Eye className="me-1 inline size-3.5" />معاينة كاملة غير رسمية — مصدر البيانات الوحيد هو مراحل الدراسة ولا يُعدَّل شيء داخل التقرير (B.R.221). القالب الرسمي يُولَّد بعد اعتماد المكتب الاستشاري.</Callout>}
        {st.chemical?.partialReason && <Callout tone="warn" compact><b>إكمال جزئي للبيانات المعملية:</b> {st.chemical.partialReason}</Callout>}
        <div className="card relative overflow-hidden">
          {!st.report?.approved && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center"><span className="rotate-[-18deg] select-none rounded-md border-4 border-danger-500/15 px-6 py-2 text-3xl font-bold text-danger-500/10">معاينة — لم يُعتمد بعد</span></div>}
          <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-2.5"><div className="flex items-center gap-2 text-[13px] font-bold"><FileText className="size-4 text-brand-600" />تقرير الدراسة الجيوتقنية</div><div className="meta">{lab.name} — {st.ref} — القالب v2.1</div></div>
          {sections.map(s => <div key={s.key} className="border-b border-ink-100 last:border-0"><button type="button" onClick={() => setOpen(open === s.key ? null : s.key)} className="flex w-full items-center justify-between px-4 py-2 text-start hover:bg-ink-50"><span className="text-[13px] font-semibold">{s.title}</span><span className="flex items-center gap-2 meta"><Code>{s.ref}</Code>{s.rows.length} حقل<ChevronDown className={cx('size-4 transition-transform', open === s.key && 'rotate-180')} /></span></button>{open === s.key && <dl className="grid gap-x-5 gap-y-2 px-4 pb-3 sm:grid-cols-2 lg:grid-cols-3">{s.rows.map(([k, v]) => <div key={k}><dt className="data-label">{k}</dt><dd className="text-[12.5px] font-semibold">{v ?? '—'}</dd></div>)}</dl>}</div>)}
          <div className="border-b border-ink-100"><button type="button" onClick={() => setOpen(open === 'bh' ? null : 'bh')} className="flex w-full items-center justify-between px-4 py-2 text-start hover:bg-ink-50"><span className="text-[13px] font-semibold">بيانات الحفر ونتائج الاختبارات الحقلية وسجل كل جسة</span><span className="flex items-center gap-2 meta"><Code>§2.6 (6)(8)</Code>{st.boreholes.length} جسات<ChevronDown className={cx('size-4 transition-transform', open === 'bh' && 'rotate-180')} /></span></button>{open === 'bh' && <div className="grid gap-2 px-4 pb-3">{st.boreholes.map(b => <div key={b.id} className="rounded-sm border border-ink-100 p-2"><div className="mb-1 flex flex-wrap items-center gap-2 text-[12px]"><span className="font-bold text-brand-700">{b.code}</span><span className="meta">{b.head?.method} · {b.executedDepth} م · مطرقة 63.5 كجم · مياه {b.head?.water24h ?? '—'} م · تغليف {b.head?.casing} م · كور NX/54</span><span className="ltr num meta">{b.actual?.n.toFixed(4)}, {b.actual?.e.toFixed(4)}</span></div><Table><thead><tr><Th>الطبقة</Th><Th>USCS</Th><Th>العمق</Th><Th>الوصف</Th><Th>N / REC</Th><Th>العينة</Th></tr></thead><tbody>{b.layers.map(l => <tr key={l.id}><Td>{l.id}</Td><Td><Code>{b.samples.find(s => s.layerId === l.id)?.labUSCS ?? l.uscs}</Code></Td><Td className="num text-[11.5px]">{l.from} → -{l.to} م</Td><Td className="text-[11.5px]">{l.description}</Td><Td className="num text-[11.5px]">{l.n != null ? `N=${l.n}` : `REC ${l.rec}%`}</Td><Td className="text-[11.5px]">{b.samples.filter(s => s.layerId === l.id).map(s => s.id).join('، ')}</Td></tr>)}</tbody></Table></div>)}</div>}</div>
          <div className="px-4 py-2 text-center meta">نهاية المعاينة — الشكل الرسمي المعتمد يُولَّد بعد اعتماد المكتب الاستشاري</div>
        </div>
      </div>
      <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
        {isK && !st.report?.approved ? <Section title="قرار المكتب الاستشاري" className="border-brand-300 ring-2 ring-brand-100" bodyClass="p-3">{!canApprove && <Callout tone="warn" compact className="mb-2">اعتماد التقرير صلاحية المفوّض الرئيسي (المصفوفة بندا 34–35) — يمكنك المراجعة وإضافة الملاحظات.</Callout>}
          <div className="mb-3 rounded-sm border border-info-100 bg-info-25 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-ink-900">استشارة قبل الاعتماد</div>
                <p className="meta">يقرأ المحرك التقرير مقابل SBC 303 ويُظهر التعارضات والبيانات الناقصة</p>
              </div>
              <Button size="sm" variant="secondary" icon={Sparkles} className="shrink-0" onClick={() => setAdvisor(true)}>استشارة</Button>
            </div>
          </div>
          <div className="grid gap-3"><Field label="ملاحظات المراجعة"><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-16" /></Field><Field label="سبب الرفض" hint="إلزامي عند الرفض — تعود الدراسة لمرحلة التحليل"><Textarea value={reason} onChange={e => setReason(e.target.value)} className="min-h-16" /></Field>{!ready && <Callout tone="danger" compact>لا يمكن اعتماد التقرير قبل اكتمال قائمة التحقق — {checklist.filter(([, ok]) => !ok).length} بنود ناقصة (B.R.221/223).</Callout>}<Button variant="success" icon={CheckCircle2} disabled={!canApprove || !ready} onClick={() => setConfirm('ok')}>اعتماد التقرير — توليد القالب الرسمي وإكمال الطلب</Button><Button variant="danger" icon={XCircle} disabled={!canApprove || !a.done || reason.trim().length < 5} onClick={() => setConfirm('no')}>رفض وإعادة للتحليل</Button></div></Section>
          : !st.report?.approved && <Callout tone="warn" compact>بانتظار مراجعة واعتماد المكتب الاستشاري لمعاينة التقرير. <Badge tone="warn" size="xs">بانتظار قرار المكتب الاستشاري</Badge></Callout>}
        <Section title="قائمة التحقق قبل الاعتماد" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]">{checklist.map(([l, ok]) => <li key={l} className="flex items-center gap-2">{ok ? <CheckCircle2 className="size-4 text-ok-500" /> : <XCircle className="size-4 text-warn-500" />}{l}</li>)}</ul></Section>
        <Section title="الاعتماد والتوزيع والاحتفاظ" bodyClass="p-3">
          <KV cols={2} dense items={[{ k: 'الحالة', v: st.report?.approved ? <Badge tone="ok" size="xs">معتمد</Badge> : <Badge tone="warn" size="xs">قيد المراجعة</Badge> }, { k: 'تاريخ الاعتماد', v: st.report?.approvedAt ? fmtDate(st.report.approvedAt) : '—' }, { k: 'الجهة المعتمِدة', v: org(r.consultantId) }, { k: 'المُعِدّ', v: org(r.labId) }, { k: 'قالب التقرير', v: 'v2.1 — 17 بنداً' }, { k: 'بصمة الملف', v: <span className="ltr num text-[11px]">sha256:4c1e9a77…</span> }]} />
          <div className="data-label mt-3 mb-1">التوزيع التلقائي بعد الاعتماد</div>
          <ul className="grid gap-1 text-[11.5px] text-ink-700">{[[org(r.contractorId), 'نسخة PDF + إشعار'], [org(r.consultantId), 'نسخة معتمدة موقّعة'], ['أرشيف الإدارة العامة لكود البناء', 'احتفاظ 20 سنة — تصنيف عام'], ['مركز بيانات المنصة', 'نسخة غير قابلة للتعديل (WORM)']].map(([who, how]) => <li key={who} className="flex items-center justify-between gap-2 rounded-xs bg-ink-50 px-2 py-1"><span className="truncate font-medium">{who}</span><span className="meta shrink-0">{how}</span></li>)}</ul>
        </Section>
      </div>
      <EngineAdvisor open={advisor} onClose={() => setAdvisor(false)}
        title={`تقرير الدراسة الجيوتقنية — ${r.project}`}
        subtitle={`${st.ref} · ${r.id} · ${lab.name} · ${st.boreholes.length} جسات`}
        requestId={r.id} defaultProfile="الدراسة الجيوتقنية — منصة معيار" />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'ok' ? 'اعتماد التقرير' : 'رفض التقرير'} width="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>تراجع</Button><Button variant={confirm === 'ok' ? 'success' : 'danger'} onClick={confirm === 'ok' ? approve : () => { patch(st.id, s => { s.report = { previewed: true, approved: false, rejectReason: reason }; s.phase = 5; s.analysis.done = false }); useStore.setState(s => ({ requests: s.requests.map(x => x.id === r.id ? { ...x, history: [...x.history, { id: uid('h'), at: new Date().toISOString(), actor: user.name, actorRole: 'consultant', action: 'رفض معاينة التقرير', detail: reason }] } : x) })); setConfirm(null); nav(`/requests/${r.id}/study/5`) }}>{confirm === 'ok' ? 'نعم، اعتمد' : 'نعم، ارفض'}</Button></>}><p className="text-[13px]">{confirm === 'ok' ? 'سيُولَّد التقرير الرسمي بالقالب المعتمد (v2.1) ويُعتمد مخرج الدراسة ويُغلق الطلب ويُشعر جميع الأطراف.' : 'ستعود الدراسة إلى مرحلة التحليل الهندسي مع السبب المسجَّل.'}</p></Modal>
    </div>
  )
}
