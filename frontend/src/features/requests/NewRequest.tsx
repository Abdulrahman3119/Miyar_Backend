import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, X, MapPin, Send, Save, ArrowLeft, CheckCircle2, AlertTriangle, Paperclip } from 'lucide-react'
import { useStore, useSel } from '@/lib/store'
import { PageHeader, FileTile } from '@/ds/composite'
import { Section, Field, Input, Select, Textarea, Button, Callout, Modal, Card, Badge, Code, Tag, KV, cx } from '@/ds/primitives'
import { CATEGORY_LABEL } from '@/lib/lookups'
import type { TimeSlot, ServiceType, Category } from '@/lib/types'
import { fmtSAR, fmtDate } from '@/lib/format'

export default function NewRequest() {
  const { id: draftId } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  // Admin/support may create on any active contract; contractors only on their own.
  const pickAnyContract = user.role === 'admin' || user.role === 'support'
  const contracts = useSel(s => s.contracts.filter(c => c.active && (pickAnyContract || c.contractorId === user.orgId)))
  const catalog = useStore(s => s.catalog)
  const refTests = useStore(s => s.refTests)
  const orgs = useStore(s => s.orgs)
  const rules = useStore(s => s.rules)
  const saveDraft = useStore(s => s.saveDraft)
  const submitRequest = useStore(s => s.submitRequest)
  const existing = useStore(s => s.requests.find(r => r.id === draftId))

  const [contractId, setContractId] = useState(existing?.contractId ?? contracts[0]?.id ?? '')
  const [service, setService] = useState<ServiceType>(existing?.service ?? 'standard')
  const [priority, setPriority] = useState(existing?.priority ?? 'عادية')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [tests, setTests] = useState<{ refTestId: string; method: string; price: number; sla: number }[]>(existing?.tests.map(t => ({ refTestId: t.refTestId, method: t.method, price: t.price, sla: t.sla })) ?? [])
  const minDate = new Date(Date.now() + rules.minLeadHours * 36e5).toISOString().slice(0, 10)
  const [slots, setSlots] = useState<TimeSlot[]>(existing?.slots.length ? existing.slots : Array.from({ length: rules.proposedSlots }, (_, i) => ({ date: new Date(Date.now() + (rules.minLeadHours + 24 * i) * 36e5).toISOString().slice(0, 10), from: '09:00', to: '12:00' })))
  const [location, setLocation] = useState(existing?.location ?? '')
  const [attachments, setAttachments] = useState<{ name: string; size: string; file?: string }[]>(existing?.attachments ?? [])
  const [picker, setPicker] = useState(false)
  const [confirm, setConfirm] = useState<'send' | 'draft' | null>(null)

  const contract = contracts.find(c => c.id === contractId)
  const lab = orgs.find(o => o.id === contract?.labId)
  const geoRt = refTests.find(t => t.isGeotech)?.id
  const labCatalog = useMemo(() => catalog.filter(c => c.labId === contract?.labId && c.status === 'STS01' && c.refTestId !== geoRt), [catalog, contract, geoRt])
  const category: Category | undefined = tests[0] ? refTests.find(t => t.id === tests[0].refTestId)?.category : undefined
  const subtotal = tests.reduce((a, t) => a + t.price, 0); const vat = Math.round(subtotal * rules.vat) / 100
  const geoItem = catalog.find(c => c.labId === contract?.labId && c.refTestId === geoRt && c.status === 'STS01'); const geoPrice = geoItem?.basePrice ?? 0
  const errors: string[] = []
  if (!contractId) errors.push('اختر العقد')
  if (service === 'standard' && tests.length === 0) errors.push('أضف اختباراً واحداً على الأقل')
  if (service === 'geotech' && !geoItem) errors.push('المختبر المرتبط بالعقد لا يقدّم الدراسة الجيوتقنية')
  if (service === 'geotech' && !contract?.services.includes('geotech')) errors.push('العقد لا يشمل الدراسة الجيوتقنية')
  slots.forEach((s, i) => { if (!s.date || s.date < minDate) errors.push(`النطاق ${i + 1}: لا يقل عن ${rules.minLeadHours} ساعة من الآن`) })
  if (!location) errors.push('حدد موقع التنفيذ')
  // Never send `id: undefined` — saveDraft merges the payload over the generated draft and would lose the id (C1)
  const payload = () => ({ ...(existing ? { id: existing.id } : {}), contractId, contractorId: contract!.contractorId, labId: contract!.labId, consultantId: contract!.consultantId, project: contract!.project, city: contract?.city || location.split(/[—\-–]/)[0].trim(), priority: priority as any, service, category, notes, slots, location, attachments,
    tests: service === 'geotech' ? [{ id: 't-geo-' + Date.now(), refTestId: geoRt ?? '', method: geoItem?.methods[0] ?? '', price: geoPrice, sla: geoItem?.sla ?? 21, status: 'STS17' as const }] : tests.map((t, i) => ({ id: `t-${Date.now()}-${i}`, ...t, status: 'STS17' as const })) })
  const doDraft = async () => { const id = await saveDraft(payload()); if (!id) return; useStore.getState().toast({ title: 'حُفظ كمسودة', body: 'يمكنك استكماله وإرساله لاحقاً.', tone: 'ok' }); nav(`/requests/${id}`) }
  const doSend = async () => { const id = await saveDraft(payload()); if (!id) return; if (service === 'geotech') { nav(`/requests/${id}/study/prelim`); return } await submitRequest(id); nav('/requests') }
  const maxSla = Math.max(0, ...tests.map(t => t.sla))

  return (
    <>
      <PageHeader crumbs={[{ label: 'طلبات الاختبارات', to: '/requests' }, { label: existing ? existing.id : 'طلب جديد' }]} title="إنشاء طلب اختبار" sub="طلب واحد = نوع خدمة واحد وتصنيف واحد. يمكن الحفظ كمسودة في أي وقت ولا يمكن التعديل بعد الإرسال." />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <Section title="البيانات العامة" bodyClass="p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="العقد" required hint={pickAnyContract ? 'أي عقد فعّال على المنصة — يُنشأ الطلب باسم المقاول المرتبط بالعقد' : 'العقد الفعّال المرتبط بهذا الطلب'}><Select value={contractId} onChange={e => { setContractId(e.target.value); setTests([]) }}>{contracts.length === 0 && <option value="">لا توجد عقود فعّالة</option>}{contracts.map(c => <option key={c.id} value={c.id}>{c.id} — {c.project}{pickAnyContract ? ` · ${orgs.find(o => o.id === c.contractorId)?.name ?? c.contractorId}` : ''}</option>)}</Select></Field>
              <Field label="نوع الخدمة" required hint={service === 'geotech' ? 'يُراجَع من الاستشاري قبل الإحالة للمختبر' : 'يُرسل للمختبر مباشرة بعد اكتماله'}><Select value={service} onChange={e => setService(e.target.value as ServiceType)}><option value="standard">اختبارات قياسية</option><option value="geotech">دراسة جيوتقنية</option></Select></Field>
              <Field label="الأولوية" hint="تظهر للمختبر والاستشاري"><Select value={priority} onChange={e => setPriority(e.target.value as any)}><option>عادية</option><option>عالية</option><option>حرجة</option></Select></Field>
            </div>
            {contract && <div className="mt-3 rounded-sm bg-ink-50 p-3"><KV cols={4} dense items={[{ k: 'المشروع', v: contract.project }, { k: 'المختبر', v: lab?.name }, { k: 'الاستشاري المشرف', v: orgs.find(o => o.id === contract.consultantId)?.name }, { k: 'آلية الدفع', v: contract.payment === 'advance' ? 'دفع مقدّم' : 'عند الإتمام' }]} /></div>}
            <Field label="ملاحظات للمختبر" className="mt-3"><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="مثال: يُفضل الفترة الصباحية — الموقع مغلق مسائياً" className="min-h-14" /></Field>
            <Field label="المرفقات (إن وجدت)" hint="مخططات، مواصفات المشروع، أو تعليمات أخذ العينات — PDF/صور حتى 10MB لكل ملف (B.R.133)" className="mt-3">
              <div className="grid gap-1.5">
                {attachments.map((a, i) => <div key={(a.file || a.name) + i} className="flex items-center justify-between rounded-sm border border-ink-200 bg-ink-50 px-3 py-1.5 text-[12.5px]"><span className="flex items-center gap-2"><Paperclip className="size-3.5 text-brand-600" /><span className="font-medium text-brand-700">{a.name}</span><span className="meta">{a.size}</span></span><button type="button" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-[11.5px] text-danger-600 hover:underline">إزالة</button></div>)}
                <FileTile
                  doctype={existing?.id ? 'Test Request' : undefined}
                  docname={existing?.id}
                  fieldname="attachments"
                  onChange={f => setAttachments([...attachments, { name: f.name, size: f.size, file: f.file }])}
                  hint="PDF · JPG · حد أقصى 10MB"
                />
              </div>
            </Field>
          </Section>

          {service === 'standard' ? (
            <Section title="الاختبارات المطلوبة" desc={`${tests.length} من ${rules.maxTestsPerRequest}`} actions={<Button variant="secondary" size="sm" icon={Plus} onClick={() => setPicker(true)} disabled={tests.length >= rules.maxTestsPerRequest || !contract}>إضافة اختبار</Button>} bodyClass="p-3">
              {category && <Callout tone="info" compact className="mb-2">مقيّد بتصنيف <b>{CATEGORY_LABEL[category]}</b> — اختبارات التصنيفات الأخرى معطّلة لنفس الطلب.</Callout>}
              {tests.length === 0 ? <div>
                  <div className="mb-2 flex items-center justify-between"><span className="text-[12px] text-ink-600">اختيار سريع من قائمة <b>{lab?.name}</b> — {labCatalog.length} اختباراً معتمداً</span><button type="button" onClick={() => setPicker(true)} className="text-[11.5px] font-semibold text-brand-700 hover:underline">القائمة الكاملة بالطرق والأسعار</button></div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{labCatalog.slice(0, 9).map(c => { const rt = refTests.find(x => x.id === c.refTestId)!; return (
                    <button key={c.id} type="button" onClick={() => setTests([...tests, { refTestId: c.refTestId, method: c.methods[0], price: c.basePrice!, sla: c.sla! }])} className="flex items-start gap-2 rounded-sm border border-ink-200 p-2.5 text-start hover:border-brand-500 hover:bg-brand-50">
                      <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-brand-50 text-brand-700"><Plus className="size-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold">{rt.nameAr}</span><span className="meta block truncate">{CATEGORY_LABEL[rt.category]} · {c.methods[0]} · SLA {c.sla} أيام</span></span>
                      <span className="num shrink-0 text-[12px] font-bold text-brand-700">{fmtSAR(c.basePrice!)}</span>
                    </button>) })}</div>
                </div> : (
                <table className="w-full text-[12.5px]"><thead><tr className="text-[11px] text-ink-500"><th className="pb-1 text-start font-semibold">الاختبار</th><th className="pb-1 text-start font-semibold">الطريقة</th><th className="pb-1 text-start font-semibold">SLA</th><th className="pb-1 text-end font-semibold">السعر</th><th /></tr></thead>
                  <tbody>{tests.map((t, i) => { const rt = refTests.find(x => x.id === t.refTestId)!; return <tr key={i} className="border-t border-ink-100"><td className="py-2 font-semibold">{rt.nameAr}<div className="meta">{rt.nameEn}</div></td><td><Code>{t.method}</Code></td><td className="num">{t.sla} أيام</td><td className="num text-end font-semibold text-brand-700">{fmtSAR(t.price)}</td><td className="text-end"><button onClick={() => setTests(tests.filter((_, j) => j !== i))} className="text-ink-400 hover:text-danger-600" aria-label="إزالة"><X className="size-4" /></button></td></tr> })}</tbody></table>
              )}
            </Section>
          ) : (
            <Section title="الدراسة الجيوتقنية" bodyClass="p-3">
              {geoItem ? <div className="flex items-center justify-between rounded-sm border border-ink-200 p-3"><div><div className="font-semibold">دراسة جيوتقنية شاملة <Code>SBC 303</Code></div><div className="meta">البيانات الأولية → خطة الاستكشاف (المحرك الذكي) → الميداني → المعملي → التحليل → التقرير · SLA {geoItem.sla} يوماً</div></div><span className="num font-bold text-brand-700">{fmtSAR(geoPrice)}</span></div> : <Callout tone="warn" compact>المختبر المرتبط بهذا العقد لا يقدّم الدراسة الجيوتقنية ضمن قائمته.</Callout>}
            </Section>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Section title={service === 'geotech' ? 'مواعيد بدء الاستكشاف الميداني' : 'المواعيد المقترحة للتنفيذ'} desc={`${rules.proposedSlots} نطاقات · أول موعد ≥ ${rules.minLeadHours} ساعة`} bodyClass="p-3">
              <div className="grid gap-2">{slots.map((s, i) => <div key={i} className="grid grid-cols-[1fr_auto_auto] items-end gap-2"><Field label={`النطاق ${['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'][i]}`} required><Input type="date" min={minDate} value={s.date} onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} className="ltr" /></Field><Field label="من"><Input type="time" value={s.from} onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} className="ltr w-24!" /></Field><Field label="إلى"><Input type="time" value={s.to} onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} className="ltr w-24!" /></Field></div>)}</div>
              <p className="meta mt-2">أقرب موعد مسموح: <b className="num">{fmtDate(minDate)} — 9:00 ص</b></p>
            </Section>
            <Section title="موقع التنفيذ" icon={MapPin} bodyClass="p-3">
              <Field label="موقع أخذ العينات" required><Input value={location} onChange={e => setLocation(e.target.value)} /></Field>
              <div className="mt-2 grid h-28 place-items-center rounded-sm border border-dashed border-ink-300 bg-[#F4F1E4] text-[11.5px] text-ink-500"><MapPin className="mb-1 size-4 text-brand-600" />{location || 'اضغط لتحديد الموقع على الخريطة'}<span className="meta">24.7136° N, 46.6753° E</span></div>
            </Section>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-4 xl:sticky xl:top-4 xl:self-start">
          <Card pad={false}>
            <div className="border-b border-ink-200 px-4 py-2.5"><h3 className="section-title">ملخص الطلب</h3></div>
            <div className="p-4">
              <ul className="grid gap-1.5 border-b border-ink-100 pb-3 text-[12.5px]">{service === 'geotech' ? <li className="flex justify-between"><span>دراسة جيوتقنية شاملة</span><span className="num">{fmtSAR(geoPrice)}</span></li> : tests.map((t, i) => <li key={i} className="flex justify-between"><span>{refTests.find(x => x.id === t.refTestId)?.nameAr}</span><span className="num">{fmtSAR(t.price)}</span></li>)}{service === 'standard' && tests.length === 0 && <li className="meta">لا توجد اختبارات</li>}</ul>
              <dl className="mt-3 grid gap-1.5 text-[12.5px]"><div className="flex justify-between"><dt className="text-ink-500">عدد الاختبارات</dt><dd className="num">{service === 'geotech' ? 1 : tests.length}</dd></div><div className="flex justify-between"><dt className="text-ink-500">أطول SLA</dt><dd className="num">{service === 'geotech' ? geoItem?.sla ?? '—' : maxSla} يوماً</dd></div><div className="flex justify-between"><dt className="text-ink-500">قبل الضريبة</dt><dd className="num">{fmtSAR(service === 'geotech' ? geoPrice : subtotal)}</dd></div><div className="flex justify-between"><dt className="text-ink-500">ضريبة القيمة المضافة ({rules.vat}%)</dt><dd className="num">{fmtSAR(service === 'geotech' ? Math.round(geoPrice * rules.vat) / 100 : vat)}</dd></div><div className="flex justify-between border-t border-ink-100 pt-2 text-[15px] font-bold"><dt>الإجمالي</dt><dd className="num text-brand-700">{fmtSAR(service === 'geotech' ? geoPrice + Math.round(geoPrice * rules.vat) / 100 : subtotal + vat)}</dd></div></dl>
              {contract?.payment === 'advance' && <Callout tone="warn" compact className="mt-3">دفع مقدّم — يُرسل الطلب للمختبر بعد سداد المقابل المالي.</Callout>}
              <ul className="mt-3 grid gap-1 text-[11.5px]">{[['العقد', !!contractId], ['الاختبارات', service === 'geotech' ? !!geoItem : tests.length > 0], ['المواعيد', slots.every(s => s.date >= minDate)], ['الموقع', !!location]].map(([l, ok]: any) => <li key={l} className="flex items-center gap-1.5">{ok ? <CheckCircle2 className="size-3.5 text-ok-500" /> : <AlertTriangle className="size-3.5 text-warn-500" />}{l}</li>)}</ul>
              <div className="mt-3 grid gap-2"><Button icon={service === 'geotech' ? ArrowLeft : Send} onClick={() => setConfirm('send')} disabled={errors.length > 0}>{service === 'geotech' ? 'التالي: البيانات الأولية للدراسة' : 'إرسال الطلب'}</Button><Button variant="secondary" icon={Save} onClick={() => setConfirm('draft')} disabled={!contractId}>حفظ كمسودة</Button><Button variant="ghost" onClick={() => nav('/requests')}>إلغاء</Button></div>
              <div className="mt-3 rounded-sm bg-ink-50 p-3"><div className="data-label mb-1.5">قواعد الطلب</div><ul className="grid gap-1 text-[11.5px] text-ink-600">{[`حتى ${rules.maxTestsPerRequest} اختبارات من تصنيف واحد`, `${rules.proposedSlots} نطاقات زمنية — أولها بعد ${rules.minLeadHours} ساعة على الأقل`, `يرد المختبر خلال ${rules.labDecisionHours} ساعة وإلا أُنهي الطلب`, 'لا تعديل بعد الإرسال — يمكن الإلغاء قبل قبول المختبر', 'يبدأ عداد SLA بعد تأكيدك استلام العينة'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></div>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={picker} onClose={() => setPicker(false)} title="اختيار الاختبارات" sub={`الاختبارات المتاحة ضمن ${contractId} — ${lab?.name}`} width="lg" footer={<Button onClick={() => setPicker(false)}>تأكيد الاختيار ({tests.length})</Button>}>
        {category && <Callout tone="info" compact className="mb-3">الطلب مقيّد بتصنيف {CATEGORY_LABEL[category]} — التصنيفات الأخرى معطّلة.</Callout>}
        <ul className="grid gap-1.5">{labCatalog.map(c => { const rt = refTests.find(x => x.id === c.refTestId)!; const locked = category && rt.category !== category; const added = tests.some(t => t.refTestId === c.refTestId); return (
          <li key={c.id} className={cx('flex items-center justify-between rounded-sm border px-3 py-2', locked ? 'border-ink-100 opacity-50' : 'border-ink-200')}>
            <div className="min-w-0"><div className="text-[13px] font-semibold">{rt.nameAr} <span className="meta">{rt.nameEn}</span></div><div className="mt-0.5 flex flex-wrap items-center gap-1.5 meta"><Tag>{CATEGORY_LABEL[rt.category]}</Tag>{c.methods.map(m => <Code key={m}>{m}</Code>)}<span>· SLA {c.sla} أيام</span>{locked && <Badge tone="warn" size="xs">تصنيف مختلف</Badge>}</div></div>
            <div className="flex items-center gap-2"><span className="num font-bold">{fmtSAR(c.basePrice)}</span>{added ? <Badge tone="ok">مضاف</Badge> : c.methods.length > 1 ? <Select className="h-8 w-40! text-[12px]" defaultValue="" onChange={e => { if (!e.target.value) return; setTests([...tests, { refTestId: c.refTestId, method: e.target.value, price: c.basePrice!, sla: c.sla! }]) }} disabled={!!locked}><option value="">اختر الطريقة…</option>{c.methods.map(m => <option key={m} value={m}>{m}</option>)}</Select> : <Button size="sm" variant="secondary" disabled={!!locked} onClick={() => setTests([...tests, { refTestId: c.refTestId, method: c.methods[0], price: c.basePrice!, sla: c.sla! }])}>إضافة</Button>}</div>
          </li>) })}</ul>
      </Modal>
      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'send' ? (service === 'geotech' ? 'المتابعة إلى البيانات الأولية' : 'تأكيد إرسال الطلب') : 'حفظ كمسودة'} width="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>إلغاء</Button><Button onClick={() => { setConfirm(null); confirm === 'send' ? doSend() : doDraft() }}>{confirm === 'send' ? (service === 'geotech' ? 'نعم، تابع' : 'نعم، أرسل الطلب') : 'نعم، احفظ'}</Button></>}>
        <p className="text-[13px] text-ink-700">{confirm === 'send' ? (service === 'geotech' ? 'سيُحفظ الطلب وتنتقل لتعبئة البيانات الأولية ورفع القرار المساحي قبل إرساله للمكتب الاستشاري.' : `سيُرسل الطلب إلى ${lab?.name} لاتخاذ قرار القبول خلال ${rules.labDecisionHours} ساعة. لا يمكن تعديل الطلب بعد إرساله.`) : 'سيُحفظ الطلب كمسودة ويمكنك إكماله وإرساله لاحقاً.'}</p>
      </Modal>
    </>
  )
}
