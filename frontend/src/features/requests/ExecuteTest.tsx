import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MapPin, Upload, Save, Users, Thermometer, Ruler, Camera, ClipboardList } from 'lucide-react'
import { useStore, methodFor, photosFor } from '@/lib/store'
import { PageHeader, Countdown, Step, FileTile, Timeline } from '@/ds/composite'
import { Field, Input, Textarea, Button, Callout, Badge, StatusPill, Code, KV, Modal, Section, Kpi, cx } from '@/ds/primitives'
import { PhotoGrid } from '@/ds/evidence'
import { fmtSAR, fmtDateTime, fmtDate, fmtSlot } from '@/lib/format'
import DelegationModal from '@/features/delegation/DelegationModal'

export default function ExecuteTest() {
  const { id, testId } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))
  const refTests = useStore(s => s.refTests)
  const rules = useStore(s => s.rules)
  const registerSample = useStore(s => s.registerSample)
  const saveResult = useStore(s => s.saveResult)
  const submitResult = useStore(s => s.submitResult)
  const equipment = useStore(s => s.equipment)
  const refLimits = useStore(s => s.refLimits)
  const t = r?.tests.find(x => x.id === testId)
  const orgs = useStore(s => s.orgs)
  const org = (oid: string) => orgs.find(o => o.id === oid)?.name ?? oid
  const rt = refTests.find(x => x.id === t?.refTestId)
  const [depth, setDepth] = useState('1.5')
  const [tech, setTech] = useState(user.name)
  const [result, setResult] = useState<Record<string, string>>(Object.fromEntries(Object.entries(t?.result ?? {}).map(([k, v]) => [k, String(v)])))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [file, setFile] = useState<{ name: string; size: string; file?: string } | undefined>(t?.report)
  const [notes, setNotes] = useState(t?.notes ?? '')
  const [confirm, setConfirm] = useState(false)
  const [delegate, setDelegate] = useState(false)
  const method0 = methodFor(t?.refTestId ?? '')
  const [specimen, setSpecimen] = useState<Record<string, string>>({})
  const [usedEq, setUsedEq] = useState<string[]>(method0?.equipment.filter(id => equipment.find(e => e.id === id)?.status !== 'منتهٍ') ?? [])
  if (!r || !t || !rt) return <Callout tone="danger">الاختبار غير موجود.</Callout>
  const s1 = t.sample ? 'done' : 'active'
  const s2 = !t.sample ? 'locked' : t.sample.confirmedByContractor ? (['STS19', 'STS20', 'STS21'].includes(t.status) ? 'done' : 'active') : 'locked'
  const fields = rt.resultFields ?? [{ key: 'value', label: 'النتيجة', unit: '' }]
  const method = methodFor(t.refTestId)
  const photos = photosFor({ requestId: r.id, testId: t.id })
  const resultsOk = fields.every(f => result[f.key]?.trim())
  const readOnly = ['STS19', 'STS20', 'STS21'].includes(t.status)
  const canSubmit = s2 === 'active' && resultsOk && !!file && !readOnly
  // B.R.149 — execution cannot start before the approved slot; the button says so instead of failing on click
  const slotStart = r.chosenSlot ? new Date(`${r.chosenSlot.date}T${r.chosenSlot.from}:00`).getTime() : 0
  const slotEnd = r.chosenSlot ? new Date(`${r.chosenSlot.date}T${r.chosenSlot.to}:00`).getTime() : 0
  const beforeSlot = slotStart > Date.now()
  const afterSlot = slotEnd > 0 && Date.now() > slotEnd
  const canExecute = ['STS12', 'STS14'].includes(r.status) && !beforeSlot

  return (
    <>
      <PageHeader crumbs={[{ label: 'طلبات الاختبارات', to: '/requests' }, { label: r.id, to: `/requests/${r.id}` }, { label: rt.nameAr }]} title={rt.nameAr} sub={<span className="flex flex-wrap items-center gap-2">{r.id} · {r.project} · <Code>{t.method}</Code></span>}
        meta={<><StatusPill code={t.status} size="xs" />{t.deadlineAt && <Countdown until={t.deadlineAt} warnBelow={24} />}{t.deadlineAt && <span className="meta">انتهاء SLA: {fmtDate(t.deadlineAt)}</span>}<Badge tone="neutral" size="xs">SLA {t.sla} أيام · {fmtSAR(t.price)}</Badge></>}
        actions={user.canDelegate && <Button variant="secondary" icon={Users} onClick={() => setDelegate(true)}>تفويض هذا الاختبار</Button>} />
      <Callout tone="info" compact className="mb-3">المختبر ينفّذ الاختبار ويرفع النتائج فقط؛ اعتماد أو رفض النتيجة من مسؤولية المكتب الاستشاري حصرياً خلال {rules.consultantDecisionHours} ساعة وإلا تُعتمد تلقائياً (B.R.152).</Callout>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <Step n={1} title="تسجيل استلام العينة في الموقع" state={s1} badge={t.sample ? (t.sample.confirmedByContractor ? <Badge tone="ok" size="xs">مؤكَّد من المقاول</Badge> : <Badge tone="warn" size="xs">بانتظار تأكيد المقاول</Badge>) : <Badge tone="neutral" size="xs">لم يُسجَّل بعد</Badge>}>
            {!t.sample ? (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="عمق العينة" required><Input value={depth} onChange={e => setDepth(e.target.value)} suffix="م" className="ltr" inputMode="decimal" /></Field><Field label="الفني المستلم" required><Input value={tech} onChange={e => setTech(e.target.value)} /></Field><Field label="التحقق الجغرافي"><div className="flex h-9 items-center gap-1.5 rounded-sm border border-ok-100 bg-ok-25 px-2.5 text-[12px] text-ok-700"><MapPin className="size-3.5" />مطابق — 1.2 م من الموقع</div></Field></div>
                <div className="flex items-center justify-between"><span className="meta">يجب أن يكون الفني ضمن {rules.geofenceMeters} م من موقع المشروع لقبول التسجيل. يبدأ عداد SLA بعد تأكيد المقاول.</span><Button icon={MapPin} onClick={() => registerSample(r.id, t.id, { depth: +depth, technician: tech })} disabled={!depth || !tech || !canExecute}>{beforeSlot ? `يُتاح من ${fmtSlot(r.chosenSlot)}` : 'تسجيل استلام العينة الآن'}</Button></div>
                {beforeSlot && <Callout tone="warn" compact>لا يبدأ التنفيذ قبل الموعد المعتمد <b>{fmtSlot(r.chosenSlot)}</b> (B.R.149). البدء بعده مسموح لكن التأخر يُسجَّل في مؤشرات المختبر.</Callout>}
                {afterSlot && <Callout tone="danger" compact>تجاوزت نافذة الموعد المعتمد ({fmtSlot(r.chosenSlot)}) — يُسمح بالبدء مع تسجيل مدة التأخر ({Math.round((Date.now() - slotEnd) / 36e5)} ساعة) في مؤشرات المختبر وتقييمه (B.R.149/155).</Callout>}
              </div>
            ) : <KV cols={5} dense items={[{ k: 'رقم العينة', v: t.sample.id }, { k: 'العمق', v: `${t.sample.depth} م` }, { k: 'الفني', v: t.sample.technician }, { k: 'وقت التسجيل', v: fmtDateTime(t.sample.receivedAt) }, { k: 'التحقق الجغرافي', v: <Badge tone="ok" size="xs">مطابق</Badge> }]} />}
            {t.sample && !t.sample.confirmedByContractor && <Callout tone="warn" compact className="mt-3">بانتظار تأكيد المقاول لاستلام العينة — أُرسل إشعار. يُفعَّل عداد SLA فور التأكيد.</Callout>}
          </Step>

          <Step n={2} title="تنفيذ الاختبار وتسجيل النتائج" state={s2} badge={s2 === 'locked' ? <Badge tone="neutral" size="xs">بانتظار تأكيد الاستلام</Badge> : undefined}>
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-4"><Field label="عمق العينة"><Input value={t.sample?.depth ?? depth} readOnly suffix="م" className="ltr" /></Field><Field label="الفني المنفذ"><Input value={tech} onChange={e => setTech(e.target.value)} disabled={s2 !== 'active'} /></Field><Field label="تاريخ الاختبار"><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="ltr" disabled={s2 !== 'active'} /></Field>{method && <Field label="الظروف البيئية"><Input value={method.environment} readOnly prefixIcon={Thermometer} /></Field>}</div>
              {method && <div className="rounded-sm border border-ink-200 p-3"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 text-[12.5px] font-bold"><ClipboardList className="size-4 text-brand-600" />طريقة القياس والمعدات — <Code>{method.standard}</Code></span><span className="meta">نموذج {method.form} · {method.uncertainty}</span></div>
                <ol className="mb-3 grid gap-1 text-[11.5px] text-ink-700 sm:grid-cols-2">{method.procedure.map((st, i) => <li key={i} className="flex gap-1.5"><span className="grid size-4 shrink-0 place-items-center rounded-full bg-brand-50 text-[9.5px] font-bold text-brand-700">{i + 1}</span>{st}</li>)}</ol>
                <div className="grid gap-3 sm:grid-cols-4">{method.specimenFields.map(f => <Field key={f.key} label={f.label}><Input value={specimen[f.key] ?? ''} onChange={e => setSpecimen({ ...specimen, [f.key]: e.target.value })} suffix={f.unit || undefined} className="ltr" disabled={s2 !== 'active' || readOnly} /></Field>)}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="المعدّات المستخدمة" hint="المعايرة السارية فقط تُقبل"><div className="flex flex-wrap gap-1.5">{method.equipment.map(id => { const e = equipment.find(x => x.id === id); if (!e) return null; const on = usedEq.includes(id); return <button key={id} type="button" disabled={e.status === 'منتهٍ' || s2 !== 'active' || readOnly} onClick={() => setUsedEq(on ? usedEq.filter(x => x !== id) : [...usedEq, id])} className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-600', e.status === 'منتهٍ' && 'line-through opacity-50')}>{e.name}<Badge tone={e.status === 'صالح' ? 'ok' : e.status === 'قارب الانتهاء' ? 'warn' : 'danger'} size="xs">{e.calibrationDue}</Badge></button> })}</div></Field></div>
              </div>}
              <div className="rounded-sm border border-ink-200 p-3"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 text-[12.5px] font-bold"><Camera className="size-4 text-brand-600" />صور العينة والقياس</span>{s2 === 'active' && !readOnly && <Button size="xs" variant="secondary" icon={Camera} onClick={() => useStore.getState().toast({ title: 'التقاط صورة', body: 'تُلتقط من التطبيق الميداني وتُربط تلقائياً بالوقت والإحداثيات وبصمة الملف.', tone: 'info' })}>التقاط صورة</Button>}</div><PhotoGrid photos={photos} cols={6} size="sm" /></div>
              <div className="rounded-sm bg-ink-50 p-3"><div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold"><Ruler className="size-4 text-brand-600" />نتائج الاختبار — <Code>{t.method}</Code></div><div className="grid gap-3 sm:grid-cols-3">{fields.map(f => <Field key={f.key} label={f.label} required><Input value={result[f.key] ?? ''} onChange={e => setResult({ ...result, [f.key]: e.target.value })} suffix={f.unit} className="ltr" inputMode="decimal" disabled={s2 !== 'active' || readOnly} /></Field>)}</div></div>
            </div>
          </Step>

          <Step n={3} title="رفع تقرير النتيجة" state={s2 === 'done' ? 'done' : s2 === 'active' ? 'active' : 'locked'}>
            <div className="grid gap-3 sm:grid-cols-2"><FileTile name={file?.name} size={file?.size} doctype="Test Line" docname={t.id} fieldname="report_file" onChange={f => setFile({ name: f.name, size: f.size, file: f.file })} onRemove={readOnly ? undefined : () => setFile(undefined)} disabled={s2 !== 'active'} /><Field label="ملاحظات فنية"><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات فنية للاستشاري…" className="min-h-[76px]" disabled={s2 !== 'active'} /></Field></div>
          </Step>
          <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="secondary" icon={Save} disabled={s2 !== 'active'} onClick={() => { saveResult(r.id, t.id, result, file, notes); useStore.getState().toast({ title: 'حُفظت النتائج كمسودة', tone: 'ok' }) }}>حفظ ومتابعة لاحقاً</Button><Button icon={Upload} disabled={!canSubmit} onClick={() => setConfirm(true)}>رفع النتيجة لاعتماد الاستشاري</Button></div>
        </div>
        <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
          <div className="grid grid-cols-2 gap-3"><Kpi label="SLA المتبقي" value={t.deadlineAt ? Math.max(0, Math.ceil((new Date(t.deadlineAt).getTime() - Date.now()) / 864e5)) : '—'} unit="يوم" tone={t.deadlineAt && new Date(t.deadlineAt).getTime() - Date.now() < 864e5 ? 'danger' : 'ok'} /><Kpi label="اختبارات الطلب" value={`${r.tests.filter(x => x.status === 'STS20').length}/${r.tests.length}`} hint="معتمدة" /></div>
          <Section title="المعيار وحقول النتيجة" bodyClass="p-3"><KV cols={1} dense items={[{ k: 'المعيار', v: <Code>{t.method}</Code> }, { k: 'حقول النتيجة', v: fields.map(f => f.label).join(' · ') }, { k: 'المخرج', v: 'حقول مهيكلة + تقرير PDF' }, { k: 'المفوَّض', v: useStore.getState().users.find(u => u.id === t.delegateId)?.name ?? '—' }]} /></Section>
          <Section title="الحدود المرجعية" desc="قاعدة المعرفة" bodyClass="p-3"><ul className="grid gap-1.5">{(refLimits[t.refTestId] ?? []).map(l => <li key={l.key} className="rounded-sm bg-ink-50 px-2.5 py-1.5 text-[11.5px]"><div className="font-semibold text-ink-800">{fields.find(f => f.key === l.key)?.label ?? l.key}</div><div className="text-ink-600">{l.rule}</div><div className="meta">{l.ref}</div></li>)}{!(refLimits[t.refTestId]?.length) && <li className="text-[11.5px] text-ink-600">تُقارن النتيجة بمتطلبات المواصفة {t.method} والتصميم المعتمد للمشروع.</li>}</ul></Section>
          <Section title="سجل الاختبار" bodyClass="p-3"><Timeline entries={[
            { id: 'h-created', at: r.submittedAt ?? r.createdAt, actor: r.history[0]?.actor ?? '—', actorRole: 'contractor' as const, action: 'إدراج الاختبار في الطلب', detail: `${rt.nameAr} · ${t.method}` },
            ...(r.chosenSlot ? [{ id: 'h-accepted', at: r.history.find(h => h.action.includes('قبول'))?.at ?? r.createdAt, actor: r.history.find(h => h.action.includes('قبول'))?.actor ?? org(r.labId), actorRole: 'lab' as const, action: 'قبول الطلب وتأكيد الموعد', detail: fmtSlot(r.chosenSlot) }] : []),
            ...(t.sample ? [{ id: 'h-sample', at: t.sample.receivedAt, actor: t.sample.technician, actorRole: 'lab' as const, action: 'تسجيل استلام العينة في الموقع', detail: `${t.sample.id} · عمق ${t.sample.depth} م · ${t.sample.geoVerified ? 'تحقق جغرافي مطابق' : 'خارج النطاق'}` }] : []),
            ...(t.sample?.confirmedByContractor && t.startedAt ? [{ id: 'h-confirm', at: t.startedAt, actor: org(r.contractorId), actorRole: 'contractor' as const, action: 'تأكيد المقاول استلام العينة — بدء عداد SLA', detail: t.deadlineAt ? `الموعد النهائي ${fmtDate(t.deadlineAt)}` : undefined }] : []),
            ...(t.delegateId ? [{ id: 'h-deleg', at: t.startedAt ?? r.createdAt, actor: user.name, actorRole: 'lab' as const, action: 'تفويض تنفيذ الاختبار', detail: useStore.getState().users.find(u => u.id === t.delegateId)?.name }] : []),
          ].sort((a, b) => b.at.localeCompare(a.at))} limit={6} /></Section>
        </div>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="رفع النتيجة" width="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>تراجع</Button><Button onClick={() => { saveResult(r.id, t.id, result, file, notes); submitResult(r.id, t.id); nav(`/requests/${r.id}`) }}>نعم، ارفع النتيجة</Button></>}><p className="text-[13px]">سيتم رفع النتيجة للمكتب الاستشاري لاعتمادها خلال {rules.consultantDecisionHours} ساعة. لن تتمكن من التعديل بعد الرفع.</p></Modal>
      {delegate && <DelegationModal open onClose={() => setDelegate(false)} requestId={r.id} testId={t.id} />}
    </>
  )
}
