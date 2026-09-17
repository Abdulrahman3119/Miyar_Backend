import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Search, MapPin, Building2, FileSignature, FlaskConical, Ruler, HardHat, Phone, Mail, Globe, ShieldCheck, Star, LogIn, Users, CalendarClock, LayoutGrid, List as ListIcon } from 'lucide-react'
import { useStore, useSel } from '@/lib/store'
import { PageHeader } from '@/ds/composite'
import { Input, Select, Chip, Card, Badge, Stars, Button, ButtonLink, Section, KV, Code, Tag, Field, Textarea, Callout, Modal, Kpi, Segmented, Table, Th, Td, Checkbox, cx } from '@/ds/primitives'
import { MiyarLogo, MomrahLogo, IdoLogo } from '@/ds/Logo'
import { CATEGORY_LABEL, CITY_COORD } from '@/lib/lookups'
import { GeoMap } from '@/ds/evidence'
import { RequestQuoteModal } from '@/features/contracts/Quotes'
import { fmtSAR, fmtDate } from '@/lib/format'
import type { EntityType } from '@/lib/types'
import { pickAndUpload, fileUrl } from '@/lib/files'

const TYPE_LABEL: Record<string, string> = { lab: 'مختبر معتمد', contractor: 'مقاول', consultant: 'مكتب استشاري' }
const TYPE_ICON: Record<string, any> = { lab: FlaskConical, contractor: HardHat, consultant: Ruler }

const PublicFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-canvas">
    <header className="flex h-14 items-center justify-between bg-brand-800 px-4 text-white lg:px-8"><MiyarLogo size="sm" onDark /><div className="flex items-center gap-3"><span className="rounded-md bg-white px-2 py-1"><MomrahLogo height={24} /></span><ButtonLink to="/login" variant="secondary" size="sm" icon={LogIn}>تسجيل الدخول</ButtonLink></div></header>
    <div className="border-b border-warn-200 bg-warn-50 px-4 py-1.5 text-center text-[12px] text-warn-800 lg:px-8">أنت تتصفح الدليل العام كزائر (B.R.122) — <Link to="/login" className="font-semibold underline">سجّل الدخول</Link> لعرض لوحتك والقائمة الجانبية وإنشاء الطلبات.</div>
    <div className="mx-auto max-w-[1440px] px-4 py-4 lg:px-8">{children}</div>
    <footer className="mx-auto flex max-w-[1440px] items-center justify-between px-8 pb-4 text-[11px] text-ink-500"><span>© 2026 الإدارة العامة لكود البناء السعودي — وزارة البلديات والإسكان</span><span className="flex items-center gap-1.5">نُفّذ بواسطة <IdoLogo height={14} /></span></footer>
  </div>
)

