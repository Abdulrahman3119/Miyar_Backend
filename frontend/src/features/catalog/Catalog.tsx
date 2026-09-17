import { useMemo, useState } from 'react'
import { Plus, Pencil, Ban, CheckCircle2, AlertTriangle, ListChecks, Search, TrendingUp } from 'lucide-react'
import { useStore, useSel } from '@/lib/store'
import { PageHeader } from '@/ds/composite'
import { Kpi, StatusPill, Input, Select, Button, Callout, Code, Tag, Modal, Field, Checkbox, cx, Badge, Section } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { RankBars } from '@/ds/charts'
import { CATEGORY_LABEL } from '@/lib/lookups'
import type { CatalogItem, Unit } from '@/lib/types'
import { fmtSAR, uid } from '@/lib/format'

export default function Catalog() {
  const user = useStore(s => s.user)!
  const refTests = useStore(s => s.refTests)
  const items = useSel(s => s.catalog.filter(c => c.labId === user.orgId))
  const requests = useStore(s => s.requests)
  const upsert = useStore(s => s.upsertCatalog)
  const toggle = useStore(s => s.toggleCatalog)
  const canManage = useStore(s => s.can)('catalog.manage') // matrix #2–6 — المفوّض الرئيسي للمختبر فقط
  const [edit, setEdit] = useState<CatalogItem | null>(null)
  const [add, setAdd] = useState(false)
  const count = (s: string) => items.filter(c => c.status === s).length
  const demand = useMemo(() => { const m: Record<string, number> = {}; requests.filter(r => r.labId === user.orgId).forEach(r => r.tests.forEach(t => { m[t.refTestId] = (m[t.refTestId] ?? 0) + 1 })); return m }, [requests])
  const top = Object.entries(demand).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ name: refTests.find(t => t.id === k)?.nameAr ?? k, value: v }))
  const revenue = (id: string) => requests.filter(r => r.labId === user.orgId).flatMap(r => r.tests).filter(t => t.refTestId === id).reduce((a, t) => a + t.price, 0)

  const cols: Column<CatalogItem>[] = [
    { key: 'name', header: 'الاختبار', width: '230px', sortValue: c => refTests.find(t => t.id === c.refTestId)!.nameAr, exportValue: c => refTests.find(t => t.id === c.refTestId)!.nameAr, cell: c => { const rt = refTests.find(t => t.id === c.refTestId)!; return <div className="whitespace-nowrap"><div className={cx('font-semibold', c.status === 'STS02' ? 'text-ink-400' : 'text-ink-900')}>{rt.nameAr}</div><div className="meta">{rt.nameEn}</div></div> } },
    { key: 'cat', header: 'التصنيف', width: '110px', sortValue: c => refTests.find(t => t.id === c.refTestId)!.category, cell: c => <Tag>{CATEGORY_LABEL[refTests.find(t => t.id === c.refTestId)!.category].replace('اختبارات ', '')}</Tag> },
    { key: 'unit', header: 'الوحدة', width: '80px', cell: c => c.unit ? <Tag>{c.unit}</Tag> : <span className="meta text-warn-600">— غير محدد</span> },
    { key: 'methods', header: 'طرق التنفيذ', cell: c => <div className="flex flex-wrap gap-1">{c.methods.length ? c.methods.map(m => <Code key={m} className="whitespace-nowrap">{m}</Code>) : <span className="meta text-warn-600">— غير محدد</span>}</div> },
    { key: 'sla', header: 'SLA', width: '80px', sortValue: c => c.sla ?? 0, cell: c => <span className="num whitespace-nowrap">{c.sla ? `${c.sla} أيام` : '—'}</span> },
    { key: 'price', header: 'السعر الأساسي', width: '110px', align: 'end', sortValue: c => c.basePrice ?? 0, exportValue: c => c.basePrice ?? '', cell: c => c.basePrice ? <span className="num whitespace-nowrap font-bold">{fmtSAR(c.basePrice)}</span> : <span className="meta text-warn-600">— غير محدد</span> },
    { key: 'demand', header: 'الطلب (12 شهراً)', width: '130px', sortValue: c => demand[c.refTestId] ?? 0, cell: c => <div className="whitespace-nowrap"><span className="num font-semibold">{demand[c.refTestId] ?? 0}</span> <span className="meta">طلباً</span><div className="meta num">{fmtSAR(revenue(c.refTestId))}</div></div> },
    { key: 'status', header: 'الحالة', width: '120px', sortValue: c => c.status, cell: c => <StatusPill code={c.status} size="xs" /> },
    { key: 'act', header: '', width: '130px', hideable: false, cell: c => !canManage ? <span className="meta">للاطلاع</span> : <div className="flex gap-1 whitespace-nowrap"><Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEdit(c)}>تعديل</Button>{c.status === 'STS01' && <Button size="xs" variant="ghost" icon={Ban} className="text-danger-600" onClick={() => toggle(c.id)}>إيقاف</Button>}{c.status === 'STS02' && <Button size="xs" variant="ghost" icon={CheckCircle2} className="text-ok-600" onClick={() => toggle(c.id)}>تفعيل</Button>}{c.status === 'STS03' && <Button size="xs" variant="secondary" icon={AlertTriangle} onClick={() => setEdit(c)}>إكمال</Button>}</div> },
  ]

  return (
    <>
      <PageHeader title="قائمة الاختبارات" sub="اختباراتك المفعّلة تظهر في دليل المنصة وتُستخدم في عروض الأسعار — الاختيار من العناصر المرجعية لمدير النظام فقط" actions={canManage ? <Button icon={Plus} onClick={() => setAdd(true)}>إضافة اختبارات</Button> : <Badge tone="neutral">عرض فقط — إدارة القائمة للمفوّض الرئيسي</Badge>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="إجمالي الاختبارات" value={items.length} hint="في قائمتك" icon={ListChecks} />
        <Kpi label="مفعّل" value={count('STS01')} hint="جاهز للتقديم في الدليل" tone="ok" icon={CheckCircle2} />
        <Kpi label="موقوف مؤقتاً" value={count('STS02')} hint="لا يظهر في الطلبات الجديدة" tone="danger" icon={Ban} />
        <Kpi label="بيانات ناقصة" value={count('STS03')} hint="لا ردّ على عروض الأسعار قبل الإكمال" tone="warn" icon={AlertTriangle} />
      </div>
      {count('STS03') > 0 && <Callout tone="warn" compact className="mt-3">لا يمكنك الاستجابة لطلبات عروض الأسعار قبل استكمال بيانات جميع اختباراتك (الوحدة، طرق التنفيذ، السعر) — B.R.119.</Callout>}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="الأكثر طلباً" icon={TrendingUp} desc="12 شهراً" bodyClass="p-2 pt-0"><RankBars data={top} height={150} labelWidth={150} /></Section>
        <Section title="الإيراد حسب التصنيف" desc="12 شهراً" bodyClass="p-3"><ul className="grid gap-1.5">{Object.entries(CATEGORY_LABEL).map(([k, l]) => { const v = items.filter(c => refTests.find(t => t.id === c.refTestId)!.category === k).reduce((a, c) => a + revenue(c.refTestId), 0); const max = Math.max(1, ...Object.keys(CATEGORY_LABEL).map(kk => items.filter(c => refTests.find(t => t.id === c.refTestId)!.category === kk).reduce((a, c) => a + revenue(c.refTestId), 0))); return <li key={k} className="flex items-center gap-2 text-[12px]"><span className="w-24 truncate text-ink-700">{l.replace('اختبارات ', '')}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(v / max) * 100}%` }} /></div><span className="num w-20 text-end font-semibold">{fmtSAR(v)}</span></li> })}</ul><p className="meta mt-2">الإيراد المحسوب = عدد الطلبات × السعر الأساسي الحالي</p></Section>
        <Section title="قواعد القائمة" bodyClass="p-3"><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['الاختيار من العناصر المرجعية لمدير النظام فقط — لا إضافة حرّة', 'لا يمكن حذف اختبار؛ يُوقَف مؤقتاً فقط (B.R.117)', 'تعديل السعر لا يؤثر على العقود السابقة (B.R.115)', 'اكتمال الوحدة والطريقة والسعر شرط للرد على عروض الأسعار (B.R.119)', 'الاختبارات المفعّلة تظهر في الدليل العام وتقييمات المنشأة'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></Section>
      </div>
      <div className="mt-3"><DataTable rows={items} columns={cols} rowKey={c => c.id} searchable={c => { const rt = refTests.find(t => t.id === c.refTestId)!; return `${rt.nameAr} ${rt.nameEn} ${c.methods.join(' ')}` }} exportName="catalog" pageSize={20} filters={[{ key: 'cat', label: 'التصنيف', options: Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l })), match: (c, v) => refTests.find(t => t.id === c.refTestId)!.category === v }, { key: 'st', label: 'الحالة', options: [{ value: 'STS01', label: 'مفعّل' }, { value: 'STS02', label: 'موقوف' }, { value: 'STS03', label: 'بيانات ناقصة' }], match: (c, v) => c.status === v }]} rowClass={c => c.status === 'STS03' ? 'bg-warn-25' : ''} /></div>
      {edit && <EditModal item={edit} onClose={() => setEdit(null)} onSave={i => { upsert(i); setEdit(null); useStore.getState().toast({ title: 'حُفظت التعديلات', body: 'تُطبَّق على العمليات الجديدة فقط.', tone: 'ok' }) }} />}
      {add && <AddModal existing={items.map(i => i.refTestId)} onClose={() => setAdd(false)} onAdd={list => { list.forEach(upsert); setAdd(false); useStore.getState().toast({ title: `أُضيف ${list.length} اختبار`, body: 'أكمل بيانات كل اختبار ليظهر في عروض الأسعار.', tone: 'ok' }) }} />}
    </>
  )
}

function EditModal({ item, onClose, onSave }: { item: CatalogItem; onClose: () => void; onSave: (i: CatalogItem) => void }) {
  const rt = useStore(s => s.refTests.find(t => t.id === item.refTestId))!
  const [unit, setUnit] = useState<Unit | ''>(item.unit ?? '')
  const [methods, setMethods] = useState<string[]>(item.methods)
  const [price, setPrice] = useState(item.basePrice?.toString() ?? '')
  const [sla, setSla] = useState(item.sla?.toString() ?? '')
  const ok = unit && methods.length && +price > 0 && +sla > 0
  return (
    <Modal open onClose={onClose} title="تعديل بيانات الاختبار" sub={`${rt.nameAr} — ${rt.nameEn}`} width="lg" footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button disabled={!ok} onClick={() => onSave({ ...item, unit: unit as Unit, methods, basePrice: +price, sla: +sla })}>حفظ التعديلات</Button></>}>
      <div className="grid gap-3">
        <Callout tone="info" compact>معلومات الاختبار (الاسم، التصنيف، حقول النتيجة) يديرها مدير النظام. تعديل السعر أو الطرق يُطبَّق على العمليات الجديدة فقط.</Callout>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="الوحدة" required><Select value={unit} onChange={e => setUnit(e.target.value as Unit)}><option value="">اختر…</option>{rt.units.map(u => <option key={u} value={u}>{u} — {u === 'Ea' ? 'عدد' : u === 'Set' ? 'مجموعة' : 'لكل اختبار'}</option>)}</Select></Field><Field label="السعر الأساسي" required hint="مرجعي في الدليل — يمكن تعديله عند عرض السعر"><Input value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} suffix="ر.س" className="ltr" /></Field><Field label="مدة الإنجاز SLA" required><Input value={sla} onChange={e => setSla(e.target.value.replace(/\D/g, ''))} suffix="أيام" className="ltr" /></Field></div>
        <Field label="طرق التنفيذ" required hint="يمكن اختيار أكثر من طريقة — تظهر للمقاول ليختار منها عند الطلب"><div className="grid gap-1.5 sm:grid-cols-2">{rt.methods.map(m => <Checkbox key={m.code} checked={methods.includes(m.code)} onChange={v => setMethods(v ? [...methods, m.code] : methods.filter(x => x !== m.code))} label={<span><Code>{m.code}</Code> <span className="meta">{m.name} — {m.org}</span></span>} />)}</div></Field>
        {rt.resultFields && <div className="rounded-sm bg-ink-50 p-2.5 text-[12px]"><span className="data-label">حقول النتيجة المهيكلة:</span> {rt.resultFields.map(f => `${f.label} (${f.unit})`).join(' · ')}</div>}
      </div>
    </Modal>
  )
}

function AddModal({ existing, onClose, onAdd }: { existing: string[]; onClose: () => void; onAdd: (i: CatalogItem[]) => void }) {
  const user = useStore(s => s.user)!
  const geoRt = useStore(s => s.refTests.find(t => t.isGeotech)?.id)
  const refTests = useSel(s => s.refTests.filter(t => !existing.includes(t.id) && t.id !== geoRt && t.active !== false)) // موقوف مرجعياً = لا يُضاف لقوائم جديدة
  const [sel, setSel] = useState<Record<string, { unit: Unit | ''; methods: string[]; price: string; sla: string }>>({})
  const [q, setQ] = useState('')
  const toggleSel = (id: string) => setSel(s => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = { unit: refTests.find(t => t.id === id)!.units[0], methods: [], price: '', sla: '' }; return n })
  const list = refTests.filter(t => !q || t.nameAr.includes(q) || t.nameEn.toLowerCase().includes(q.toLowerCase()))
  const build = () => Object.entries(sel).map(([id, v]) => ({ id: uid('c'), labId: user.orgId, refTestId: id, unit: v.unit || undefined, methods: v.methods, basePrice: v.price ? +v.price : undefined, sla: v.sla ? +v.sla : undefined, status: 'STS03' as const }))
  return (
    <Modal open onClose={onClose} title="إضافة اختبارات لقائمتك" sub="من العناصر المرجعية المعتمدة فقط (B.R.112)" width="xl" footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button disabled={!Object.keys(sel).length} onClick={() => onAdd(build())}>إضافة للقائمة ({Object.keys(sel).length})</Button></>}>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div><Input prefixIcon={Search} value={q} onChange={e => setQ(e.target.value)} placeholder="بحث…" className="mb-2" /><ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto rounded-sm border border-ink-200">{list.map(t => <li key={t.id}><button type="button" onClick={() => toggleSel(t.id)} className={cx('flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-[12.5px] hover:bg-ink-50', sel[t.id] && 'bg-brand-50')}><span className={cx('grid size-4 place-items-center rounded-xs border text-[10px]', sel[t.id] ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300')}>{sel[t.id] && '✓'}</span><span><div>{t.nameAr}</div><div className="meta">{t.nameEn} · {CATEGORY_LABEL[t.category].replace('اختبارات ', '')}</div></span></button></li>)}</ul></div>
        <div className="grid content-start gap-2">{Object.keys(sel).length === 0 && <div className="py-10 text-center text-[12.5px] text-ink-500">اختر الاختبارات من القائمة ثم اضبط الوحدة وطرق التنفيذ والسعر لكل اختبار.</div>}
          {Object.entries(sel).map(([id, v]) => { const t = refTests.find(x => x.id === id)!; return <div key={id} className="rounded-sm border border-ink-200 p-2.5"><div className="mb-2 flex items-center justify-between"><span className="text-[13px] font-semibold">{t.nameAr}</span>{v.unit && v.methods.length && v.price ? <Badge tone="ok" size="xs">مكتمل</Badge> : <Badge tone="warn" size="xs">بيانات ناقصة</Badge>}</div><div className="grid gap-2 sm:grid-cols-3"><Field label="الوحدة" required><Select value={v.unit} onChange={e => setSel({ ...sel, [id]: { ...v, unit: e.target.value as Unit } })}>{t.units.map(u => <option key={u} value={u}>{u}</option>)}</Select></Field><Field label="السعر الأساسي" required><Input value={v.price} onChange={e => setSel({ ...sel, [id]: { ...v, price: e.target.value.replace(/\D/g, '') } })} suffix="ر.س" className="ltr" /></Field><Field label="SLA" required><Input value={v.sla} onChange={e => setSel({ ...sel, [id]: { ...v, sla: e.target.value.replace(/\D/g, '') } })} suffix="أيام" className="ltr" /></Field></div><div className="mt-2 flex flex-wrap gap-1.5">{t.methods.map(m => <button key={m.code} type="button" onClick={() => setSel({ ...sel, [id]: { ...v, methods: v.methods.includes(m.code) ? v.methods.filter(x => x !== m.code) : [...v.methods, m.code] } })} className={cx('rounded-full border px-2 py-0.5 text-[11px] font-medium', v.methods.includes(m.code) ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 text-ink-600')}>{v.methods.includes(m.code) && '✓ '}{m.code}</button>)}</div></div> })}</div>
      </div>
    </Modal>
  )
}
