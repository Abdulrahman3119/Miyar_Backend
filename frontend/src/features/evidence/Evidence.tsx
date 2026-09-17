import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, ShieldCheck, Camera, Thermometer, Wrench, CalendarClock, AlertTriangle, Printer, MapPin } from 'lucide-react'
import { useStore, useSel, visibleRequests } from '@/lib/store'
import { PageHeader, Timeline } from '@/ds/composite'
import { Kpi, Section, Badge, Button, Drawer, KV, Progress, Modal, Tabs, Field, Input, Select, Textarea, cx } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { GeoMap, PhotoGrid, MethodCard } from '@/ds/evidence'
import { labSampleStatus } from '@/lib/statuses'
import { SAMPLES, PHOTOS, EQUIPMENT, METHODS, SAMPLE_STEPS, methodFor, type ArchivedSample, type Equipment, type CustodyEvent } from '@/lib/evidence'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { printHtml } from '@/lib/files'

const stepTone = (st: string) => labSampleStatus(st).tone

/* QR-like label — deterministic pattern from the id (visual stand-in for the printed label) */
function QrLabel({ id, size = 84 }: { id: string; size?: number }) {
  const n = 21; let seed = Array.from(id).reduce((a, c) => a * 33 + c.charCodeAt(0), 5) >>> 0
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const cells: boolean[] = Array.from({ length: n * n }, () => rnd() > 0.5)
  const eye = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
  const s = size / n
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 rounded-xs bg-white" aria-label={`QR ${id}`}>{cells.map((v, i) => { const x = i % n, y = Math.floor(i / n); if (eye(x, y)) { const ex = x < 7 ? x : x - (n - 7), ey = y < 7 ? y : y - (n - 7); const on = ex === 0 || ex === 6 || ey === 0 || ey === 6 || (ex >= 2 && ex <= 4 && ey >= 2 && ey <= 4); return on ? <rect key={i} x={x * s} y={y * s} width={s} height={s} fill="#111927" /> : null } return v ? <rect key={i} x={x * s} y={y * s} width={s} height={s} fill="#111927" /> : null })}</svg>
}