/** Public directory — available to visitors without login (B.R.122) */
export default function Directory() {
  const user = useStore(s => s.user)
  const orgs = useSel(s => s.orgs.filter(o => ['lab', 'contractor', 'consultant'].includes(o.type) && o.active))
  const catalog = useStore(s => s.catalog)
  const hasPublishedCatalog = (labId: string) => catalog.some(c => c.labId === labId && c.status === 'STS01')
  const [type, setType] = useState<'all' | EntityType>('all')
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [spec, setSpec] = useState('')
  const [sort, setSort] = useState<'rating' | 'reviews' | 'onTime'>('rating')
  const [minRating, setMinRating] = useState(0)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const list = useMemo(() => orgs.filter(o => (type === 'all' || o.type === type) && (!city || o.city === city) && (!spec || o.specialties.includes(spec)) && (o.type !== 'lab' || o.rating >= minRating) && (!q || o.name.includes(q) || o.specialties.some(s => s.includes(q)))).sort((a, b) => sort === 'rating' ? (b.rating - a.rating || b.reviews - a.reviews) : sort === 'reviews' ? b.reviews - a.reviews : (b.onTime ?? 0) - (a.onTime ?? 0)), [orgs, type, q, city, spec, sort, minRating])
  const count = (t: EntityType) => orgs.filter(o => o.type === t).length
  const labs = orgs.filter(o => o.type === 'lab')

  const body = (
    <>
      <PageHeader title="دليل المنشآت" sub="المختبرات والمقاولون والمكاتب الاستشارية المعتمدة في المنصة — الترتيب بمتوسط التقييم ثم عدد المراجعات (B.R.124)" actions={<Segmented value={view} onChange={setView} items={[{ value: 'grid', label: <LayoutGrid className="size-3.5" /> }, { value: 'list', label: <ListIcon className="size-3.5" /> }]} />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="مختبرات معتمدة" value={count('lab')} hint={`${labs.filter(l => l.saac).length} باعتماد ISO/IEC 17025`} icon={FlaskConical} />
        <Kpi label="مقاولون" value={count('contractor')} icon={HardHat} />
        <Kpi label="مكاتب استشارية" value={count('consultant')} icon={Ruler} />
        <Kpi label="متوسط تقييم المختبرات" value={(labs.reduce((a, l) => a + l.rating, 0) / Math.max(1, labs.length)).toFixed(1)} unit="/ 5" hint={`${labs.reduce((a, l) => a + l.reviews, 0)} تقييماً`} icon={Star} tone="warn" />
      </div>
      <div className="card mt-3 flex flex-wrap items-center gap-2 p-2.5">
        <div className="w-56 max-w-full"><Input prefixIcon={Search} value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث باسم المنشأة أو التخصص…" className="h-8" /></div>
        <Chip active={type === 'all'} onClick={() => setType('all')} count={orgs.length}>الكل</Chip><Chip active={type === 'lab'} onClick={() => setType('lab')} count={count('lab')}>مختبرات</Chip><Chip active={type === 'contractor'} onClick={() => setType('contractor')} count={count('contractor')}>مقاولون</Chip><Chip active={type === 'consultant'} onClick={() => setType('consultant')} count={count('consultant')}>استشاريون</Chip>
        <span className="mx-1 h-5 w-px bg-ink-200" />
        <Select value={city} onChange={e => setCity(e.target.value)} className="h-8 w-32! text-[12px]"><option value="">جميع المدن</option>{[...new Set(orgs.map(o => o.city))].map(c => <option key={c}>{c}</option>)}</Select>
        <Select value={spec} onChange={e => setSpec(e.target.value)} className="h-8 w-36! text-[12px]"><option value="">جميع التخصصات</option>{[...new Set(orgs.flatMap(o => o.specialties))].map(c => <option key={c}>{c}</option>)}</Select>
        <Select value={minRating} onChange={e => setMinRating(+e.target.value)} className="h-8 w-32! text-[12px]"><option value={0}>كل التقييمات</option><option value={4.5}>★ 4.5 فأعلى</option><option value={4}>★ 4 فأعلى</option><option value={3}>★ 3 فأعلى</option></Select>
        <Select value={sort} onChange={e => setSort(e.target.value as any)} className="ms-auto h-8 w-40! text-[12px]"><option value="rating">الترتيب: الأعلى تقييماً</option><option value="reviews">الأكثر مراجعات</option><option value="onTime">الأعلى التزاماً بالمواعيد</option></Select>
      </div>
      {view === 'grid' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(o => { const I = TYPE_ICON[o.type]; return (
            <Link key={o.id} to={`/directory/${o.id}`} className="group"><Card className="relative flex h-full flex-col transition-shadow hover:shadow-elev">
              {o.featured && <span className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-warn-500 px-2 py-0.5 text-[10.5px] font-bold text-white"><Star className="size-3" />مميز</span>}
              <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><I className="size-5" /></span><div className="min-w-0"><div className="truncate text-[14px] font-bold group-hover:text-brand-700">{o.name}</div><div className="meta flex items-center gap-1"><I className="size-3" />{TYPE_LABEL[o.type]} · <MapPin className="size-3" />{o.city}</div></div></div>
              <div className="mt-2 flex items-center gap-2 text-[12px]">{o.type === 'lab' ? <><Stars value={o.rating} /><span className="num font-bold">{o.rating.toFixed(1)}</span><span className="meta">({o.reviews} تقييم)</span><span className="ms-auto num text-ink-600">التزام <b>{o.onTime}%</b></span></> : <span className="meta">منذ {o.since} · {o.employees} موظفاً</span>}</div>
              <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-600">{o.about}</p>
              <div className="mt-2 flex flex-wrap gap-1">{o.specialties.map(s => <Tag key={s}>{s}</Tag>)}{o.saac && <Badge tone="ok" size="xs"><ShieldCheck className="size-3" />ISO 17025</Badge>}{o.type === 'lab' && !hasPublishedCatalog(o.id) && <Badge tone="warn" size="xs">بدون قائمة اختبارات منشورة</Badge>}</div>
              <div className="mt-auto grid grid-cols-3 gap-1 border-t border-ink-100 pt-2.5 text-center">{o.kpis.slice(0, 3).map(k => <div key={k.label}><div className="num text-[14px] font-bold text-brand-700">{k.value}</div><div className="text-[10.5px] text-ink-500">{k.label}</div></div>)}</div>
            </Card></Link>) })}
        </div>
      ) : (
        <Table className="mt-3"><thead><tr><Th>المنشأة</Th><Th>النوع</Th><Th>المدينة</Th><Th>التخصصات</Th><Th>التقييم</Th><Th>الالتزام</Th><Th>الاعتماد</Th><Th>منذ</Th></tr></thead><tbody>{list.map(o => <tr key={o.id} className="hover:bg-ink-50"><Td><Link to={`/directory/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.name}</Link></Td><Td><Tag>{TYPE_LABEL[o.type]}</Tag></Td><Td>{o.city}</Td><Td className="text-[12px]">{o.specialties.join('، ')}</Td><Td>{o.type === 'lab' ? <span className="num">★ {o.rating.toFixed(1)} <span className="meta">({o.reviews})</span></span> : '—'}</Td><Td className="num">{o.onTime ? `${o.onTime}%` : '—'}</Td><Td>{o.saac ? <Badge tone="ok" size="xs">ISO 17025</Badge> : <span className="meta">—</span>}</Td><Td className="num">{o.since}</Td></tr>)}</tbody></Table>
      )}
    </>
  )
  return user ? body : <PublicFrame>{body}</PublicFrame>
}

export function OrgProfile() {
  const { id } = useParams()
  const user = useStore(s => s.user)
  const o = useStore(s => s.orgs.find(x => x.id === id))
  const catalog = useSel(s => s.catalog.filter(c => c.labId === id && c.status === 'STS01'))
  const refTests = useStore(s => s.refTests)
  const ratings = useSel(s => s.ratings.filter(r => r.labId === id && r.status === 'STS06'))
  const orgs = useStore(s => s.orgs)
  const contracts = useStore(s => s.contracts)
  const requests = useStore(s => s.requests)
  const [rate, setRate] = useState(false)
  const [quote, setQuote] = useState(false)
  if (!o) return <Callout tone="danger">المنشأة غير موجودة.</Callout>
  const I = TYPE_ICON[o.type]
  const byCat = Object.entries(catalog.reduce<Record<string, typeof catalog>>((a, c) => { const cat = refTests.find(t => t.id === c.refTestId)!.category; (a[cat] ??= []).push(c); return a }, {}))
  const endedContract = user?.role === 'contractor' && contracts.find(c => c.contractorId === user.orgId && c.labId === o.id && !c.active)
  const canRate = !!endedContract && !ratings.some(r => r.contractId === endedContract.id && r.contractorId === user!.orgId)
  const mine = requests.filter(r => r.labId === o.id || r.contractorId === o.id || r.consultantId === o.id)
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: ratings.filter(r => Math.round((r.quality + r.punctuality + r.communication) / 3) === n).length }))

  const body = (
    <>
      <PageHeader crumbs={[{ label: 'دليل المنشآت', to: '/directory' }, { label: o.name }]} title={<span className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-md bg-brand-50 text-brand-700"><I className="size-6" /></span>{o.name}</span>} sub={`${TYPE_LABEL[o.type]} · ${o.city}، ${o.region} · السجل التجاري ${o.cr}${o.license ? ` · الرخصة ${o.license}` : ''} · منذ ${o.since}`}
        meta={o.type === 'lab' ? <><Stars value={o.rating} /><span className="num text-[13px] font-bold">{o.rating.toFixed(1)}</span><span className="meta">({o.reviews} تقييم)</span>{o.saac && <Badge tone="ok" size="xs"><ShieldCheck className="size-3" />معتمد ISO/IEC 17025 — {o.saac.number}</Badge>}{o.featured && <Badge tone="warn" size="xs">مميز</Badge>}</> : undefined}
        actions={o.type === 'lab' && user?.role === 'contractor' && <><Button icon={Star} variant="secondary" disabled={!canRate} onClick={() => setRate(true)}>{canRate ? 'تقييم المختبر' : 'لا يوجد عقد منتهٍ قابل للتقييم'}</Button><Button icon={FileSignature} onClick={() => setQuote(true)}>طلب عرض سعر</Button></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">{o.kpis.map(k => <Kpi key={k.label} label={k.label} value={k.value} />)}<Kpi label="طلبات في المنصة" value={mine.length} hint={`${mine.filter(r => r.status === 'STS15').length} مكتمل`} /><Kpi label="الموظفون" value={o.employees ?? '—'} icon={Users} />{o.type === 'lab' && <Kpi label="الاعتمادات التلقائية" value={o.autoApprovals ?? 0} tone={(o.autoApprovals ?? 0) > 2 ? 'warn' : 'ok'} hint="مؤشر استجابة الاستشاري" />}</div>
      <div className="mt-3 grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <Card><p className="text-[13px] leading-relaxed text-ink-700">{o.about}</p><div className="mt-2 flex flex-wrap gap-1">{o.specialties.map(s => <Tag key={s}>{s}</Tag>)}</div></Card>
          {o.type === 'lab' && <Section title="قائمة الاختبارات والأسعار الأساسية" icon={FlaskConical} desc="الأسعار مرجعية — السعر النهائي في عرض السعر" bodyClass="p-0">
            {byCat.map(([cat, items]) => <div key={cat}><div className="bg-ink-50 px-3 py-1.5 text-[11.5px] font-bold text-ink-600">{CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]} <span className="meta">({items.length})</span></div><table className="w-full text-[12.5px]"><tbody>{items.map(c => { const rt = refTests.find(t => t.id === c.refTestId)!; return <tr key={c.id} className="border-t border-ink-100"><td className="px-3 py-1.5 font-medium">{rt.nameAr}<div className="meta">{rt.nameEn}</div></td><td className="px-3"><div className="flex flex-wrap gap-1">{c.methods.map(m => <Code key={m}>{m}</Code>)}</div></td><td className="px-3 meta">SLA {c.sla} أيام</td><td className="px-3"><Tag>{c.unit}</Tag></td><td className="num px-3 text-end font-bold text-brand-700">{fmtSAR(c.basePrice)}</td></tr> })}</tbody></table></div>)}
          </Section>}
          {o.type === 'lab' && <Section title="التقييمات والمراجعات" icon={Star} bodyClass="p-3">
            <div className="mb-3 grid grid-cols-[auto_1fr] gap-4"><div className="text-center"><div className="num text-4xl font-bold">{o.rating.toFixed(1)}</div><Stars value={o.rating} /><div className="meta">{o.reviews} تقييم</div></div><ul className="grid content-center gap-1">{dist.map(d => <li key={d.n} className="flex items-center gap-2 text-[11.5px]"><span className="num w-4">{d.n}★</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100"><div className="h-full bg-warn-500" style={{ width: `${(d.c / Math.max(1, ratings.length)) * 100}%` }} /></div><span className="num w-5 text-ink-500">{d.c}</span></li>)}</ul></div>
            <ul className="grid gap-2 md:grid-cols-2">{ratings.slice(0, 6).map(r => <li key={r.id} className="rounded-sm border border-ink-100 p-2.5"><div className="flex items-center justify-between text-[11.5px]"><span className="font-semibold">{orgs.find(x => x.id === r.contractorId)?.name}</span><span className="meta">{fmtDate(r.createdAt)}</span></div><div className="mt-1 flex flex-wrap gap-2 text-[11px] text-ink-500"><span>الجودة <Stars value={r.quality} /></span><span>المواعيد <Stars value={r.punctuality} /></span><span>التواصل <Stars value={r.communication} /></span></div>{r.comment && <p className="mt-1 text-[12px] text-ink-700">{r.comment}</p>}</li>)}</ul>
          </Section>}
          {o.type !== 'lab' && <Section title="النشاط في المنصة" bodyClass="p-3"><KV cols={3} items={[{ k: 'عقود فعّالة', v: contracts.filter(c => (c.contractorId === o.id || c.consultantId === o.id) && c.active).length }, { k: 'طلبات هذا العام', v: mine.length }, { k: 'المختبرات المتعامل معها', v: [...new Set(mine.map(r => r.labId))].length }]} /></Section>}
        </div>
        <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
          <Section title="بيانات التواصل" icon={Phone} bodyClass="p-3"><ul className="grid gap-2 text-[12.5px]"><li className="flex items-center gap-2"><Phone className="size-4 text-ink-400" /><span className="ltr">{o.phone}</span></li><li className="flex items-center gap-2"><Mail className="size-4 text-ink-400" /><span className="ltr">{o.email}</span></li>{o.website && <li className="flex items-center gap-2"><Globe className="size-4 text-ink-400" /><span className="ltr">{o.website}</span></li>}<li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-ink-400" />{o.address}</li></ul></Section>
          <Section title="الموقع" icon={MapPin} bodyClass="p-2"><GeoMap center={CITY_COORD[o.city]} zoom={12} pins={CITY_COORD[o.city] ? [{ lat: CITY_COORD[o.city][0], lng: CITY_COORD[o.city][1], label: o.name, tone: 'brand', sub: o.address }] : []} height={170} /></Section>
          {o.saac && <Section title="الاعتماد" icon={ShieldCheck} bodyClass="p-3"><KV cols={1} dense items={[{ k: 'المركز السعودي للاعتماد', v: o.saac.number }, { k: 'النطاق', v: o.saac.scope }, { k: 'ساري حتى', v: <span className={cx('num', new Date(o.saac.expires).getTime() - Date.now() < 120 * 864e5 && 'text-warn-600')}>{o.saac.expires}</span> }, { k: 'الرخصة البلدية', v: o.license }]} /></Section>}
          <Section title="مؤشرات الأداء" icon={CalendarClock} bodyClass="p-3"><KV cols={2} dense items={[{ k: 'الالتزام بالمواعيد', v: o.onTime ? `${o.onTime}%` : '—' }, { k: 'متوسط SLA', v: '4.2 أيام' }, { k: 'الطلبات المرفوضة', v: mine.filter(r => r.status === 'STS13').length }, { k: 'الاعتمادات التلقائية', v: o.autoApprovals ?? '—' }]} /></Section>
        </div>
      </div>
      {rate && endedContract && <RateModal labId={o.id} contractId={endedContract.id} onClose={() => setRate(false)} />}
      {quote && <RequestQuoteModal lab={o} onClose={() => setQuote(false)} />}
    </>
  )
  return user ? body : <PublicFrame>{body}</PublicFrame>
}

function RateModal({ labId, contractId, onClose }: { labId: string; contractId: string; onClose: () => void }) {
  const user = useStore(s => s.user)!
  const add = useStore(s => s.addRating)
  const [q, setQ] = useState(0); const [p, setP] = useState(0); const [c, setC] = useState(0); const [comment, setComment] = useState('')
  const ok = q && p && c
  return (
    <Modal open onClose={onClose} title="تقييم المختبر" sub={`العقد ${contractId} — مرة واحدة لكل عقد`} width="md" footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button disabled={!ok} onClick={() => { add({ labId, contractId, contractorId: user.orgId, quality: q, punctuality: p, communication: c, comment }); onClose(); useStore.getState().toast({ title: 'شكراً لتقييمك', body: 'تحدّث ترتيب الدليل — ويمكنك الآن تحميل شهادة الإتمام.', tone: 'ok' }) }}>إرسال التقييم</Button></>}>
      <Callout tone="info" compact className="mb-3">التقييم مطلوب قبل تحميل شهادة إتمام الاختبارات (B.R.127). يُنشر باسم منشأتك ويخضع لمراجعة مدير النظام في الحالات الخاصة.</Callout>
      <div className="grid gap-3">{[['جودة نتائج الاختبارات', q, setQ], ['الالتزام بالمواعيد', p, setP], ['التواصل والاستجابة', c, setC]].map(([l, v, set]: any) => <div key={l} className="flex items-center justify-between rounded-sm border border-ink-100 px-3 py-2"><span className="text-[13px] font-semibold">{l}</span><Stars value={v} onChange={set} size="lg" /></div>)}<Field label="ملاحظات (اختياري)"><Textarea value={comment} onChange={e => setComment(e.target.value)} /></Field></div>
    </Modal>
  )
}

export function ProfileManage() {
  const user = useStore(s => s.user)!
  const o = useStore(s => s.orgs.find(x => x.id === user.orgId))!
  const update = useStore(s => s.updateOrg)
  const users = useSel(s => s.users.filter(u => u.orgId === user.orgId))
  const addEmployee = useStore(s => s.addEmployee); const setEmployeeDelegate = useStore(s => s.setEmployeeDelegate)
  const isPrincipal = user.position === 'principal'
  const [addEmp, setAddEmp] = useState(false); const [emp, setEmp] = useState({ name: '', mobile: '', canDelegate: false })
  const [f, setF] = useState({ name: o.name, city: o.city, about: o.about, specialties: o.specialties.join('، '), phone: o.phone, email: o.email, website: o.website ?? '', address: o.address, logo: o.logo })
  const [logoBusy, setLogoBusy] = useState(false)
  const I = TYPE_ICON[o.type] ?? Building2
  const uploadLogo = async () => {
    if (logoBusy) return
    setLogoBusy(true)
    try {
      const [up] = await pickAndUpload({ doctype: 'Organization', docname: o.id, fieldname: 'logo', accept: '.png,.jpg,.jpeg,.svg,.webp', maxMb: 2, isPrivate: false })
      if (up) {
        setF(prev => ({ ...prev, logo: up.file }))
        await update(o.id, { logo: up.file })
        useStore.getState().toast({ title: 'تم رفع الشعار', body: up.name, tone: 'ok' })
      }
    } catch (e: any) {
      useStore.getState().toast({ title: 'تعذّر رفع الشعار', body: e?.message, tone: 'danger' })
    } finally { setLogoBusy(false) }
  }
  return (
    <>
      <PageHeader title="الملف التعريفي للمنشأة" sub="البيانات الظاهرة في دليل المنشآت — تنعكس فوراً عند الحفظ (B.R.126، B.R.131)" />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <Section title="الهوية والبيانات الأساسية" bodyClass="p-3"><div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]"><button type="button" onClick={uploadLogo} disabled={logoBusy} title="رفع الشعار" className="relative grid size-20 place-items-center overflow-hidden rounded-md border border-dashed border-ink-300 bg-ink-25 text-brand-700 hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60">{f.logo ? <img src={fileUrl(f.logo)} alt="" className="size-full object-contain p-1" /> : <><I className="size-7" /><span className="mt-0.5 text-[10px] text-ink-500">{logoBusy ? 'جاري الرفع…' : 'رفع الشعار'}</span></>}</button><Field label="اسم المنشأة" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field><Field label="المدينة" required><Select value={f.city} onChange={e => setF({ ...f, city: e.target.value })}>{['الرياض', 'جدة', 'الدمام', 'مكة المكرمة', 'المدينة المنورة', 'القصيم', 'تبوك'].map(c => <option key={c}>{c}</option>)}</Select></Field></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="النبذة التعريفية" required hint="حد أقصى 300 حرف"><Textarea value={f.about} maxLength={300} onChange={e => setF({ ...f, about: e.target.value })} className="min-h-20" /></Field><Field label="التخصصات" required hint="افصل بينها بفاصلة"><Input value={f.specialties} onChange={e => setF({ ...f, specialties: e.target.value })} /></Field></div></Section>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="بيانات التواصل" bodyClass="p-3"><div className="grid gap-3"><Field label="رقم الجوال" required><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} className="ltr" /></Field><Field label="البريد الإلكتروني" required><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="ltr" /></Field><Field label="الموقع الإلكتروني"><Input value={f.website} onChange={e => setF({ ...f, website: e.target.value })} className="ltr" /></Field><Field label="العنوان التفصيلي" required><Input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field></div></Section>
            <Section title="المستخدمون في المنشأة" icon={Users} desc={`${users.length}`} bodyClass="p-0" actions={isPrincipal && <Button size="xs" variant="secondary" onClick={() => setAddEmp(true)}>إضافة موظف</Button>}><table className="w-full text-[12.5px]"><tbody>{users.map(u => <tr key={u.id} className="border-b border-ink-100 last:border-0"><td className="whitespace-nowrap px-3 py-2 font-medium">{u.name}</td><td className="whitespace-nowrap px-2 meta">{u.position === 'principal' ? 'المفوّض الرئيسي' : 'موظف'}</td><td className="ltr px-2 meta text-start">{u.mobile}</td><td className="px-2 text-end">{u.position === 'principal' ? <Badge tone="ok" size="xs">صلاحية تفويض</Badge> : isPrincipal ? <button type="button" onClick={() => setEmployeeDelegate(u.id, !u.canDelegate)} className={cx('rounded-full border px-2 py-px text-[10.5px] font-semibold', u.canDelegate ? 'border-ok-200 bg-ok-50 text-ok-700' : 'border-ink-200 text-ink-500 hover:bg-ink-50')}>{u.canDelegate ? 'صلاحية تفويض ✓' : 'منح صلاحية تفويض'}</button> : u.canDelegate && <Badge tone="ok" size="xs">صلاحية تفويض</Badge>}</td></tr>)}</tbody></table>
              <Modal open={addEmp} onClose={() => setAddEmp(false)} title="إضافة موظف للمنشأة" sub="يصله رمز تفعيل على الجوال ويرى فقط ما يُفوَّض له" width="sm" footer={<><Button variant="secondary" onClick={() => setAddEmp(false)}>إلغاء</Button><Button disabled={!emp.name || !/^05\d{8}$/.test(emp.mobile)} onClick={() => { addEmployee(emp.name, emp.mobile, emp.canDelegate); setAddEmp(false); setEmp({ name: '', mobile: '', canDelegate: false }) }}>إضافة</Button></>}>
                <div className="grid gap-3"><Field label="الاسم" required><Input value={emp.name} onChange={e => setEmp({ ...emp, name: e.target.value })} /></Field><Field label="رقم الجوال" required hint="05xxxxxxxx"><Input value={emp.mobile} onChange={e => setEmp({ ...emp, mobile: e.target.value })} className="ltr text-start" /></Field><Checkbox checked={emp.canDelegate} onChange={v => setEmp({ ...emp, canDelegate: v })} label="منحه صلاحية تفويض المهام لزملائه" /></div>
              </Modal></Section>
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setF({ name: o.name, city: o.city, about: o.about, specialties: o.specialties.join('، '), phone: o.phone, email: o.email, website: o.website ?? '', address: o.address, logo: o.logo })}>استعادة</Button><Button onClick={() => { update(o.id, { ...f, specialties: f.specialties.split(/[،,]/).map(s => s.trim()).filter(Boolean) }); useStore.getState().toast({ title: 'حُفظ الملف التعريفي', body: 'انعكست التغييرات في الدليل.', tone: 'ok' }) }}>حفظ التعديلات</Button></div>
        </div>
        <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
          <div><div className="data-label mb-1.5">معاينة البطاقة في الدليل</div><Card><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-md bg-brand-50 text-brand-700"><I className="size-5" /></span><div><div className="text-[14px] font-bold">{f.name}</div><div className="meta">{TYPE_LABEL[o.type]} · {f.city}</div>{o.type === 'lab' && <div className="mt-1 flex items-center gap-1 text-[12px]"><Stars value={o.rating} /><span className="num font-bold">{o.rating.toFixed(1)}</span><span className="meta">({o.reviews})</span></div>}</div></div><p className="mt-2 line-clamp-2 text-[12px] text-ink-600">{f.about}</p><div className="mt-2 flex flex-wrap gap-1">{f.specialties.split(/[،,]/).filter(Boolean).map(s => <Tag key={s}>{s.trim()}</Tag>)}{o.saac && <Badge tone="ok" size="xs">ISO 17025</Badge>}</div></Card></div>
          <Section title="السجل والاعتماد" bodyClass="p-3"><KV cols={1} dense items={[{ k: 'السجل التجاري', v: <span className="ltr">{o.cr}</span> }, { k: 'الرخصة البلدية', v: o.license ?? '—' }, { k: 'اعتماد SAAC', v: o.saac ? `${o.saac.number} — حتى ${o.saac.expires}` : 'غير معتمد' }, { k: 'حالة الحساب', v: <Badge tone="ok" size="xs">فعّال · ظاهر في الدليل</Badge> }]} /><Callout tone="info" compact className="mt-3">السجل التجاري والاعتماد يُحدَّثان عبر الدعم التقني بمستندات معتمدة.</Callout></Section>
        </div>
      </div>
    </>
  )
}
