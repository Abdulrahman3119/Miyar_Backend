import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileUp, Send, Save, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader, PhaseStepper, FileTile, PlotMap } from '@/ds/composite'
import { Section, Field, Input, Select, Button, Callout, Chip, Badge, Modal, Card, KV } from '@/ds/primitives'
import type { Study } from '@/lib/types'

export default function StudyPrelim() {
  const { id } = useParams()
  const nav = useNavigate()
  const r = useStore(s => s.requests.find(x => x.id === id))
  const existing = useStore(s => s.studies.find(x => x.requestId === id))
  const siteConditions = useStore(s => s.masters.siteConditions)
  const buildingTypes = useStore(s => s.masters.buildingTypes)
  const structureTypes = useStore(s => s.masters.structureTypes)
  const foundationTypes = useStore(s => s.masters.foundationTypes)
  const submitRequest = useStore(s => s.submitRequest)
  const savePrelim = useStore(s => s.savePrelim)
  const [deed, setDeed] = useState<string | undefined>(existing?.prelim.deedFile)
  const [deedMeta, setDeedMeta] = useState<{ name: string; size: string } | undefined>(
    existing?.prelim.deedFile ? { name: existing.prelim.deedFile.split('/').pop() || 'القرار المساحي', size: '' } : undefined
  )
  const [p, setP] = useState<Study['prelim']>(existing?.prelim ?? { siteConditions: [], foundationType: 'unknown', priorInfo: false, neighbors: false })
  const [confirm, setConfirm] = useState(false)
  if (!r) return <Callout tone="danger">الطلب غير موجود.</Callout>
  const polygon = existing?.polygon?.length ? existing.polygon : []
  const ok = !!(p.parcel && p.owner && p.ownerId?.length === 10 && p.buildingType && p.structure && p.floors && p.builtArea && p.foundationDepth != null)
  const save = async (send: boolean) => {
    const id = await savePrelim(r.id, { prelim: { ...p, deedFile: deed }, polygon })
    if (!id) return
    if (send) {
      const newId = await submitRequest(r.id)
      if (!newId) return
      nav(`/requests/${newId}/study`)
    } else { useStore.getState().toast({ title: 'حُفظت البيانات الأولية', tone: 'ok' }); nav(`/requests/${r.id}`) }
  }
  return (
    <>
      <PageHeader crumbs={[{ label: 'طلبات الاختبارات', to: '/requests' }, { label: r.id, to: `/requests/${r.id}` }, { label: 'البيانات الأولية' }]} title="البيانات الأولية للدراسة الجيوتقنية" sub="الخطوة 2 من 2 — تُستخدم لتخطيط الأعمال الميدانية وتشغيل المحرك الذكي وتوليد التقرير (B.R.167)" meta={<Badge tone="info" size="xs">دراسة جيوتقنية · SBC 303</Badge>} />
      <div className="mb-3"><PhaseStepper current={1} /></div>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <Section title="القرار المساحي" icon={FileUp} desc="تُستخرج بيانات الموقع تلقائياً ويُبنى مضلع الأرض ويُتحقق من إغلاقه ومساحته (B.R.171)" bodyClass="p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]"><div><FileTile name={deedMeta?.name || (deed ? deed.split('/').pop() : undefined)} size={deedMeta?.size} doctype="Geotechnical Study" docname={existing?.id} fieldname="deed_file" accept=".pdf,.jpg,.jpeg,.png" onChange={f => { setDeed(f.file); setDeedMeta({ name: f.name, size: f.size }) }} onRemove={() => { setDeed(undefined); setDeedMeta(undefined) }} />{deed && <Callout tone="ok" compact className="mt-2">أدخل بيانات القرار المساحي أدناه كما في الوثيقة المرفقة.</Callout>}</div>{polygon.length >= 3 && <PlotMap polygon={polygon} pins={[]} height={150} />}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4"><Field label="رقم القطعة" required><Input value={p.parcel ?? ''} onChange={e => setP({ ...p, parcel: e.target.value })} /></Field><Field label="رقم المخطط"><Input value={p.plan ?? ''} onChange={e => setP({ ...p, plan: e.target.value })} /></Field><Field label="الحي"><Input value={p.district ?? ''} onChange={e => setP({ ...p, district: e.target.value })} /></Field><Field label="المدينة"><Input value={p.city ?? ''} onChange={e => setP({ ...p, city: e.target.value })} /></Field><Field label="رقم الصك"><Input value={p.deedNo ?? ''} onChange={e => setP({ ...p, deedNo: e.target.value })} className="ltr" /></Field><Field label="تاريخ إصدار الصك"><Input value={p.deedDate ?? ''} onChange={e => setP({ ...p, deedDate: e.target.value })} className="ltr" /></Field><Field label="المساحة (القرار)"><Input value={p.area ?? ''} onChange={e => setP({ ...p, area: e.target.value ? +e.target.value : undefined })} suffix="م²" className="ltr" /></Field><Field label="المساحة المحسوبة"><Input value={p.computedArea ?? ''} onChange={e => setP({ ...p, computedArea: e.target.value ? +e.target.value : undefined })} suffix="م²" className="ltr" /></Field></div>
          </Section>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="بيانات المالك" bodyClass="p-3"><div className="grid gap-3"><Field label="اسم المالك" required><Input value={p.owner ?? ''} onChange={e => setP({ ...p, owner: e.target.value })} /></Field><Field label="رقم الهوية الوطنية" required><Input value={p.ownerId ?? ''} onChange={e => setP({ ...p, ownerId: e.target.value.replace(/\D/g, '').slice(0, 10) })} className="ltr" /></Field><Field label="رقم رخصة البناء (إن وجدت)"><Input value={p.permitNo ?? ''} onChange={e => setP({ ...p, permitNo: e.target.value })} className="ltr" /></Field></div></Section>
            <Section title="عوامل الموقع" bodyClass="p-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="معلومات سابقة عن التربة"><Select value={p.priorInfo ? '1' : '0'} onChange={e => setP({ ...p, priorInfo: e.target.value === '1' })}><option value="0">لا</option><option value="1">نعم</option></Select></Field><Field label="مبانٍ مجاورة قريبة"><Select value={p.neighbors ? '1' : '0'} onChange={e => setP({ ...p, neighbors: e.target.value === '1' })}><option value="0">لا</option><option value="1">نعم</option></Select></Field></div><div className="mt-3"><div className="mb-1.5 text-[12px] font-semibold text-ink-700">ظروف الموقع</div><div className="flex flex-wrap gap-1.5">{siteConditions.map(c => <Chip key={c.code} active={p.siteConditions.includes(c.label)} onClick={() => setP({ ...p, siteConditions: p.siteConditions.includes(c.label) ? p.siteConditions.filter(x => x !== c.label) : [...p.siteConditions, c.label] })}>{c.label}</Chip>)}</div></div></Section>
          </div>
          <Section title="وصف المشروع" desc="المدخلات التي يعتمد عليها المحرك الذكي لتحديد عدد الجسات وأعماقها — SBC 303 Table 2.1" bodyClass="p-3">
            <div className="grid gap-3 sm:grid-cols-3"><Field label="نوع المنشأ" required><Select value={p.buildingType ?? ''} onChange={e => setP({ ...p, buildingType: e.target.value as any })}><option value="">اختر…</option>{buildingTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</Select></Field><Field label="نوع الهيكل الإنشائي" required><Select value={p.structure ?? ''} onChange={e => setP({ ...p, structure: e.target.value as any })}><option value="">اختر…</option>{structureTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</Select></Field><Field label="عدد الأدوار المتوقع" required hint="≥ 5 أدوار = دراسة خاصة وفق الكود"><Input type="number" min={1} value={p.floors ?? ''} onChange={e => setP({ ...p, floors: +e.target.value })} className="ltr" /></Field><Field label="المساحة المبنية المتوقعة" required hint="معيار الكود هو المساحة المبنية لا مساحة الأرض"><Input type="number" value={p.builtArea ?? ''} onChange={e => setP({ ...p, builtArea: +e.target.value })} suffix="م²" className="ltr" /></Field><Field label="نوع الأساسات المتوقع"><Select value={p.foundationType ?? 'unknown'} onChange={e => setP({ ...p, foundationType: e.target.value as any })}>{foundationTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</Select></Field><Field label="عمق التأسيس الأولي" required hint="يُقاس عمق الجسات من قاع الأساس"><Input type="number" step="0.5" value={p.foundationDepth ?? ''} onChange={e => setP({ ...p, foundationDepth: +e.target.value })} suffix="م" className="ltr" /></Field></div>
          </Section>
        </div>
        <div className="col-span-12 xl:col-span-4 xl:sticky xl:top-4 xl:self-start"><Card pad={false}><div className="border-b border-ink-200 px-4 py-2.5"><h3 className="section-title">جاهزية الإرسال</h3></div><div className="p-4"><ul className="grid gap-1.5 text-[12.5px]">{[['القرار المساحي', !!deed], ['رقم القطعة', !!p.parcel], ['بيانات المالك', !!(p.owner && p.ownerId?.length === 10)], ['وصف المشروع', !!(p.buildingType && p.structure && p.floors && p.builtArea)], ['عمق التأسيس', p.foundationDepth != null]].map(([l, v]: any) => <li key={l} className="flex items-center gap-2">{v ? <CheckCircle2 className="size-4 text-ok-500" /> : <AlertTriangle className="size-4 text-warn-500" />}{l}</li>)}</ul>{p.floors && p.floors >= 5 && <Callout tone="warn" compact className="mt-3">≥ 5 أدوار: سيُخرج المحرك الذكي "دراسة خاصة" ويترك عدد الجسات لقرار الاستشاري.</Callout>}{p.floors && p.builtArea && <div className="mt-3 rounded-sm bg-ink-50 p-2.5"><KV cols={1} dense items={[{ k: 'تقدير المحرك (قبل الاعتماد)', v: `${p.builtArea < 600 ? 3 : Math.min(10, 3 + Math.ceil((p.builtArea - 600) / 700))} جسات · ${(p.floors ?? 2) <= 2 ? (p.builtArea < 600 ? '4–6' : '5–8') : (p.builtArea < 600 ? '6–9' : '8–12')} م من قاع الأساس` }, { k: 'المرجع', v: 'SBC 303 — الفصل 2، Table 2.1' }]} /></div>}<div className="mt-4 grid gap-2"><Button icon={Send} disabled={!ok} onClick={() => setConfirm(true)}>إرسال الطلب للمكتب الاستشاري</Button><Button variant="secondary" icon={Save} onClick={() => save(false)}>حفظ كمسودة</Button><Button variant="ghost" onClick={() => nav(`/requests/new/${r.id}`)}>السابق</Button></div></div></Card></div>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="إرسال الطلب" width="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>تراجع</Button><Button onClick={() => save(true)}>نعم، أرسل</Button></>}><p className="text-[13px]">سيُرسل الطلب إلى المكتب الاستشاري المشرف لمراجعة البيانات الأولية واعتماد خطة الاستكشاف، ثم يُحال إلى المختبر. لا يمكن تعديل الطلب بعد الإرسال.</p></Modal>
    </>
  )
}