/* ───────── Samples archive & chain of custody (ISO/IEC 17025 §7.4) ───────── */
export function SamplesPage() {
  const user = useStore(s => s.user)!
  const reqs = useSel(visibleRequests)
  const visible = new Set(reqs.map(r => r.id))
  const allSamples = useStore(s => s.samples); const registerArchivedSample = useStore(s => s.registerArchivedSample); const addCustodyEvent = useStore(s => s.addCustodyEvent); const disposeSample = useStore(s => s.disposeSample)
  const requests = useSel(visibleRequests)
  const samples = allSamples.filter(s => visible.has(s.requestId) || user.role === 'admin' || user.role === 'supervisor')
  const [reg, setReg] = useState<null | { requestId: string; testId: string; kind: ArchivedSample['kind']; designation: string; mass: string; depth: string; seal: string; storage: string }>(null)
  const [cust, setCust] = useState<null | { step: CustodyEvent['step']; where: string; note: string; tempC: string }>(null)
  const [dispose, setDispose] = useState('')
  const [open, setOpen] = useState<ArchivedSample | null>(null)
  const daysLeft = (s: ArchivedSample) => Math.round((new Date(s.retentionUntil).getTime() - Date.now()) / 864e5)
  const cols: Column<ArchivedSample>[] = [
    { key: 'photo', header: '', width: '56px', hideable: false, cell: s => { const ph = PHOTOS.find(p => p.id === s.photos[0]); return ph ? <img src={ph.file} alt="" width={40} height={40} style={{ width: 40, height: 40, minWidth: 40 }} className="block rounded-xs object-cover" /> : <span className="grid size-10 place-items-center rounded-xs bg-ink-100 text-ink-400"><Camera className="size-4" /></span> } },
    { key: 'id', header: 'العينة', width: '150px', sortValue: s => s.id, exportValue: s => s.id, cell: s => <div className="whitespace-nowrap"><button type="button" onClick={() => setOpen(s)} className="font-semibold text-brand-700 hover:underline">{s.id}</button><div className="meta">{s.kind}</div></div> },
    { key: 'desig', header: 'التسمية / المصدر', sortValue: s => s.designation, cell: s => <div className="min-w-56"><div className="text-[12.5px]">{s.designation}</div><div className="meta"><Link to={`/requests/${s.requestId}`} className="text-brand-700 hover:underline">{s.requestId}</Link>{s.boreholeCode && ` · ${s.boreholeCode}`}</div></div> },
    { key: 'dims', header: 'الأبعاد / الكتلة', cell: s => <div className="flex flex-wrap gap-1">{Object.entries(s.dims).slice(0, 3).map(([k, v]) => <span key={k} className="whitespace-nowrap rounded-xs bg-ink-50 px-1.5 py-0.5 text-[11px]"><span className="text-ink-500">{k}</span> <b className="num">{v}</b></span>)}</div> },
    { key: 'collected', header: 'الجمع', width: '130px', sortValue: s => s.collectedAt, cell: s => <div className="whitespace-nowrap"><div className="num text-[12px]">{fmtDate(s.collectedAt)}</div><div className="meta">{s.collectedBy}</div></div> },
    { key: 'status', header: 'الحالة', width: '120px', sortValue: s => SAMPLE_STEPS.indexOf(s.status), cell: s => <Badge tone={stepTone(s.status)} dot size="xs">{s.status}</Badge> },
    { key: 'storage', header: 'موقع التخزين', width: '170px', cell: s => <span className="text-[12px]">{s.storage}</span> },
    { key: 'ret', header: 'الاحتفاظ', width: '120px', sortValue: s => s.retentionUntil, cell: s => { const d = daysLeft(s); return s.status === 'متلفة' ? <span className="meta">—</span> : <div className="whitespace-nowrap"><div className="num text-[12px]">{fmtDate(s.retentionUntil)}</div><div className={cx('meta', d < 30 && 'text-warn-700')}>{d < 0 ? 'مستحق الإتلاف' : `${d} يوماً`}</div></div> } },
    { key: 'cond', header: 'الحالة الفيزيائية', width: '110px', cell: s => <Badge tone={s.condition === 'سليمة' ? 'ok' : 'warn'} size="xs">{s.condition}</Badge> },
    { key: 'act', header: '', width: '90px', hideable: false, cell: s => <Button size="xs" variant="ghost" onClick={() => setOpen(s)}>السجل</Button> },
  ]
  const byStatus = (st: ArchivedSample['status']) => samples.filter(s => s.status === st).length
  const dueDispose = samples.filter(s => s.status !== 'متلفة' && daysLeft(s) < 30)
  return (
    <>
      <PageHeader title="العينات وسلسلة الحيازة" sub="كل عينة: وسم فريد، صور بالوقت والإحداثيات، أبعاد وكتلة، سلسلة حيازة موثقة من الموقع إلى الأرشيف، ومدة احتفاظ — ISO/IEC 17025 §7.4" actions={<>{(user.role === 'lab' || user.role === 'admin') && <Button icon={Boxes} onClick={() => setReg({ requestId: requests.find(r => (user.role === 'admin' || r.labId === user.orgId) && (r.status === 'STS12' || r.status === 'STS14'))?.id ?? '', testId: '', kind: 'تربة مضطربة', designation: '', mass: '', depth: '1.5', seal: `SEAL-${Date.now().toString().slice(-6)}`, storage: 'غرفة الاستلام' })}>تسجيل عينة</Button>}<Button variant="secondary" icon={Printer} onClick={() => printHtml('ملصقات العينات', samples.map(s => `<div style="display:inline-block;width:220px;margin:8px;padding:10px;border:1px dashed #999;text-align:center"><div class="brand" style="font-size:11px">معيار</div><div style="font-weight:800;margin:6px 0" class="num">${s.id}</div><div class="meta">${s.designation}</div><div class="meta">${s.kind} · ${s.sealNo}</div><div class="meta">${s.requestId}</div></div>`).join('') || '<p>لا عينات للطباعة</p>')}>طباعة ملصقات</Button></>} />
      <Modal open={!!reg} onClose={() => setReg(null)} title="تسجيل عينة جديدة" sub="يُطبع ملصق QR وتبدأ سلسلة الحيازة من لحظة الجمع" width="md" footer={<><Button variant="secondary" onClick={() => setReg(null)}>إلغاء</Button><Button disabled={!reg || !reg.requestId || reg.designation.trim().length < 3} onClick={() => { const r = requests.find(x => x.id === reg!.requestId)!; const id = `SMP-2026-0${160 + allSamples.length}`; registerArchivedSample({ id, requestId: r.id, testId: reg!.testId || undefined, labId: user.orgId, kind: reg!.kind, designation: reg!.designation, collectedAt: new Date().toISOString(), lat: 24.839, lng: 46.654, collectedBy: user.name, dims: { 'الكتلة': `${reg!.mass || '—'} g`, 'عمق الأخذ': `${reg!.depth} م` }, massG: +reg!.mass || undefined, condition: 'سليمة', storage: reg!.storage, retentionUntil: new Date(Date.now() + 90 * 864e5).toISOString(), sealNo: reg!.seal, photos: [] }); setReg(null) }}>تسجيل وطباعة الملصق</Button></>}>
        {reg && <div className="grid gap-3 sm:grid-cols-2"><Field label="الطلب" required><Select value={reg.requestId} onChange={e => setReg({ ...reg, requestId: e.target.value, testId: '' })}><option value="">اختر…</option>{requests.filter(r => r.labId === user.orgId && (r.status === 'STS12' || r.status === 'STS14')).map(r => <option key={r.id} value={r.id}>{r.id} — {r.project}</option>)}</Select></Field><Field label="الاختبار (اختياري)"><Select value={reg.testId} onChange={e => setReg({ ...reg, testId: e.target.value })}><option value="">— عينة عامة —</option>{(requests.find(r => r.id === reg.requestId)?.tests ?? []).map(t => <option key={t.id} value={t.id}>{useStore.getState().refTests.find(x => x.id === t.refTestId)?.nameAr}</option>)}</Select></Field><Field label="نوع العينة" required><Select value={reg.kind} onChange={e => setReg({ ...reg, kind: e.target.value as any })}>{['تربة مضطربة', 'تربة غير مضطربة (UD)', 'عينة SPT', 'كور صخري', 'كور خرساني', 'مكعب خرساني', 'إسفلت', 'ركام', 'حديد تسليح'].map(k => <option key={k}>{k}</option>)}</Select></Field><Field label="التسمية / المصدر" required><Input value={reg.designation} onChange={e => setReg({ ...reg, designation: e.target.value })} placeholder="مثال: D-3 · طبقة الأساس — محطة 2+450" /></Field><Field label="الكتلة (g)"><Input value={reg.mass} onChange={e => setReg({ ...reg, mass: e.target.value })} className="ltr" inputMode="decimal" /></Field><Field label="عمق الأخذ (م)"><Input value={reg.depth} onChange={e => setReg({ ...reg, depth: e.target.value })} className="ltr" inputMode="decimal" /></Field><Field label="رقم الختم"><Input value={reg.seal} onChange={e => setReg({ ...reg, seal: e.target.value })} className="ltr" /></Field><Field label="موقع التخزين الأولي"><Input value={reg.storage} onChange={e => setReg({ ...reg, storage: e.target.value })} /></Field><div className="sm:col-span-2 rounded-sm bg-ink-50 p-2 text-[11.5px] text-ink-600">الوقت والإحداثيات تُلتقط تلقائياً من الجهاز الميداني (GPS ±3 م) ولا يمكن تعديلها لاحقاً.</div></div>}
      </Modal>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="إجمالي العينات" value={samples.length} icon={Boxes} hint={`${PHOTOS.filter(p => p.sampleId).length} صورة مرتبطة`} />
        <Kpi label="قيد الاختبار / التجهيز" value={byStatus('قيد الاختبار') + byStatus('قيد التجهيز')} tone="accent" />
        <Kpi label="مختبرة" value={byStatus('مختبرة')} tone="ok" />
        <Kpi label="مؤرشفة" value={byStatus('مؤرشفة')} hint="أرشيف B-1 · رفوف A/G" />
        <Kpi label="تستحق الإتلاف خلال 30 يوماً" value={dueDispose.length} tone={dueDispose.length ? 'warn' : 'ok'} icon={CalendarClock} />
        <Kpi label="إشغال الأرشيف" value="62%" hint="248 من 400 موضع" icon={Boxes} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="مواقع جمع العينات" desc="آخر 60 يوماً" bodyClass="p-2"><GeoMap zoom={11} pins={samples.map(s => ({ lat: s.lat, lng: s.lng, label: s.id, tone: s.status === 'قيد الاختبار' ? 'warn' : 'brand', sub: s.designation }))} height={200} /></Section>
        <Section title="دورة حياة العينة" bodyClass="p-3"><ol className="grid gap-1.5">{SAMPLE_STEPS.map((st, i) => <li key={st} className="flex items-center gap-2 text-[12px]"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-700">{i + 1}</span><span className="flex-1">{st}</span><span className="num text-ink-500">{byStatus(st)}</span></li>)}</ol></Section>
        <Section title="سياسة الحيازة والاحتفاظ" bodyClass="p-3"><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['وسم فريد + ختم أمان عند الجمع، وتسجيل الإحداثيات والوقت من الجهاز', 'نقل مبرّد للعينات غير المضطربة مع تسجيل الحرارة عند كل تسليم', 'التحقق من الختم والكتلة عند الاستلام، ورفض أي عينة مخالفة مع إشعار المقاول', 'الاحتفاظ 90 يوماً للتربة، 6 أشهر للخرسانة بعد الاعتماد؛ الاختبارات التدميرية لا احتفاظ', 'الإتلاف بمحضر موقّع ويُسجَّل في سلسلة الحيازة'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></Section>
      </div>
      <div className="mt-3"><DataTable rows={samples} columns={cols} rowKey={s => s.id} onRowClick={s => setOpen(s)} searchable={s => `${s.id} ${s.designation} ${s.requestId} ${s.kind}`} exportName="samples" defaultSort={{ key: 'collected', dir: 'desc' }} filters={[{ key: 'st', label: 'الحالة', options: SAMPLE_STEPS.map(s => ({ value: s, label: s })), match: (s, v) => s.status === v }, { key: 'kind', label: 'النوع', options: [...new Set(samples.map(s => s.kind))].map(k => ({ value: k, label: k })), match: (s, v) => s.kind === v }]} /></div>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `العينة ${open.id}` : ''} sub={open?.designation} width="w-[960px]" footer={open && user.role === 'lab' && open.status !== 'متلفة' && <><Button variant="secondary" onClick={() => setCust({ step: open.status === 'في الموقع' ? 'نقل' : open.status === 'قيد النقل' ? 'استلام' : open.status === 'مستلمة' ? 'تجهيز' : open.status === 'قيد التجهيز' ? 'اختبار' : 'تخزين', where: '', note: '', tempC: '23' })}>إضافة حدث حيازة</Button><Button variant="danger" onClick={() => setDispose(' ')}>إتلاف العينة</Button></>}>
        {open && <SampleDetail s={allSamples.find(x => x.id === open.id) ?? open} />}
      </Drawer>
      <Modal open={!!cust} onClose={() => setCust(null)} title="حدث حيازة جديد" sub={open?.id} width="sm" footer={<><Button variant="secondary" onClick={() => setCust(null)}>إلغاء</Button><Button disabled={!cust || cust.where.trim().length < 2} onClick={() => { addCustodyEvent(open!.id, { step: cust!.step, by: user.name, where: cust!.where, note: cust!.note || undefined, tempC: +cust!.tempC || undefined }); setCust(null) }}>تسجيل</Button></>}>
        {cust && <div className="grid gap-3"><Field label="الخطوة" required><Select value={cust.step} onChange={e => setCust({ ...cust, step: e.target.value as any })}>{['نقل', 'استلام', 'تجهيز', 'اختبار', 'تخزين'].map(k => <option key={k}>{k}</option>)}</Select></Field><Field label="المكان / الوسيلة" required><Input value={cust.where} onChange={e => setCust({ ...cust, where: e.target.value })} placeholder="مثال: رف A-3 · صندوق 14" /></Field><Field label="الحرارة (°C)"><Input value={cust.tempC} onChange={e => setCust({ ...cust, tempC: e.target.value })} className="ltr" inputMode="decimal" /></Field><Field label="ملاحظة"><Input value={cust.note} onChange={e => setCust({ ...cust, note: e.target.value })} /></Field></div>}
      </Modal>
      <Modal open={!!dispose} onClose={() => setDispose('')} title="إتلاف العينة" sub="يُسجَّل محضر الإتلاف في سلسلة الحيازة ولا يمكن التراجع" width="sm" footer={<><Button variant="secondary" onClick={() => setDispose('')}>تراجع</Button><Button variant="danger" disabled={dispose.trim().length < 5} onClick={() => { disposeSample(open!.id, dispose.trim()); setDispose(''); setOpen(null) }}>تأكيد الإتلاف</Button></>}>
        <Field label="سبب الإتلاف" required hint="انتهاء مدة الاحتفاظ / اختبار تدميري / تلف"><Textarea value={dispose.trim()} onChange={e => setDispose(e.target.value || ' ')} className="min-h-16" /></Field>
      </Modal>
    </>
  )
}

export function SampleDetail({ s }: { s: ArchivedSample }) {
  const photos = PHOTOS.filter(p => s.photos.includes(p.id))
  const daysLeft = Math.round((new Date(s.retentionUntil).getTime() - Date.now()) / 864e5)
  return (
    <div className="grid gap-3">
      {/* Identity strip: tag, seal, request, who/when — everything an auditor asks first, in one row */}
      <div className="flex items-start gap-3 rounded-sm border border-ink-200 p-3">
        <QrLabel id={s.id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-bold">{s.id}</span><Badge tone={stepTone(s.status)} dot size="xs">{s.status}</Badge><Badge tone={s.condition === 'سليمة' ? 'ok' : 'warn'} size="xs">{s.condition}</Badge><span className="meta">{s.kind} · ختم <span className="ltr">{s.sealNo}</span></span></div>
          <div className="mt-2"><KV cols={4} dense items={[{ k: 'الطلب', v: <Link to={`/requests/${s.requestId}`} className="text-brand-700 hover:underline">{s.requestId}</Link> }, { k: 'الجسة', v: s.boreholeCode ?? '—' }, { k: 'جُمعت', v: fmtDateTime(s.collectedAt) }, { k: 'بواسطة', v: s.collectedBy }, { k: 'التخزين', v: s.storage }, { k: 'الاحتفاظ حتى', v: <span className={cx(daysLeft < 30 && 'text-warn-700')}>{fmtDate(s.retentionUntil)} <span className="meta">({s.status === 'متلفة' ? '—' : daysLeft < 0 ? 'مستحق الإتلاف' : `${daysLeft} يوماً`})</span></span> }, { k: 'الإحداثيات', v: <span className="ltr num">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span> }, { k: 'الأبعاد / الكتلة', v: <span className="flex flex-wrap gap-1">{Object.entries(s.dims).map(([k, v]) => <span key={k} className="whitespace-nowrap rounded-xs bg-ink-50 px-1.5 py-0.5 text-[11px]"><span className="text-ink-500">{k}</span> <b className="num">{v}</b></span>)}</span> }]} /></div>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Section title="الصور" icon={Camera} desc={`${photos.length} — بالوقت والإحداثيات وبصمة الملف`} bodyClass="p-3"><PhotoGrid photos={photos} cols={photos.length > 2 ? 3 : 2} size="md" /></Section>
        <Section title="موقع الجمع" icon={MapPin} desc="WGS-84" bodyClass="p-2"><GeoMap center={[s.lat, s.lng]} zoom={17} pins={[{ lat: s.lat, lng: s.lng, label: s.id, tone: 'brand' }]} height={210} /></Section>
      </div>
      <Section title="سلسلة الحيازة" icon={ShieldCheck} desc="لا تُعدَّل بعد التسجيل — ISO/IEC 17025 §7.4" bodyClass="p-0"><ol className="grid sm:grid-cols-2 lg:grid-cols-3">{[...s.custody].reverse().map((c, i) => <li key={i} className="flex items-start gap-2 border-b border-ink-100 px-3 py-2 text-[12px] sm:border-e"><Badge tone={c.step === 'إتلاف' ? 'danger' : c.step === 'اختبار' ? 'accent' : 'neutral'} size="xs">{c.step}</Badge><span className="min-w-0 flex-1"><span className="block truncate"><b>{c.by}</b> — {c.where}</span>{c.note && <span className="block truncate text-ink-600" title={c.note}>{c.note}</span>}<span className="meta">{fmtDateTime(c.at)}{c.tempC != null && <> · <Thermometer className="inline size-3" /> {c.tempC}°C</>}</span></span></li>)}</ol></Section>
    </div>
  )
}

/* ───────── Equipment & calibration registry (ISO/IEC 17025 §6.4) ───────── */
export function EquipmentPage() {
  const user = useStore(s => s.user)!
  const orgs = useStore(s => s.orgs)
  const allEq = useStore(s => s.equipment); const upsertEquipment = useStore(s => s.upsertEquipment); const recordCalibration = useStore(s => s.recordCalibration); const retireEquipment = useStore(s => s.retireEquipment)
  const items = allEq.filter(e => user.role !== 'lab' || e.labId === user.orgId)
  const [edit, setEdit] = useState<Equipment | null>(null)
  const [cal, setCal] = useState<null | { id: string; certificate: string; calibratedAt: string; provider: string }>(null)
  const [open, setOpen] = useState<Equipment | null>(null)
  const days = (e: Equipment) => Math.round((new Date(e.calibrationDue).getTime() - Date.now()) / 864e5)
  const cols: Column<Equipment>[] = [
    { key: 'id', header: 'المعدّة', width: '250px', sortValue: e => e.name, exportValue: e => e.name, cell: e => <div><button type="button" onClick={() => setOpen(e)} className="font-semibold text-brand-700 hover:underline">{e.name}</button><div className="meta"><span className="ltr">{e.id}</span> · <span className="ltr">{e.serial}</span></div></div> },
    { key: 'type', header: 'النوع', width: '110px', sortValue: e => e.type, cell: e => <Badge tone="neutral" size="xs">{e.type}</Badge> },
    { key: 'range', header: 'المدى / الدقة', cell: e => <span className="ltr num whitespace-nowrap text-[12px]">{e.range} · {e.resolution}</span> },
    { key: 'cal', header: 'آخر معايرة', width: '120px', sortValue: e => e.calibratedAt, cell: e => <span className="num whitespace-nowrap text-[12px]">{e.calibratedAt}</span> },
    { key: 'due', header: 'تستحق في', width: '150px', sortValue: e => e.calibrationDue, cell: e => { const d = days(e); return <div className="whitespace-nowrap"><div className="num text-[12px]">{e.calibrationDue}</div><Progress value={Math.max(0, Math.min(100, 100 - (d / 365) * 100))} tone={d < 0 ? 'danger' : d < 60 ? 'warn' : 'ok'} label={d < 0 ? `متأخرة ${-d} يوماً` : `${d} يوماً`} /></div> } },
    { key: 'cert', header: 'الشهادة / الجهة', cell: e => <div className="text-[12px]"><span className="ltr">{e.certificate}</span><div className="meta">{e.provider}</div></div> },
    { key: 'loc', header: 'الموقع', width: '140px', cell: e => <span className="text-[12px]">{e.location}</span> },
    { key: 'status', header: 'الحالة', width: '110px', sortValue: e => e.status, cell: e => <Badge tone={e.status === 'صالح' ? 'ok' : e.status === 'قارب الانتهاء' ? 'warn' : e.status === 'خارج الخدمة' ? 'neutral' : 'danger'} dot size="xs">{e.status}</Badge> },
    { key: 'act', header: '', width: '80px', hideable: false, cell: e => <Button size="xs" variant="ghost" onClick={() => setOpen(e)}>البطاقة</Button> },
  ]
  const expired = items.filter(e => e.status === 'منتهٍ'), soon = items.filter(e => e.status === 'قارب الانتهاء')
  return (
    <>
      <PageHeader title="المعدات والمعايرة" sub="سجل المعدات المؤثرة على صحة النتائج — كل نتيجة تُربط بالمعدّة وشهادة معايرتها السارية (ISO/IEC 17025 §6.4)" actions={user.role === 'lab' && <Button icon={Wrench} onClick={() => setEdit({ id: `EQ-L1-${String(allEq.length + 1).padStart(3, '0')}`, labId: user.orgId, name: '', type: 'أبعاد', serial: '', range: '', resolution: '', calibratedAt: new Date().toISOString().slice(0, 10), calibrationDue: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10), certificate: '', provider: 'المركز الوطني للقياس والمعايرة', status: 'صالح', location: '' })}>إضافة معدّة</Button>} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && allEq.some(e => e.id === edit.id) ? 'تعديل معدّة' : 'إضافة معدّة'} sub="لا تُقبل معدّة في أي نتيجة دون شهادة معايرة سارية" width="md" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button><Button disabled={!edit || edit.name.trim().length < 3 || !edit.serial.trim() || !edit.certificate.trim()} onClick={() => { upsertEquipment(edit!); setEdit(null) }}>حفظ</Button></>}>
        {edit && <div className="grid gap-3 sm:grid-cols-2"><Field label="اسم المعدّة" required><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="النوع"><Select value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}>{['ضغط/شد', 'أبعاد', 'كتلة', 'حرارة', 'اختراق', 'كثافة', 'حفر', 'اختراق قياسي', 'منسوب', 'موقع', 'تدرج', 'جهد صدأ', 'بيئة'].map(t => <option key={t}>{t}</option>)}</Select></Field><Field label="الرقم التسلسلي" required><Input value={edit.serial} onChange={e => setEdit({ ...edit, serial: e.target.value })} className="ltr" /></Field><Field label="الموقع"><Input value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} /></Field><Field label="المدى"><Input value={edit.range} onChange={e => setEdit({ ...edit, range: e.target.value })} className="ltr" /></Field><Field label="الدقة"><Input value={edit.resolution} onChange={e => setEdit({ ...edit, resolution: e.target.value })} className="ltr" /></Field><Field label="شهادة المعايرة" required><Input value={edit.certificate} onChange={e => setEdit({ ...edit, certificate: e.target.value })} className="ltr" placeholder="CAL-26-0000" /></Field><Field label="جهة المعايرة"><Input value={edit.provider} onChange={e => setEdit({ ...edit, provider: e.target.value })} /></Field><Field label="تاريخ المعايرة"><Input type="date" value={edit.calibratedAt} onChange={e => setEdit({ ...edit, calibratedAt: e.target.value, calibrationDue: new Date(new Date(e.target.value).getTime() + 365 * 864e5).toISOString().slice(0, 10) })} className="ltr" /></Field><Field label="تستحق في"><Input type="date" value={edit.calibrationDue} onChange={e => setEdit({ ...edit, calibrationDue: e.target.value })} className="ltr" /></Field></div>}
      </Modal>
      <Modal open={!!cal} onClose={() => setCal(null)} title="تسجيل معايرة جديدة" width="sm" footer={<><Button variant="secondary" onClick={() => setCal(null)}>إلغاء</Button><Button disabled={!cal || !cal.certificate.trim()} onClick={() => { recordCalibration(cal!.id, cal!.certificate, cal!.calibratedAt, cal!.provider); setCal(null); setOpen(null) }}>تسجيل</Button></>}>
        {cal && <div className="grid gap-3"><Field label="رقم الشهادة" required><Input value={cal.certificate} onChange={e => setCal({ ...cal, certificate: e.target.value })} className="ltr" /></Field><Field label="تاريخ المعايرة"><Input type="date" value={cal.calibratedAt} onChange={e => setCal({ ...cal, calibratedAt: e.target.value })} className="ltr" /></Field><Field label="جهة المعايرة"><Input value={cal.provider} onChange={e => setCal({ ...cal, provider: e.target.value })} /></Field><p className="meta">تُحدَّث الصلاحية تلقائياً إلى سنة من تاريخ المعايرة وتُرفع الحالة إلى «صالح».</p></div>}
      </Modal>
      {expired.length > 0 && <div className="mb-3 flex items-center gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] text-danger-700"><AlertTriangle className="size-4" /><b>{expired.map(e => e.name).join('، ')}</b> — معايرة منتهية: المنصة تمنع ربط نتائج جديدة بهذه المعدّة حتى التجديد.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="المعدات" value={items.length} icon={Wrench} hint={`${orgs.find(o => o.id === (user.role === 'lab' ? user.orgId : 'o-lab1'))?.name ?? ''}`} />
        <Kpi label="معايرة سارية" value={items.filter(e => e.status === 'صالح').length} tone="ok" />
        <Kpi label="تقارب الانتهاء (≤ 60 يوماً)" value={soon.length} tone={soon.length ? 'warn' : 'ok'} icon={CalendarClock} />
        <Kpi label="منتهية" value={expired.length} tone={expired.length ? 'danger' : 'ok'} icon={AlertTriangle} />
        <Kpi label="نتائج مرتبطة بمعدّة" value="100%" hint="شرط اعتماد المخرج" tone="ok" icon={ShieldCheck} />
      </div>
      <div className="mt-3"><DataTable rows={items} columns={cols} rowKey={e => e.id} onRowClick={e => setOpen(e)} searchable={e => `${e.name} ${e.serial} ${e.type} ${e.id}`} exportName="equipment" defaultSort={{ key: 'due', dir: 'asc' }} filters={[{ key: 'st', label: 'الحالة', options: ['صالح', 'قارب الانتهاء', 'منتهٍ', 'خارج الخدمة'].map(s => ({ value: s, label: s })), match: (e, v) => e.status === v }, { key: 'type', label: 'النوع', options: [...new Set(items.map(e => e.type))].map(t => ({ value: t, label: t })), match: (e, v) => e.type === v }]} /></div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} sub={open ? `${open.id} · ${open.serial}` : ''} width="md" footer={<>{user.role === 'lab' && open && open.status !== 'خارج الخدمة' && <><Button variant="secondary" onClick={() => { setEdit(open); setOpen(null) }}>تعديل</Button><Button variant="secondary" onClick={() => setCal({ id: open.id, certificate: '', calibratedAt: new Date().toISOString().slice(0, 10), provider: open.provider })}>تسجيل معايرة</Button><Button variant="danger" onClick={() => { retireEquipment(open.id); setOpen(null) }}>إخراج من الخدمة</Button></>}<Button variant="secondary" onClick={() => setOpen(null)}>إغلاق</Button></>}>
        {open && <div className="grid gap-3">
          <KV cols={3} dense items={[{ k: 'النوع', v: open.type }, { k: 'المدى', v: <span className="ltr">{open.range}</span> }, { k: 'الدقة', v: <span className="ltr">{open.resolution}</span> }, { k: 'آخر معايرة', v: open.calibratedAt }, { k: 'تستحق', v: open.calibrationDue }, { k: 'الحالة', v: <Badge tone={open.status === 'صالح' ? 'ok' : open.status === 'قارب الانتهاء' ? 'warn' : 'danger'} size="xs">{open.status}</Badge> }, { k: 'الشهادة', v: <span className="ltr">{open.certificate}</span> }, { k: 'جهة المعايرة', v: open.provider }, { k: 'الموقع', v: open.location }]} />
          <Section title="الاختبارات التي تعتمد على هذه المعدّة" bodyClass="p-3"><div className="flex flex-wrap gap-1.5">{METHODS.filter(m => m.equipment.includes(open.id)).map(m => <Badge key={m.refTestId} tone="neutral" size="xs">{m.title} · <span className="ltr">{m.standard}</span></Badge>)}</div></Section>
          <Section title="سجل المعايرة" bodyClass="p-3"><Timeline entries={[{ id: 'c1', at: new Date(open.calibratedAt).toISOString(), actor: open.provider, actorRole: 'admin', action: `معايرة — ${open.certificate}`, detail: 'مطابقة للمواصفة · شهادة مرفقة' }, { id: 'c2', at: new Date(new Date(open.calibratedAt).getTime() - 365 * 864e5).toISOString(), actor: open.provider, actorRole: 'admin', action: 'معايرة سابقة', detail: 'مطابقة' }]} limit={3} /></Section>
        </div>}
      </Modal>
    </>
  )
}

/* ───────── Test report sheet — the accredited lab's output for one test ───────── */
export function TestSheet({ requestId, testId }: { requestId: string; testId: string }) {
  const r = useStore(s => s.requests.find(x => x.id === requestId))!
  const t = r.tests.find(x => x.id === testId)!
  const orgs = useStore(s => s.orgs); const refTests = useStore(s => s.refTests)
  const rt = refTests.find(x => x.id === t.refTestId)!; const m = methodFor(t.refTestId)
  const lab = orgs.find(o => o.id === r.labId)!
  const sample = SAMPLES.find(s => s.testId === testId && s.requestId === requestId) ?? SAMPLES.find(s => s.requestId === requestId)
  const photos = PHOTOS.filter(p => p.requestId === requestId && (p.testId === testId || (!p.testId && p.sampleId === sample?.id)))
  const [tab, setTab] = useState<'sheet' | 'method' | 'photos' | 'sample'>('sheet')
  const specimen: Record<string, string> = t.refTestId === 'rt-proctor' ? { mouldVol: '944', points: '5', hammer: '4.54', passing: '96.2' } : t.refTestId === 'rt-cbr' ? { blows: '56', surcharge: '4.54', soakH: '96', load254: '6.85' } : t.refTestId === 'rt-fdt' ? { holeVol: '1,262', wetMass: '2,310', sandDensity: '1.42', mc: '8.4' } : t.refTestId === 'rt-core' ? { dia: '68.0', len: '110–140', mass: '945', ld: '1.69', load: '417', corr: '0.975', fracture: 'Type 2' } : {}
  return (
    <div className="grid gap-3">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'sheet', label: 'ورقة الاختبار' }, { value: 'method', label: 'طريقة القياس والمعدات' }, { value: 'photos', label: 'الصور', count: photos.length }, { value: 'sample', label: 'العينة وسلسلة الحيازة' }]} />
      {tab === 'sheet' && <div className="rounded-sm border border-ink-200">
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-3 py-2"><div><div className="text-[13px] font-bold">Test Report — {rt.nameEn}</div><div className="meta">{rt.nameAr} · <span className="ltr">{t.method}</span> · نموذج <span className="ltr">{m?.form ?? 'MTS-00-000'}</span></div></div><div className="flex items-center gap-1.5"><Badge tone="ok" size="xs">SAAC {lab.saac?.number ?? '—'}</Badge><Badge tone="neutral" size="xs">ILAC-MRA</Badge></div></div>
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <div><div className="data-label mb-1">General info</div><KV cols={2} dense items={[{ k: 'العميل', v: orgs.find(o => o.id === r.contractorId)?.name }, { k: 'المشروع', v: r.project }, { k: 'الموقع', v: r.location }, { k: 'استلام العينة', v: t.sample ? fmtDate(t.sample.receivedAt) : '—' }, { k: 'تاريخ الاختبار', v: t.submittedAt ? fmtDate(t.submittedAt) : '—' }, { k: 'حرارة القاعة', v: '24 °C · 41% RH' }, { k: 'رقم العينة', v: t.sample?.id ?? sample?.id ?? '—' }, { k: 'رقم التقرير', v: <span className="ltr">{`${r.id}/${t.id.toUpperCase()}`}</span> }]} /></div>
          <div><div className="data-label mb-1">Sample info</div><KV cols={2} dense items={[{ k: 'النوع', v: sample?.kind ?? rt.nameAr }, { k: 'التسمية', v: sample?.designation ?? '—' }, { k: 'عمق الأخذ', v: t.sample ? `${t.sample.depth} م` : '—' }, { k: 'الفني', v: t.sample?.technician ?? sample?.collectedBy ?? '—' }, { k: 'حُددت بواسطة', v: 'الاستشاري' }, { k: 'الحالة', v: sample?.condition ?? 'سليمة' }, { k: 'الختم', v: <span className="ltr">{sample?.sealNo ?? '—'}</span> }, { k: 'التحقق الجغرافي', v: t.sample?.geoVerified ? 'مطابق ≤ 3 م' : '—' }]} /></div>
        </div>
        <div className="border-t border-ink-200 p-3"><div className="data-label mb-1">Test results — الأبعاد والقياسات والنتيجة</div>
          <table className="w-full text-[12px]"><tbody>
            {(m?.specimenFields ?? []).map(f => <tr key={f.key} className="border-b border-ink-100"><td className="py-1 text-ink-600">{f.label}</td><td className="num py-1 text-end font-semibold">{specimen[f.key] ?? '—'} <span className="meta">{f.unit}</span></td></tr>)}
            {Object.entries(t.result ?? {}).map(([k, v]) => { const f = rt.resultFields?.find(x => x.key === k); return <tr key={k} className="border-b border-ink-100 bg-brand-50/50"><td className="py-1 font-semibold text-ink-800">{f?.label ?? k}</td><td className="num py-1 text-end text-[14px] font-bold text-brand-800">{v} <span className="meta">{f?.unit}</span></td></tr> })}
            <tr><td className="py-1 text-ink-600">عدم اليقين</td><td className="py-1 text-end text-[11.5px]">{m?.uncertainty ?? '—'}</td></tr>
            <tr><td className="py-1 text-ink-600">حد القبول</td><td className="py-1 text-end text-[11.5px]">{m?.acceptance ?? 'وفق مواصفات المشروع'}</td></tr>
          </tbody></table>
        </div>
        <div className="grid gap-2 border-t border-ink-200 p-3 sm:grid-cols-3 text-[11.5px]"><div><div className="data-label">Remarks</div>{t.notes ?? 'لا ملاحظات'}</div><div><div className="data-label">Prepared by</div>{t.sample?.technician ?? 'فيصل القحطاني'} · {t.submittedAt ? fmtDate(t.submittedAt) : '—'}</div><div><div className="data-label">Approved by</div>{lab.name} — المفوّض الرئيسي<div className="meta">توقيع رقمي + ختم المختبر</div></div></div>
      </div>}
      {tab === 'method' && (m ? <MethodCard m={m} equipment={EQUIPMENT} /> : <p className="meta">لا توجد ورقة طريقة قياس معتمدة لهذا الاختبار بعد — تُضاف من قاعدة المعرفة.</p>)}
      {tab === 'photos' && <PhotoGrid photos={photos} cols={4} />}
      {tab === 'sample' && (sample ? <SampleDetail s={sample} /> : <p className="meta">لم تُسجَّل عينة مؤرشفة لهذا الاختبار بعد.</p>)}
    </div>
  )
}

export { QrLabel }
