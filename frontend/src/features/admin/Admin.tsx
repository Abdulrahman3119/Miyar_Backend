import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sliders, Database, BookOpen, FileText, Star, Plus, Eye, EyeOff, Trash2, Check, Shield, Users, Building2, ShieldCheck, History } from 'lucide-react'
import { useStore, useSel } from '@/lib/store'
import { PageHeader } from '@/ds/composite'
import { Section, Field, Input, Select, Textarea, Checkbox, Button, Callout, Badge, Table, Th, Td, Code, Tag, Tabs, StatusPill, Stars, Modal, Toggle, KV, Kpi, Drawer, cx } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { Bars } from '@/ds/charts'
import { CATEGORY_LABEL } from '@/lib/lookups'
import type { BusinessRules, Category, RefTest, Organization, Rating, Contract, User, Template } from '@/lib/types'
import { fmtDate, fmtSAR } from '@/lib/format'
import { ROLE_LABEL } from '@/lib/roles'
import { uid } from '@/lib/format'
import { isCommercialRegistration, isSaudiMobile, normalizeSaudiMobile, onlyDigits } from '@/lib/phone'
import { openFile, printHtml } from '@/lib/files'
import { call } from '@/lib/backend'

/* ───────── Business rules ───────── */
export function Rules() {
  const rules = useStore(s => s.rules)
  const setRules = useStore(s => s.setRules)
  const audit = useSel(s => s.audit.filter(a => a.entity === 'settings').slice(0, 6))
  const [f, setF] = useState<BusinessRules>(rules)
  const N = (k: keyof BusinessRules, label: string, hint: string, suffix: string) => <Field label={label} hint={hint}><Input type="number" value={f[k] as number} onChange={e => setF({ ...f, [k]: +e.target.value })} suffix={suffix} className="ltr" /></Field>
  const dirty = JSON.stringify(f) !== JSON.stringify(rules)
  return (
    <>
      <PageHeader title="قواعد الأعمال" sub="الإعدادات التشغيلية — تُطبَّق على العمليات الجديدة فقط وتُجمَّد قيمها في كل طلب عند إرساله (الطلبات القائمة تحتفظ بقواعدها) · كل تعديل يُسجَّل كحدث حرج في سجل التدقيق" actions={<><Button variant="secondary" disabled={!dirty} onClick={() => setF(rules)}>استعادة</Button><Button disabled={!dirty} onClick={() => setRules(f)}>حفظ القواعد</Button></>} />
      <div className="grid grid-cols-12 gap-3">
        <Section title="طلبات الاختبارات" icon={Sliders} className="col-span-12 lg:col-span-4" bodyClass="p-3"><div className="grid gap-3">{N('maxTestsPerRequest', 'الحد الأقصى للاختبارات في الطلب', 'B.R.137 — الافتراضي 10', 'اختبار')}{N('proposedSlots', 'عدد المواعيد المقترحة', 'B.R.138 — الافتراضي 3', 'نطاق')}{N('minLeadHours', 'الحد الأدنى لأول موعد', 'B.R.138 — 48 ساعة من الإرسال', 'ساعة')}{N('vat', 'ضريبة القيمة المضافة', 'تُحتسب تلقائياً', '%')}</div></Section>
        <Section title="المهل والاعتماد" icon={Sliders} className="col-span-12 lg:col-span-4" bodyClass="p-3"><div className="grid gap-3">{N('labDecisionHours', 'مهلة قرار المختبر', 'B.R.147 — الافتراضي 12 ساعة', 'ساعة')}<Field label="عند تجاوز مهلة المختبر" hint="B.R.147 — الوثيقة لا تحدد الأثر؛ سياسة منصة"><Select value={f.labTimeoutAction} onChange={e => setF({ ...f, labTimeoutAction: e.target.value as any })}><option value="expire">إنهاء الطلب بحالة «منتهي المهلة» (STS26) + إشعار المقاول والمختبر + خصم في مؤشرات المختبر</option><option value="none">إشعار المختبر والجهة الإشرافية فقط دون تغيير الحالة</option></Select></Field>{N('consultantDecisionHours', 'مهلة اعتماد المكتب الاستشاري', 'B.R.152 — تُعتمد تلقائياً بعدها', 'ساعة')}</div></Section>
        <Section title="الدراسة الجيوتقنية" icon={Sliders} className="col-span-12 lg:col-span-4" bodyClass="p-3"><div className="grid gap-3">{N('minBoreholeDepth', 'الحد الأدنى لعمق الجسة (سياسة منصة)', 'ليس نصاً في SBC 303 — الكود 4–12 م من قاع الأساس', 'م')}{N('geofenceMeters', 'النطاق الجغرافي لتنفيذ الجسة', 'B.R.183 — الافتراضي 3 م', 'م')}</div><Callout tone="info" compact className="mt-3">قاعدة عدد الجسات تُدار في <Link to="/admin/knowledge" className="font-semibold underline">قاعدة المعرفة</Link> (SBC 303 Table 2.1).</Callout></Section>
        <Section title="المحرك الذكي — سياسة التوجيه" icon={Sliders} className="col-span-12 lg:col-span-6" bodyClass="p-3">
          <Field label="المسار الافتراضي للتحليل" hint="B.R.224/230 — تحدد المنصة المسار، ويتحوّل تلقائياً إلى البديل عند تعذّر المسار المفضَّل">
            <Select value={f.enginePolicy} onChange={e => setF({ ...f, enginePolicy: e.target.value as BusinessRules['enginePolicy'] })}>
              <option value="screen-then-cloud">فحص محلي ثم سحابي — لا يُستدعى المدفوع إلا للمستندات المستوفية</option>
              <option value="cloud-first">سحابي أولاً — بديل محلي تلقائي عند توقف الاشتراك</option>
              <option value="local-first">محلي أولاً — أقل تكلفة وأعلى سيادة، والسحابي عند تعذّر المحلي</option>
              <option value="compare">مقارنة المسارين — لقياس الفارق قبل اعتماد المحلي بديلاً دائماً</option>
            </Select>
          </Field>
          <Callout tone="info" compact className="mt-3">
            بوابة مطابقة النطاق تعمل قبل أي مسار وبلا تكلفة: المستند خارج ملف التقييم يُرفض قبل استدعاء أي نموذج.
            انقطاع الاشتراك السحابي لا يوقف الدراسة — يتحوّل التشغيل إلى المسار المحلي بالسياسة وحزمة المعرفة نفسها.
          </Callout>
        </Section>
        <Section title="سجل تعديلات القواعد" icon={History} className="col-span-12" bodyClass="p-0"><Table className="border-0"><thead><tr><Th>الحدث</Th><Th>المنفّذ</Th><Th>القاعدة</Th><Th>التاريخ</Th><Th>الخطورة</Th></tr></thead><tbody>{audit.map(a => <tr key={a.id}><Td className="font-mono text-[11px]">{a.id}</Td><Td>{a.actor} <span className="meta">— {ROLE_LABEL[a.role]}</span></Td><Td><Code>{a.entityId}</Code></Td><Td className="num">{fmtDate(a.at)}</Td><Td><Badge tone="danger" size="xs">حرج</Badge></Td></tr>)}</tbody></Table></Section>
      </div>
    </>
  )
}

/* ───────── Reference elements ───────── */
export function Reference() {
  const refTests = useStore(s => s.refTests)
  const catalog = useStore(s => s.catalog)
  const update = useStore(s => s.updateRefTest)
  const [tab, setTab] = useState<'tests' | 'methods' | 'units' | 'cats'>('tests')
  const [edit, setEdit] = useState<RefTest | null>(null)
  const methods = [...new Map(refTests.flatMap(t => t.methods).map(m => [m.code, m])).values()]
  const usage = (id: string) => catalog.filter(c => c.refTestId === id).length
  const cols: Column<RefTest>[] = [
    { key: 'name', header: 'الاختبار', sortValue: t => t.nameAr, exportValue: t => t.nameAr, cell: t => <div><div className="font-semibold">{t.nameAr}</div><div className="meta">{t.nameEn}</div></div> },
    { key: 'cat', header: 'التصنيف', width: '120px', sortValue: t => t.category, cell: t => <Tag>{CATEGORY_LABEL[t.category]}</Tag> },
    { key: 'methods', header: 'طرق التنفيذ', cell: t => <div className="flex flex-wrap gap-1">{t.methods.map(m => <Code key={m.code}>{m.code}</Code>)}</div> },
    { key: 'units', header: 'الوحدات', width: '90px', cell: t => <span className="text-[12px]">{t.units.join(' · ')}</span> },
    { key: 'fields', header: 'حقول النتيجة', cell: t => <span className="meta">{t.resultFields?.map(f => f.label.split(' ')[0]).join('، ') ?? '—'}</span> },
    { key: 'use', header: 'مختبرات تقدّمه', width: '110px', sortValue: t => usage(t.id), cell: t => <span className="num">{usage(t.id)}</span> },
    { key: 'model', header: 'نموذج النتيجة', width: '130px', cell: t => <div className="flex flex-wrap gap-1"><Badge tone={t.resultFields?.length ? 'ok' : 'warn'} size="xs">{t.resultFields?.length ? `${t.resultFields.length} حقول` : 'بلا حقول'}</Badge>{t.allowExternalReport !== false && <Badge tone="neutral" size="xs">تقرير خارجي</Badge>}</div> },
    { key: 'active', header: 'الحالة', width: '90px', cell: t => <Badge tone={t.active === false ? 'danger' : 'ok'} size="xs" dot>{t.active === false ? 'موقوف' : 'فعّال'}</Badge> },
    { key: 'act', header: '', width: '80px', hideable: false, cell: t => <Button size="xs" variant="ghost" onClick={() => setEdit(t)}>تعديل</Button> },
  ]
  return (
    <>
      <PageHeader title="العناصر المرجعية" sub="التصنيفات وأنواع الاختبارات وطرق التنفيذ والوحدات — المرجع المركزي الذي تختار منه المختبرات دون إمكانية الإضافة إليه (B.R.112)" actions={<Button icon={Plus} onClick={() => setEdit({ id: uid('rt'), nameAr: '', nameEn: '', category: 'soil', methods: [], units: ['Ea'] })}>اختبار مرجعي جديد</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="أنواع الاختبارات" value={refTests.length} icon={Database} /><Kpi label="طرق التنفيذ" value={methods.length} hint={`ASTM ${methods.filter(m => m.org === 'ASTM').length} · BS ${methods.filter(m => m.org === 'BS').length} · AASHTO ${methods.filter(m => m.org === 'AASHTO').length}`} /><Kpi label="التصنيفات" value={4} hint="تربة · إسفلت · خرسانة · ركام" /><Kpi label="وحدات القياس" value={3} hint="Ea · Set · per Test" /></div>
      <Callout tone="info" compact className="mt-3">أي تعديل على اختبار موجود ينعكس تلقائياً على قوائم المختبرات مع إشعارها (B.R.113). الاختبارات الجديدة لا تُضاف لقوائمها تلقائياً.</Callout>
      <div className="mt-3"><Tabs value={tab} onChange={setTab} items={[{ value: 'tests', label: 'أنواع الاختبارات', count: refTests.length }, { value: 'methods', label: 'طرق التنفيذ', count: methods.length }, { value: 'units', label: 'الوحدات' }, { value: 'cats', label: 'التصنيفات' }]} /></div>
      <div className="mt-3">
        {tab === 'tests' && <DataTable rows={refTests} columns={cols} rowKey={t => t.id} searchable={t => `${t.nameAr} ${t.nameEn}`} exportName="reference-tests" pageSize={25} filters={[{ key: 'cat', label: 'التصنيف', options: Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l })), match: (t, v) => t.category === v }]} />}
        {tab === 'methods' && <Table><thead><tr><Th>الرمز</Th><Th>الاسم</Th><Th>الجهة</Th><Th>مستخدم في</Th></tr></thead><tbody>{methods.map(m => <tr key={m.code}><Td><Code>{m.code}</Code></Td><Td>{m.name}</Td><Td><Tag>{m.org}</Tag></Td><Td className="text-[12px]">{refTests.filter(t => t.methods.some(x => x.code === m.code)).map(t => t.nameAr).join('، ')}</Td></tr>)}</tbody></Table>}
        {tab === 'units' && <Table><thead><tr><Th>الوحدة</Th><Th>الوصف</Th><Th>الاستخدام</Th></tr></thead><tbody>{[['Ea', 'عدد — لكل عينة'], ['Set', 'مجموعة — طقم عينات (مثل المكعبات)'], ['per Test', 'لكل اختبار — خدمة متكاملة (الدراسة الجيوتقنية)']].map(([u, d]) => <tr key={u}><Td><Tag>{u}</Tag></Td><Td>{d}</Td><Td className="num">{refTests.filter(t => t.units.includes(u as any)).length} اختباراً</Td></tr>)}</tbody></Table>}
        {tab === 'cats' && <Table><thead><tr><Th>التصنيف</Th><Th>عدد الاختبارات</Th><Th>قاعدة الطلب</Th></tr></thead><tbody>{(Object.keys(CATEGORY_LABEL) as Category[]).map(c => <tr key={c}><Td className="font-semibold">{CATEGORY_LABEL[c]}</Td><Td className="num">{refTests.filter(t => t.category === c).length}</Td><Td className="meta">طلب واحد = تصنيف واحد (تعارض 5)</Td></tr>)}</tbody></Table>}
      </div>
      {edit && <Modal open onClose={() => setEdit(null)} title={edit.nameAr ? 'تعديل اختبار مرجعي' : 'اختبار مرجعي جديد'} width="lg" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button><Button disabled={!edit.nameAr || !edit.nameEn || (edit.resultFields ?? []).some(f => !f.key || !f.label)} onClick={() => { update({ ...edit, resultFields: (edit.resultFields ?? []).length ? edit.resultFields : undefined }); setEdit(null); useStore.getState().toast({ title: 'حُفظ الاختبار المرجعي', body: 'أُشعرت المختبرات التي تضمه قوائمها.', tone: 'ok' }) }}>حفظ</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="الاسم بالعربي" required><Input value={edit.nameAr} onChange={e => setEdit({ ...edit, nameAr: e.target.value })} /></Field><Field label="الاسم بالإنجليزي" required><Input value={edit.nameEn} onChange={e => setEdit({ ...edit, nameEn: e.target.value })} className="ltr" /></Field><Field label="التصنيف"><Select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value as Category })}>{(Object.keys(CATEGORY_LABEL) as Category[]).map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field><Field label="الوحدات المسموحة"><div className="flex gap-1.5 pt-1.5">{(['Ea', 'Set', 'per Test'] as const).map(u => <button key={u} type="button" onClick={() => setEdit({ ...edit, units: edit.units.includes(u) ? edit.units.filter(x => x !== u) : [...edit.units, u] })} className={cx('rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium', edit.units.includes(u) ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300')}>{u}</button>)}</div></Field></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Toggle checked={edit.allowExternalReport !== false} onChange={v => setEdit({ ...edit, allowExternalReport: v })} label="السماح برفع تقرير خارجي (PDF) مع الحقول المهيكلة" /><Toggle checked={edit.active !== false} onChange={v => setEdit({ ...edit, active: v })} label={edit.active === false ? 'العنصر موقوف — لا يُضاف إلى قوائم جديدة' : 'العنصر فعّال'} /></div>
        {/* مخطط "إدارة الاختبارات": تحديد نموذج النتيجة — الحقول المهيكلة التي يعبّئها المختبر (B.R.203) */}
        <div className="mt-3"><div className="mb-1.5 flex items-center justify-between"><span className="text-[12px] font-semibold">نموذج النتيجة — الحقول المهيكلة</span><span className="meta">تظهر في شاشة التنفيذ وتُقارن بالحدود المرجعية</span></div><ul className="grid gap-1.5">{(edit.resultFields ?? []).map((f, i) => <li key={i} className="grid grid-cols-[110px_1fr_90px_auto] gap-2"><Input value={f.key} onChange={e => setEdit({ ...edit, resultFields: edit.resultFields!.map((x, j) => j === i ? { ...x, key: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() } : x) })} className="ltr h-8" placeholder="mdd" /><Input value={f.label} onChange={e => setEdit({ ...edit, resultFields: edit.resultFields!.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} className="h-8" placeholder="الكثافة الجافة القصوى" /><Input value={f.unit} onChange={e => setEdit({ ...edit, resultFields: edit.resultFields!.map((x, j) => j === i ? { ...x, unit: e.target.value } : x) })} className="ltr h-8" placeholder="Mg/m³" /><Button size="xs" variant="ghost" icon={Trash2} onClick={() => setEdit({ ...edit, resultFields: edit.resultFields!.filter((_, j) => j !== i) })} /></li>)}</ul><Button size="xs" variant="secondary" icon={Plus} className="mt-2" onClick={() => setEdit({ ...edit, resultFields: [...(edit.resultFields ?? []), { key: '', label: '', unit: '' }] })}>إضافة حقل</Button>{(edit.resultFields?.length ?? 0) > 0 && <div className="mt-2 rounded-sm bg-ink-50 p-2 text-[11.5px]"><span className="data-label">معاينة النموذج:</span> {edit.resultFields!.filter(f => f.label).map(f => `${f.label}${f.unit ? ` (${f.unit})` : ''}`).join(' · ') || '—'}</div>}</div>
        <div className="mt-3"><div className="mb-1.5 text-[12px] font-semibold">طرق التنفيذ</div><ul className="grid gap-1.5">{edit.methods.map((m, i) => <li key={i} className="grid grid-cols-[1fr_2fr_100px_auto] gap-2"><Input value={m.code} onChange={e => setEdit({ ...edit, methods: edit.methods.map((x, j) => j === i ? { ...x, code: e.target.value } : x) })} className="ltr h-8" placeholder="ASTM D1557" /><Input value={m.name} onChange={e => setEdit({ ...edit, methods: edit.methods.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} className="ltr h-8" /><Select value={m.org} onChange={e => setEdit({ ...edit, methods: edit.methods.map((x, j) => j === i ? { ...x, org: e.target.value as any } : x) })} className="h-8">{['ASTM', 'AASHTO', 'BS', 'SBC', 'IP'].map(o => <option key={o}>{o}</option>)}</Select><Button size="xs" variant="ghost" icon={Trash2} onClick={() => setEdit({ ...edit, methods: edit.methods.filter((_, j) => j !== i) })} /></li>)}</ul><Button size="xs" variant="secondary" icon={Plus} className="mt-2" onClick={() => setEdit({ ...edit, methods: [...edit.methods, { code: '', name: '', org: 'ASTM' }] })}>إضافة طريقة</Button></div>
      </Modal>}
    </>
  )
}

/* ───────── Knowledge base ───────── */
export function Knowledge() {
  const [tab, setTab] = useState<'boreholes' | 'tests' | 'chem' | 'seismic' | 'equations' | 'versions'>('boreholes')
  const versions = useStore(s => s.knowledgeVersions); const addKnowledgeVersion = useStore(s => s.addKnowledgeVersion); const publishKnowledgeVersion = useStore(s => s.publishKnowledgeVersion)
  const [newKV, setNewKV] = useState<null | { ver: string; changes: string }>(null)
  return (
    <>
      <PageHeader title="قاعدة المعرفة والمعادلات" sub="القواعد والمراجع الفنية التي يشغّلها المحرك الذكي — بإصدارات، ويُثبَّت الإصدار الساري لكل دراسة عند تشغيلها (B.R.229)" meta={<><Badge tone="ok" size="xs">الإصدار الساري {versions.find(v => v.status === 'ساري')?.ver}</Badge><Badge tone="neutral" size="xs">آخر تحديث {versions.find(v => v.status === 'ساري')?.date}</Badge>{versions.filter(v => v.status === 'مسودة').map(v => <Badge key={v.ver} tone="warn" size="xs">مسودة {v.ver} قيد المراجعة</Badge>)}</>} actions={<Button icon={Plus} onClick={() => setNewKV({ ver: '', changes: '' })}>إصدار جديد (مسودة)</Button>} />
      <Modal open={!!newKV} onClose={() => setNewKV(null)} title="إصدار جديد من قاعدة المعرفة" sub="يُنشأ كمسودة؛ الاعتماد يسجَّل كحدث حرج ويُطبَّق على الدراسات بلا تقرير نهائي (B.R.213/229)" width="sm" footer={<><Button variant="secondary" onClick={() => setNewKV(null)}>إلغاء</Button><Button disabled={!newKV || !/^v\d+\.\d+$/.test(newKV.ver) || newKV.changes.trim().length < 5} onClick={() => { addKnowledgeVersion(newKV!.ver, newKV!.changes); setNewKV(null) }}>إنشاء المسودة</Button></>}>
        {newKV && <div className="grid gap-3"><Field label="رقم الإصدار" required hint="بصيغة v1.4"><Input value={newKV.ver} onChange={e => setNewKV({ ...newKV, ver: e.target.value })} className="ltr" /></Field><Field label="التغييرات" required><Textarea value={newKV.changes} onChange={e => setNewKV({ ...newKV, changes: e.target.value })} className="min-h-20" placeholder="مثال: تحديث الحدود الكيميائية للكبريتات وفق SBC 304 طبعة 2024" /></Field></div>}
      </Modal>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="قواعد الجسات" value={7} hint="صفوف Table 2.1" icon={BookOpen} /><Kpi label="محفّزات المحرك" value={4} hint="انتفاخ · سبخة · انهيار · عينة الكيميائية" /><Kpi label="الحدود الكيميائية" value={5} hint="pH · SO₄ · Cl · كربونات · عضوية" /><Kpi label="المعادلات" value={4} hint="تحمل · هبوط · ks · Ka/Kp/K0" /></div>
      <Callout tone="warn" compact className="mt-3">قيم Table 2.1 من طبعتي SBC 303-2007/2018 — طبعة 2024 غير مؤكدة بانتظار النص الكامل من الإدارة العامة لكود البناء. حدود الكيميائية مرجعها SBC 304 وتُدار هنا كسياسة منصة.</Callout>
      <div className="mt-3"><Tabs value={tab} onChange={setTab} items={[{ value: 'boreholes', label: 'عدد وعمق الجسات — Table 2.1' }, { value: 'tests', label: 'الاختبارات الإلزامية والمحفّزات' }, { value: 'chem', label: 'الحدود الكيميائية' }, { value: 'seismic', label: 'المعاملات الزلزالية — SBC 301' }, { value: 'equations', label: 'المعادلات' }, { value: 'versions', label: 'الإصدارات' }]} /></div>
      <div className="mt-3">
        {tab === 'boreholes' && <><Table><thead><tr><Th>عدد الأدوار</Th><Th>المساحة المبنية</Th><Th>الحد الأدنى للجسات</Th><Th>⅔ الجسات بعمق ≥</Th><Th>⅓ الجسات بعمق ≥</Th><Th>ملاحظة</Th></tr></thead><tbody>{[['≤ 2', '< 600 م²', '3', '4 م', '6 م', ''], ['≤ 2', '600 – 5000 م²', '3 – 10 (المهندس المسجّل)', '5 م', '8 م', ''], ['≤ 2', '> 5000 م²', 'دراسة خاصة', '—', '—', 'Special investigation'], ['3 – 4', '< 600 م²', '3', '6 م', '9 م', ''], ['3 – 4', '600 – 5000 م²', '3 – 10', '8 م', '12 م', ''], ['3 – 4', '> 5000 م²', 'دراسة خاصة', '—', '—', ''], ['≥ 5', 'أي مساحة', 'دراسة خاصة', '—', '—', 'يحددها الاستشاري بمبرر']].map((r, i) => <tr key={i}>{r.map((c, j) => <Td key={j} className={j === 2 ? 'font-semibold' : ''}>{c}</Td>)}</tr>)}</tbody></Table><p className="meta mt-2">العمق يُقاس من منسوب قاع الأساس (حاشية f). القيم حد أدنى إرشادي؛ يجب أن يغطي العمق كل الطبقات المتأثرة بأحمال المبنى والمباني المجاورة (§2.4.3). سياسة المنصة تضيف حداً أدنى قابلاً للتهيئة.</p></>}
        {tab === 'tests' && <div className="grid gap-3 lg:grid-cols-2"><Section title="الاختبارات الإلزامية (سياسة المنصة)" desc="§2.4.1: البرنامج يحدده المهندس المسجّل — هذه إحالات الكود" bodyClass="p-0"><Table className="border-0"><thead><tr><Th>نوع العينة</Th><Th>الاختبار</Th><Th>المعيار</Th></tr></thead><tbody>{[['تربة', 'التحليل الحبيبي', 'ASTM D422'], ['تربة', 'حدود أتربرج', 'ASTM D4318'], ['تربة', 'معامل الرطوبة', 'ASTM D2216'], ['تربة', 'التصنيف USCS', 'ASTM D2487'], ['صخر', 'الضغط غير المحصور UCS', 'ASTM D7012'], ['حقلي', 'SPT', 'ASTM D1586']].map((r, i) => <tr key={i}><Td>{r[0]}</Td><Td>{r[1]}</Td><Td><Code>{r[2]}</Code></Td></tr>)}</tbody></Table></Section><Section title="محفّزات المحرك الذكي" desc="قواعد توصي باختبارات إضافية تلقائياً" bodyClass="p-3"><ul className="grid gap-1.5 text-[12.5px]">{[['PI ≥ 15 أو مار من منخل 200 > 10%', 'تربة انتفاخية محتملة → اقتراح Expansion Index (ASTM D4829)'], ['SPT N بين 0 و 8', 'مؤشر سبخة → تحليل كيميائي كامل للتربة والمياه (§2.5.3) + تجفيف 60°C'], ['Collapse Index > 1%', 'تربة انهيارية → توصية تحسين التربة'], ['عمق التأسيس ضمن طبقة متجانسة', 'اقتراح عينة الكيميائية من تلك الطبقة']].map(([c, a]) => <li key={c} className="rounded-sm border border-ink-100 p-2"><div className="font-semibold">{c}</div><div className="meta">{a}</div></li>)}</ul></Section></div>}
        {tab === 'chem' && <Table><thead><tr><Th>الاختبار</Th><Th>الطريقة</Th><Th>الحد المرجعي</Th><Th>المصدر</Th><Th>الأثر عند التجاوز</Th></tr></thead><tbody>{[['pH', 'ASTM D4972', '6 – 9', 'سياسة منصة', 'تنبيه'], ['كبريتات SO₄', 'BS 1377-3', '< 0.2%', 'SBC 304 (تعرّض الخرسانة)', 'توصية أسمنت Type V'], ['كلوريد Cl⁻', 'BS 1377-3', '< 0.05%', 'SBC 304', 'توصية غطاء خرساني أكبر'], ['كربونات', 'ASTM D4373', '< 5%', 'سياسة منصة', 'تنبيه'], ['مواد عضوية', 'ASTM D2974', '< 3%', 'سياسة منصة', 'عدم صلاحية للردم']].map((r, i) => <tr key={i}><Td className="font-semibold">{r[0]}</Td><Td><Code>{r[1]}</Code></Td><Td className="ltr num">{r[2]}</Td><Td className="text-[12px]">{r[3]}</Td><Td className="text-[12px]">{r[4]}</Td></tr>)}</tbody></Table>}
        {tab === 'seismic' && <div className="grid gap-3 lg:grid-cols-2"><Section title="تصنيف الموقع — SBC 301 الفصل 20" bodyClass="p-0"><Table className="border-0"><thead><tr><Th>الفئة</Th><Th>Vs30</Th><Th>N̄ (SPT)</Th><Th>s̄u</Th></tr></thead><tbody>{[['B', '760 – 1500 m/s', '—', '—'], ['C', '360 – 760', '> 50', '> 100 kPa'], ['D', '180 – 360', '15 – 50', '50 – 100'], ['E', '< 180', '< 15', '< 50']].map((r, i) => <tr key={i}>{r.map((c, j) => <Td key={j} className={j ? 'ltr num text-[12px]' : 'font-bold'}>{c}</Td>)}</tr>)}</tbody></Table></Section><Section title="مصادر القيم" bodyClass="p-3"><ul className="grid gap-1.5 text-[12.5px]"><li><b>Ss, S1, PGA, TL</b> — خرائط الفصل 22 لفئة الموقع B (شمال/جنوب المملكة) — خدمة بحث جغرافي بالإحداثيات</li><li><b>Fa, Fv</b> — جداول §11.4-1 و11.4-2 حسب الفئة وSs/S1</li><li><b>فئة F</b> — تحليل استجابة موقعي (الفصل 21)</li><li className="meta">طبعة SBC 301-24 قد تعيد الترقيم — يُتحقق قبل الإطلاق</li></ul></Section></div>}
        {tab === 'equations' && <Table><thead><tr><Th>الحقل</Th><Th>المعادلة</Th><Th>المدخلات</Th><Th>الإصدار</Th><Th>المرجع</Th></tr></thead><tbody>{[['قدرة التحمل الصافية', 'q_net = (c·Nc·sc + q·(Nq−1) + 0.5·γ·B·Nγ·sγ) / FS', 'c, φ, γ, B, FS', 'v1.2', 'Terzaghi/Meyerhof — SBC 303 الفصل 4'], ['الهبوط', 'S = Σ(Δσ·H)/Es', 'Es, الحمل, H', 'v1.2', 'SBC 303 §2.6 (11)'], ['معامل رد الفعل', 'ks = q_all / δ_all', 'q_all, δ_all', 'v1.0', '—'], ['Ka / Kp / K0', 'tan²(45−φ/2), tan²(45+φ/2), 1−sinφ', 'φ', 'v1.0', 'Rankine / Jaky — الفصل 8']].map((r, i) => <tr key={i}><Td className="font-semibold">{r[0]}</Td><Td className="ltr font-mono text-[11px]">{r[1]}</Td><Td className="ltr text-[12px]">{r[2]}</Td><Td><Badge tone="ok" size="xs">{r[3]}</Badge></Td><Td className="text-[12px]">{r[4]}</Td></tr>)}</tbody></Table>}
        {tab === 'versions' && <Table><thead><tr><Th>الإصدار</Th><Th>التاريخ</Th><Th>التغييرات</Th><Th>الدراسات المثبَّتة عليه</Th><Th>الحالة</Th><Th></Th></tr></thead><tbody>{versions.map(v => <tr key={v.ver}><Td><Code>{v.ver}</Code></Td><Td className="num">{v.date}</Td><Td className="text-[12px]">{v.changes}</Td><Td className="num">{v.studies || '—'}</Td><Td><Badge tone={v.status === 'ساري' ? 'ok' : v.status === 'مسودة' ? 'warn' : 'neutral'} size="xs">{v.status}</Badge></Td><Td>{v.status === 'مسودة' && <Button size="xs" variant="secondary" icon={Check} onClick={() => publishKnowledgeVersion(v.ver)}>اعتماد ونشر</Button>}</Td></tr>)}</tbody></Table>}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="أثر القاعدة على الدراسات" desc="توزيع توضيحي — يُحسب من الدراسات الفعلية عند الربط" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]">{[['≤2 دور · < 600 م²', 31], ['3–4 أدوار · < 600 م²', 27], ['≤2 دور · 600–5000 م²', 14], ['3–4 أدوار · 600–5000 م²', 8], ['دراسة خاصة (≥5 أدوار)', 3]].map(([l, n]) => <li key={l} className="flex items-center gap-2"><span className="w-40 truncate text-ink-700">{l}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(+n / 31) * 100}%` }} /></div><span className="num w-8 text-end font-semibold">{n}</span></li>)}</ul><p className="meta mt-2">كل تشغيل للمحرك يُثبَّت على إصدار القاعدة الساري وقت التشغيل ويُسجَّل مبرر أي تجاوز من الاستشاري (B.R.174/229).</p></Section>
        <Section title="تجاوزات الاستشاري للتوصية" desc="تُسجَّل مع المبرر" bodyClass="p-0"><table className="w-full text-[12px]"><tbody>{[['TST-2026-046', 'نقل BH-02 بمقدار 4 م', 'خط مرافق'], ['TST-2026-301', 'زيادة العمق 12 → 15 م', 'طبقة انتفاخية متوقعة'], ['TST-2026-284', 'إضافة جسة خامسة', 'شكل القطعة غير منتظم'], ['TST-2026-233', 'تقليل الجسات 4 → 3', 'دراسة سابقة مجاورة']].map(([id, w, why]) => <tr key={id} className="border-b border-ink-100 last:border-0"><td className="px-3 py-1.5 font-semibold text-brand-700">{id}</td><td className="px-2 py-1.5">{w}</td><td className="px-3 py-1.5 text-ink-500">{why}</td></tr>)}</tbody></table></Section>
        <Section title="حوكمة الإصدارات" bodyClass="p-3"><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['كل دراسة تُثبَّت على الإصدار الساري وقت تشغيل المحرك (B.R.229)', 'تعديل الإصدار الساري يتطلب مراجعة الإدارة العامة لكود البناء', 'المسودة v1.3 لا تُطبَّق على أي دراسة قبل الاعتماد', 'كل تغيير يُسجَّل كحدث حرج في سجل التدقيق', 'قيم Table 2.1 لطبعة 2024 بانتظار النص الرسمي'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></Section>
      </div>
    </>
  )
}

/* ───────── Templates ───────── */
export function Templates() {
  const TEMPLATES = useStore(s => s.templates)
  const upsertTemplate = useStore(s => s.upsertTemplate); const addTemplateVersion = useStore(s => s.addTemplateVersion)
  const [selId, setSelId] = useState(TEMPLATES[0].id); const sel = TEMPLATES.find(t => t.id === selId) ?? TEMPLATES[0]; const setSel = (t: Template) => setSelId(t.id)
  const [newT, setNewT] = useState<null | { name: string; ref: string; sections: string }>(null)
  const [newV, setNewV] = useState<null | { ver: string; note: string; publish: boolean }>(null)
  return (
    <>
      <PageHeader title="القوالب والنماذج" sub="قوالب التقارير والشهادات بإصدارات — يُطبَّق الإصدار الساري عند التوليد ويُحتفظ بالمستخدم لكل مستند صادر (B.R.222)" actions={<Button icon={Plus} onClick={() => setNewT({ name: '', ref: '', sections: '' })}>قالب جديد</Button>} />
      <Modal open={!!newT} onClose={() => setNewT(null)} title="قالب جديد (مسودة)" sub="لا يُطبَّق قبل اعتماد الإدارة العامة لكود البناء" width="md" footer={<><Button variant="secondary" onClick={() => setNewT(null)}>إلغاء</Button><Button disabled={!newT || newT.name.trim().length < 3 || !newT.sections.trim()} onClick={() => { const secs = newT!.sections.split('\n').map(x => x.trim()).filter(Boolean); upsertTemplate({ id: `tpl-${Date.now().toString(36)}`, name: newT!.name, ver: 'v0.1', ref: newT!.ref, fields: `${secs.length} أقسام`, updated: new Date().toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }), used: 0, status: 'مسودة', sections: secs, history: [{ ver: 'v0.1', date: 'اليوم', note: 'إنشاء القالب', status: 'مسودة' }] }); setNewT(null) }}>إنشاء المسودة</Button></>}>
        {newT && <div className="grid gap-3"><Field label="اسم القالب" required><Input value={newT.name} onChange={e => setNewT({ ...newT, name: e.target.value })} placeholder="مثال: محضر أخذ عينات ميداني" /></Field><Field label="المرجع النظامي"><Input value={newT.ref} onChange={e => setNewT({ ...newT, ref: e.target.value })} placeholder="SBC 303 §… / ASTM …" /></Field><Field label="الأقسام (سطر لكل قسم)" required><Textarea value={newT.sections} onChange={e => setNewT({ ...newT, sections: e.target.value })} className="min-h-28" placeholder={'بيانات الطلب\nالعينة والموقع\nالتوقيعات'} /></Field></div>}
      </Modal>
      <Modal open={!!newV} onClose={() => setNewV(null)} title={`إصدار جديد — ${sel.name}`} sub={`الإصدار الساري الحالي ${sel.ver}`} width="sm" footer={<><Button variant="secondary" onClick={() => setNewV(null)}>إلغاء</Button><Button disabled={!newV || !/^v\d+\.\d+$/.test(newV.ver) || newV.note.trim().length < 5} onClick={() => { addTemplateVersion(sel.id, newV!.ver, newV!.note, newV!.publish); useStore.getState().toast({ title: newV!.publish ? `نُشر ${newV!.ver}` : `حُفظت مسودة ${newV!.ver}`, body: sel.name, tone: 'ok' }); setNewV(null) }}>{newV?.publish ? 'نشر الإصدار' : 'حفظ كمسودة'}</Button></>}>
        {newV && <div className="grid gap-3"><Field label="رقم الإصدار" required hint="بصيغة v2.2"><Input value={newV.ver} onChange={e => setNewV({ ...newV, ver: e.target.value })} className="ltr" /></Field><Field label="ملخص التغييرات" required><Textarea value={newV.note} onChange={e => setNewV({ ...newV, note: e.target.value })} className="min-h-16" /></Field><Checkbox checked={newV.publish} onChange={v => setNewV({ ...newV, publish: v })} label="نشر فوراً كإصدار سارٍ (المستندات الصادرة سابقاً تحتفظ بإصدارها — B.R.222)" /></div>}
      </Modal>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="القوالب" value={TEMPLATES.length} icon={FileText} /><Kpi label="سارية" value={TEMPLATES.filter(t => t.status === 'ساري').length} tone="ok" /><Kpi label="مسودة" value={TEMPLATES.filter(t => t.status === 'مسودة').length} tone="warn" hint="شهادة الإتمام — بانتظار نموذج الجهة" /><Kpi label="مستندات مولّدة هذا الشهر" value={214} spark={[142, 156, 171, 165, 188, 203, 214]} trend={5} /></div>
      <div className="mt-3 grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-8"><Table><thead><tr><Th>القالب</Th><Th>الإصدار الساري</Th><Th>المرجع</Th><Th>الحقول</Th><Th>آخر تحديث</Th><Th>مولّد به</Th><Th>الحالة</Th><Th></Th></tr></thead><tbody>{TEMPLATES.map(t => <tr key={t.id} className={cx('cursor-pointer hover:bg-ink-50', sel.id === t.id && 'bg-brand-50')} onClick={() => setSel(t)}><Td className="font-semibold">{t.name}</Td><Td><Code>{t.ver}</Code></Td><Td className="text-[12px]">{t.ref}</Td><Td className="text-[12px]">{t.fields}</Td><Td className="num whitespace-nowrap">{t.updated}</Td><Td className="num">{t.used ? t.used.toLocaleString('en-US') : '—'}</Td><Td><Badge tone={t.status === 'ساري' ? 'ok' : t.status === 'مسودة' ? 'warn' : 'neutral'} size="xs">{t.status}</Badge></Td><Td><button type="button" className="text-[11.5px] font-semibold text-brand-700 hover:underline" onClick={e => { e.stopPropagation(); setSel(t) }}>معاينة</button></Td></tr>)}</tbody></Table>
          <Section title="التوليد الشهري حسب القالب" desc="آخر 6 أشهر" className="mt-3" bodyClass="p-3"><Bars data={['أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر'].map((m, i) => ({ m, std: [128, 141, 156, 170, 189, 172][i], log: [14, 18, 22, 25, 28, 21][i], geo: [4, 5, 6, 7, 8, 5][i] }))} series={[{ key: 'std', label: 'نتيجة اختبار' }, { key: 'log', label: 'سجل جسة' }, { key: 'geo', label: 'تقرير جيوتقني' }]} height={170} stacked /></Section>
        </div>
        <div className="col-span-12 grid content-start gap-3 xl:col-span-4">
          <Section title={`معاينة — ${sel.name}`} desc={sel.ver} bodyClass="p-0" actions={<Button size="xs" variant="secondary" onClick={() => printHtml(`نموذج ${sel.name}`, `<h2>${sel.name} · ${sel.ver}</h2><p class="meta">معاينة قالب تقرير — بيانات تجريبية للتخطيط فقط.</p><table><tbody><tr><td>المشروع</td><td>مشروع تجريبي</td></tr><tr><td>الطريقة</td><td class="num">${sel.name}</td></tr><tr><td>النتيجة</td><td class="num">—</td></tr></tbody></table>`)}>PDF تجريبي</Button>}>
            <ol className="divide-y divide-ink-100">{sel.sections.map((x, i) => <li key={x} className="flex items-center gap-2.5 px-3 py-1.5 text-[12px]"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-700">{i + 1}</span><span>{x}</span></li>)}</ol>
            <div className="border-t border-ink-100 px-3 py-2"><KV cols={2} dense items={[{ k: 'المرجع', v: sel.ref }, { k: 'الحقول', v: sel.fields }, { k: 'آخر تحديث', v: sel.updated }, { k: 'مولّد به', v: sel.used ? `${sel.used.toLocaleString('en-US')} مستند` : 'لم يُستخدم' }]} /></div>
          </Section>
          <Section title="إصدارات القالب" bodyClass="p-0" actions={<Button size="xs" variant="secondary" icon={Plus} onClick={() => setNewV({ ver: sel.ver.replace(/(\d+)$/, m => String(+m + 1)), note: '', publish: false })}>إصدار جديد</Button>}><table className="w-full text-[12px]"><tbody>{(sel.history ?? [{ ver: sel.ver, date: sel.updated, note: '—', status: sel.status }]).map(h => <tr key={h.ver} className="border-b border-ink-100 last:border-0"><td className="px-3 py-1.5"><Code>{h.ver}</Code></td><td className="px-2 py-1.5"><div className="num">{h.date}</div><div className="meta">{h.note}</div></td><td className="px-3 py-1.5 text-end"><Badge tone={h.status === 'ساري' ? 'ok' : h.status === 'مسودة' ? 'warn' : 'neutral'} size="xs">{h.status}</Badge></td></tr>)}</tbody></table></Section>
        </div>
      </div>
    </>
  )
}

/* ───────── Accounts ───────── */
export function Accounts() {
  const orgs = useSel(s => s.orgs.filter(o => o.type !== 'ops'))
  const audit = useStore(s => s.audit)
  const cities = useStore(s => s.masters.cities)
  const addOrganization = useStore(s => s.addOrganization)
  const [newOrg, setNewOrg] = useState<null | { type: 'lab' | 'contractor' | 'consultant'; name: string; cr: string; city: string; phone: string; email: string; principal: string; mobile: string }>(null)
  const [savingOrg, setSavingOrg] = useState(false)
  const users = useStore(s => s.users)
  const setActive = useStore(s => s.setOrgActive)
  const [tab, setTab] = useState<'pending' | 'orgs' | 'users' | 'transfer'>('pending')
  const pending = useStore(s => s.pendingRegistrations)
  const activateRegistration = useStore(s => s.activateRegistration)
  const rejectRegistration = useStore(s => s.rejectRegistration)
  const orgOk = !!newOrg
    && newOrg.name.trim().length >= 3
    && isCommercialRegistration(newOrg.cr)
    && newOrg.city.trim().length >= 2
    && newOrg.principal.trim().length >= 3
    && isSaudiMobile(newOrg.mobile)
  const orgMissing = !newOrg ? [] : ([
    newOrg.name.trim().length < 3 && 'اسم المنشأة (٣ أحرف على الأقل)',
    !isCommercialRegistration(newOrg.cr) && 'السجل التجاري (١٠ أرقام)',
    newOrg.city.trim().length < 2 && 'المدينة',
    newOrg.principal.trim().length < 3 && 'اسم المفوّض الرئيسي',
    !isSaudiMobile(newOrg.mobile) && 'جوال المفوّض بصيغة 05xxxxxxxx',
  ] as const).filter(Boolean) as string[]
  const submitNewOrg = async () => {
    if (!newOrg || !orgOk) return
    setSavingOrg(true)
    try {
      await addOrganization({
        ...newOrg,
        cr: onlyDigits(newOrg.cr).slice(0, 10),
        mobile: normalizeSaudiMobile(newOrg.mobile),
        name: newOrg.name.trim(),
        principal: newOrg.principal.trim(),
      })
      setNewOrg(null)
      setTab('orgs')
    } finally {
      setSavingOrg(false)
    }
  }
  const orgCols: Column<Organization>[] = [
    { key: 'name', header: 'المنشأة', sortValue: o => o.name, exportValue: o => o.name, cell: o => <div><Link to={`/directory/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.name}</Link><div className="meta">{o.city} · منذ {o.since ?? '—'}</div></div> },
    { key: 'type', header: 'النوع', width: '110px', sortValue: o => o.type, cell: o => <Tag>{{ lab: 'مختبر', contractor: 'مقاول', consultant: 'استشاري', supervisor: 'جهة إشرافية', ops: '' }[o.type]}</Tag> },
    { key: 'cr', header: 'السجل التجاري', width: '120px', cell: o => <span className="ltr num text-[12px]">{o.cr}</span> },
    { key: 'users', header: 'المستخدمون', width: '100px', sortValue: o => users.filter(u => u.orgId === o.id).length, cell: o => <span className="num">{users.filter(u => u.orgId === o.id).length}</span> },
    { key: 'saac', header: 'اعتماد SAAC', cell: o => o.saac ? <Badge tone={new Date(o.saac.expires).getTime() - Date.now() < 120 * 864e5 ? 'warn' : 'ok'} size="xs"><ShieldCheck className="size-3" />{o.saac.number} · حتى {o.saac.expires}</Badge> : <span className="meta">—</span> },
    { key: 'dir', header: 'في الدليل', width: '100px', cell: o => <StatusPill code={o.active ? 'STS04' : 'STS05'} size="xs" /> },
    { key: 'act', header: 'الحساب', width: '120px', hideable: false, cell: o => <Toggle checked={o.active} onChange={v => setActive(o.id, v)} label={o.active ? 'فعّال' : 'موقوف'} /> },
  ]
  const userCols: Column<User>[] = [
    { key: 'name', header: 'المستخدم', sortValue: u => u.name, exportValue: u => u.name, cell: u => <span className="font-semibold">{u.name}</span> },
    { key: 'org', header: 'المنشأة', sortValue: u => u.orgName, cell: u => <span className="text-[12px]">{u.orgName}</span> },
    { key: 'role', header: 'الدور', width: '130px', sortValue: u => u.role, cell: u => <Tag>{ROLE_LABEL[u.role]}</Tag> },
    { key: 'pos', header: 'الصفة', width: '120px', cell: u => <span className="text-[12px]">{u.position === 'principal' ? 'المفوّض الرئيسي' : 'موظف'}</span> },
    { key: 'mobile', header: 'الجوال', width: '120px', cell: u => <span className="ltr num text-[12px]">{u.mobile}</span> },
    { key: 'del', header: 'صلاحية التفويض', width: '120px', cell: u => u.canDelegate ? <Badge tone="ok" size="xs">أصلية</Badge> : <span className="meta">—</span> },
    { key: 'last', header: 'آخر دخول', width: '120px', cell: u => <span className="meta">{u.lastLogin ? fmtDate(u.lastLogin) : '—'}</span> },
  ]
  return (
    <>
      <Modal open={!!newOrg} onClose={() => !savingOrg && setNewOrg(null)} title="إضافة منشأة يدوياً" sub="للحالات التي تعذّر فيها التسجيل الذاتي — التحقق من السجل والاعتماد يدوي (A.S.07)" width="md" footer={<><Button variant="secondary" onClick={() => setNewOrg(null)} disabled={savingOrg}>إلغاء</Button><Button disabled={!orgOk || savingOrg} loading={savingOrg} onClick={submitNewOrg}>إنشاء وتفعيل</Button></>}>
        {newOrg && (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نوع المنشأة" required><Select value={newOrg.type} onChange={e => setNewOrg({ ...newOrg, type: e.target.value as any })}><option value="lab">مختبر</option><option value="contractor">مقاول</option><option value="consultant">مكتب استشاري</option></Select></Field>
              <Field label="اسم المنشأة" required><Input value={newOrg.name} onChange={e => setNewOrg({ ...newOrg, name: e.target.value })} autoFocus /></Field>
              <Field label="السجل التجاري" required hint={`${onlyDigits(newOrg.cr).length}/10 أرقام`}><Input value={newOrg.cr} onChange={e => setNewOrg({ ...newOrg, cr: onlyDigits(e.target.value).slice(0, 10) })} className="ltr" inputMode="numeric" placeholder="1010xxxxxx" /></Field>
              <Field label="المدينة" required>
                {cities.length ? (
                  <Select value={newOrg.city} onChange={e => setNewOrg({ ...newOrg, city: e.target.value })}>
                    <option value="">اختر المدينة…</option>
                    {cities.filter(c => !c.isGroup).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </Select>
                ) : (
                  <Input value={newOrg.city} onChange={e => setNewOrg({ ...newOrg, city: e.target.value })} placeholder="الرياض" />
                )}
              </Field>
              <Field label="هاتف المنشأة"><Input value={newOrg.phone} onChange={e => setNewOrg({ ...newOrg, phone: e.target.value })} className="ltr" placeholder="+966 11 000 0000" /></Field>
              <Field label="البريد الرسمي"><Input value={newOrg.email} onChange={e => setNewOrg({ ...newOrg, email: e.target.value })} className="ltr" type="email" /></Field>
              <Field label="المفوّض الرئيسي" required><Input value={newOrg.principal} onChange={e => setNewOrg({ ...newOrg, principal: e.target.value })} /></Field>
              <Field label="جوال المفوّض" required hint="صيغة 05xxxxxxxx — يقبل 9665… أيضاً"><Input value={newOrg.mobile} onChange={e => setNewOrg({ ...newOrg, mobile: normalizeSaudiMobile(e.target.value) })} className="ltr" inputMode="tel" placeholder="05xxxxxxxx" /></Field>
            </div>
            {orgMissing.length > 0 && <Callout tone="warn" compact>أكمل: {orgMissing.join(' · ')}</Callout>}
          </div>
        )}
      </Modal>
      <PageHeader title="المنشآت والحسابات" sub="مراجعة طلبات التسجيل، إدارة حسابات المنشآت والمستخدمين، ونقل الصلاحيات — التحقق يدوي حتى توفر الربط الحكومي (A.S.07)" actions={<Button icon={Plus} onClick={() => setNewOrg({ type: 'lab', name: '', cr: '', city: cities.find(c => c.name === 'الرياض')?.name || cities.find(c => !c.isGroup)?.name || 'الرياض', phone: '', email: '', principal: '', mobile: '' })}>إضافة منشأة</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="طلبات تسجيل معلّقة" value={pending.length} tone="warn" icon={Users} /><Kpi label="منشآت فعّالة" value={orgs.filter(o => o.active).length} hint={`${orgs.filter(o => !o.active).length} موقوفة`} icon={Building2} tone="ok" /><Kpi label="المستخدمون" value={users.length} hint={`${users.filter(u => u.position === 'principal').length} مفوّض رئيسي`} /><Kpi label="اعتمادات تنتهي خلال 120 يوماً" value={orgs.filter(o => o.saac && new Date(o.saac.expires).getTime() - Date.now() < 120 * 864e5).length} tone="warn" icon={Shield} /></div>
      <div className="mt-3"><Tabs value={tab} onChange={setTab} items={[{ value: 'pending', label: 'طلبات التسجيل', count: pending.length }, { value: 'orgs', label: 'المنشآت', count: orgs.length }, { value: 'users', label: 'المستخدمون', count: users.length }, { value: 'transfer', label: 'نقل الصلاحيات' }]} /></div>
      <div className="mt-3">
        {tab === 'pending' && <Table><thead><tr><Th>الطلب</Th><Th>المنشأة</Th><Th>النوع</Th><Th>السجل التجاري</Th><Th>المفوّض الرئيسي</Th><Th>اعتماد SAAC</Th><Th>التاريخ</Th><Th></Th></tr></thead><tbody>{pending.map(p => <tr key={p.id} className="hover:bg-ink-50"><Td className="font-semibold text-brand-700">{p.id}</Td><Td>{p.name}<div className="meta">{p.city}</div></Td><Td><Tag>{ROLE_LABEL[p.type as 'lab']}</Tag></Td><Td><span className="ltr num text-[12px]">{p.cr}</span></Td><Td>{p.principal}</Td><Td>{p.saac ? <Badge tone="ok" size="xs"><Shield className="size-3" />{p.saac}</Badge> : <span className="meta">—</span>}</Td><Td className="num text-[12px]">{fmtDate(p.at)}</Td><Td><div className="flex gap-1"><Button size="xs" variant="success" icon={Check} onClick={() => activateRegistration(p.id)}>تفعيل</Button><Button size="xs" variant="ghost" className="text-danger-600" onClick={() => rejectRegistration(p.id)}>رفض</Button></div></Td></tr>)}{pending.length === 0 && <tr><Td colSpan={8} className="text-center text-ink-500">لا توجد طلبات معلقة</Td></tr>}</tbody></Table>}
        {tab === 'orgs' && <DataTable rows={orgs} columns={orgCols} rowKey={o => o.id} searchable={o => `${o.name} ${o.cr} ${o.city}`} exportName="organizations" filters={[{ key: 'type', label: 'النوع', options: [{ value: 'lab', label: 'مختبر' }, { value: 'contractor', label: 'مقاول' }, { value: 'consultant', label: 'استشاري' }], match: (o, v) => o.type === v }, { key: 'city', label: 'المدينة', options: [...new Set(orgs.map(o => o.city))].map(c => ({ value: c, label: c })), match: (o, v) => o.city === v }]} />}
        {tab === 'users' && <DataTable rows={users} columns={userCols} rowKey={u => u.id} searchable={u => `${u.name} ${u.orgName} ${u.mobile}`} exportName="users" filters={[{ key: 'role', label: 'الدور', options: Object.entries(ROLE_LABEL).filter(([k]) => k !== 'visitor').map(([v, l]) => ({ value: v, label: l })), match: (u, v) => u.role === v }]} />}
        {tab === 'transfer' && <Section title="طلب نقل صلاحيات المفوّض الرئيسي" bodyClass="p-3"><p className="text-[13px] text-ink-600">لا توجد طلبات نقل صلاحيات معلّقة على الخادم.</p><Callout tone="info" compact className="mt-3">نقل الصلاحيات إجراء رسمي يتطلب مستنداً معتمداً ومراجعة الدعم التقني، ويُثبَّت بـ OTP للطرفين ويُسجَّل حدثاً حرجاً.</Callout></Section>}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="اعتمادات SAAC تنتهي قريباً" desc="خلال 120 يوماً" bodyClass="p-0"><table className="w-full text-[12px]"><tbody>{orgs.filter(o => o.saac).sort((x, y) => x.saac!.expires.localeCompare(y.saac!.expires)).slice(0, 5).map(o => { const days = Math.round((new Date(o.saac!.expires).getTime() - Date.now()) / 864e5); return <tr key={o.id} className="border-b border-ink-100 last:border-0"><td className="px-3 py-1.5"><Link to={`/directory/${o.id}`} className="font-medium hover:underline">{o.name}</Link><div className="ltr meta text-start">{o.saac!.number}</div></td><td className="num px-2 py-1.5 text-ink-600">{o.saac!.expires}</td><td className="px-3 py-1.5 text-end"><Badge tone={days < 120 ? 'warn' : 'ok'} size="xs">{days < 0 ? 'منتهٍ' : `${days} يوم`}</Badge></td></tr> })}</tbody></table></Section>
        <Section title="آخر قرارات الحسابات" desc="من سجل التدقيق" bodyClass="p-0"><ul className="divide-y divide-ink-100">{audit.filter(a => a.entity === 'account' || a.entity === 'rating').slice(0, 5).map(a => <li key={a.id} className="px-3 py-1.5 text-[12px]"><div className="flex items-center justify-between"><span className="font-medium">{a.action}</span><span className="meta">{fmtDate(a.at)}</span></div><div className="truncate text-ink-600">{a.entityId} · {a.actor}</div></li>)}</ul></Section>
        <Section title="توزيع المنشآت" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]">{[['مختبرات', orgs.filter(o => o.type === 'lab').length, 'bg-brand-500'], ['مقاولون', orgs.filter(o => o.type === 'contractor').length, 'bg-info-500'], ['مكاتب استشارية', orgs.filter(o => o.type === 'consultant').length, 'bg-warn-500'], ['موقوفة', orgs.filter(o => !o.active).length, 'bg-danger-500']].map(([l, n, c]: any) => <li key={l} className="flex items-center gap-2"><span className="w-28 text-ink-700">{l}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full rounded-full', c)} style={{ width: `${(n / Math.max(1, orgs.length)) * 100}%` }} /></div><span className="num w-6 text-end font-semibold">{n}</span></li>)}</ul><p className="meta mt-2">التحقق من الاعتماد يدوي حتى توفر الربط مع المركز السعودي للاعتماد.</p></Section>
      </div>
    </>
  )
}

/* ───────── Ratings moderation ───────── */
export function RatingsModeration() {
  const ratings = useStore(s => s.ratings)
  const orgs = useStore(s => s.orgs)
  const moderate = useStore(s => s.moderateRating)
  const user = useStore(s => s.user)!
  const avg = (r: Rating) => (r.quality + r.punctuality + r.communication) / 3
  const cols: Column<Rating>[] = [
    { key: 'lab', header: 'المختبر', sortValue: r => orgs.find(o => o.id === r.labId)?.name ?? '', cell: r => <Link to={`/directory/${r.labId}`} className="font-semibold text-brand-700 hover:underline">{orgs.find(o => o.id === r.labId)?.name}</Link> },
    { key: 'by', header: 'المقاول', cell: r => <span className="text-[12px]">{orgs.find(o => o.id === r.contractorId)?.name}</span> },
    { key: 'contract', header: 'العقد', width: '120px', cell: r => <span className="text-[12px]">{r.contractId}</span> },
    { key: 'score', header: 'التقييم', width: '150px', sortValue: r => avg(r), cell: r => <div className="flex items-center gap-1"><Stars value={avg(r)} /><span className="num text-[12px] font-semibold">{avg(r).toFixed(1)}</span></div> },
    { key: 'comment', header: 'التعليق', cell: r => <span className="text-[12px]">{r.comment}</span> },
    { key: 'at', header: 'التاريخ', width: '110px', sortValue: r => r.createdAt, cell: r => <span className="num text-[12px]">{fmtDate(r.createdAt)}</span> },
    { key: 'status', header: 'الحالة', width: '100px', cell: r => <StatusPill code={r.status} size="xs" /> },
    { key: 'act', header: '', width: '150px', hideable: false, cell: r => <div className="flex gap-1">{r.status === 'STS06' ? <Button size="xs" variant="ghost" icon={EyeOff} onClick={() => moderate(r.id, 'STS07')}>إخفاء</Button> : r.status === 'STS07' && <Button size="xs" variant="ghost" icon={Eye} onClick={() => moderate(r.id, 'STS06')}>إظهار</Button>}{user.role === 'admin' && r.status !== 'STS08' && <Button size="xs" variant="ghost" icon={Trash2} className="text-danger-600" onClick={() => moderate(r.id, 'STS08')}>حذف</Button>}</div> },
  ]
  return (
    <>
      <PageHeader title="مراجعة التقييمات" sub={user.role === 'support' ? 'الدعم التقني يخفي التقييمات في الحالات الخاصة؛ الحذف صلاحية مدير النظام' : 'إخفاء أو حذف التقييمات في الحالات الخاصة — ترتيب الدليل يتحدّث تلقائياً (B.R.128–129)'} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="إجمالي التقييمات" value={ratings.length} icon={Star} /><Kpi label="معتمدة" value={ratings.filter(r => r.status === 'STS06').length} tone="ok" /><Kpi label="مخفية / محذوفة" value={ratings.filter(r => r.status !== 'STS06').length} tone="warn" /><Kpi label="تقييمات منخفضة (≤ 2)" value={ratings.filter(r => avg(r) <= 2).length} tone="danger" hint="تحتاج مراجعة" /></div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="توزيع التقييمات" desc="حسب المتوسط" bodyClass="p-3"><ul className="grid gap-1.5">{[5, 4, 3, 2, 1].map(st => { const n = ratings.filter(r => Math.round(avg(r)) === st).length; return <li key={st} className="flex items-center gap-2 text-[12px]"><span className="num w-6 text-warn-600">★ {st}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full rounded-full', st >= 4 ? 'bg-ok-500' : st === 3 ? 'bg-warn-500' : 'bg-danger-500')} style={{ width: `${(n / Math.max(1, ratings.length)) * 100}%` }} /></div><span className="num w-6 text-end font-semibold">{n}</span></li> })}</ul><p className="meta mt-2">المتوسط العام <b className="num">{(ratings.reduce((a, r) => a + avg(r), 0) / Math.max(1, ratings.length)).toFixed(2)}</b> من 5 · معايير: الجودة، الالتزام، التواصل</p></Section>
        <Section title="متوسط التقييم حسب المختبر" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]">{Object.entries(ratings.reduce<Record<string, number[]>>((a, r) => { (a[r.labId] ??= []).push(avg(r)); return a }, {})).map(([id, v]) => [id, v.reduce((x, y) => x + y, 0) / v.length, v.length] as const).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([id, m, n]) => <li key={id} className="flex items-center gap-2"><span className="w-36 truncate text-ink-700">{orgs.find(o => o.id === id)?.name}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(m / 5) * 100}%` }} /></div><span className="num w-16 shrink-0 text-end"><b>{m.toFixed(1)}</b> <span className="meta">({n})</span></span></li>)}</ul></Section>
        <Section title="سياسة الإشراف على التقييمات" bodyClass="p-3"><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['التقييم متاح للمقاول مرة واحدة لكل عقد منتهٍ (B.R.124)', 'يُحسب ترتيب الدليل بمتوسط التقييم ثم عدد المراجعات (B.R.127)', 'الدعم التقني يُخفي التقييم المسيء أو المخالف مع تسجيل السبب', 'الحذف النهائي صلاحية مدير النظام فقط ويُسجَّل كحدث تحذيري', 'المختبر يرى التقييم ولا يستطيع الرد عليه في المرحلة الأولى'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></Section>
      </div>
      <div className="mt-3"><DataTable rows={ratings} columns={cols} rowKey={r => r.id} searchable={r => `${orgs.find(o => o.id === r.labId)?.name} ${r.comment}`} exportName="ratings" defaultSort={{ key: 'at', dir: 'desc' }} filters={[{ key: 'st', label: 'الحالة', options: [{ value: 'STS06', label: 'معتمد' }, { value: 'STS07', label: 'مخفي' }, { value: 'STS08', label: 'محذوف' }], match: (r, v) => r.status === v }, { key: 'low', label: 'المستوى', options: [{ value: 'low', label: '≤ 2 نجوم' }, { value: 'high', label: '≥ 4 نجوم' }], match: (r, v) => v === 'low' ? avg(r) <= 2 : avg(r) >= 4 }]} rowClass={r => r.status !== 'STS06' ? 'opacity-60' : ''} /></div>
    </>
  )
}

/* ───────── Contracts ───────── */
export function Contracts() {
  const user = useStore(s => s.user)!
  const contracts = useSel(s => s.contracts.filter(c => user.role === 'admin' || user.role === 'supervisor' || user.role === 'support' || c.contractorId === user.orgId || c.labId === user.orgId || c.consultantId === user.orgId))
  const orgs = useStore(s => s.orgs)
  const requests = useStore(s => s.requests)
  const invoices = useStore(s => s.invoices)
  const documents = useStore(s => s.documents)
  const ratings = useStore(s => s.ratings)
  const [open, setOpen] = useState<Contract | null>(null)
  const org = (id: string) => orgs.find(o => o.id === id)?.name ?? id
  const reqsOf = (c: Contract) => requests.filter(r => r.contractId === c.id && r.status !== 'STS09')
  const value = (c: Contract) => reqsOf(c).reduce((a, r) => a + r.tests.reduce((b, t) => b + t.price, 0), 0)
  const doneOf = (c: Contract) => reqsOf(c).filter(r => r.status === 'STS15').length
  const onTime = (c: Contract) => { const t = reqsOf(c).flatMap(r => r.tests).filter(t => t.decidedAt); if (!t.length) return null; return Math.round((t.filter(t => !t.autoApproved).length / t.length) * 100) }
  const cols: Column<Contract>[] = [
    { key: 'id', header: 'العقد', width: '130px', sortValue: c => c.id, exportValue: c => c.id, cell: c => <button type="button" onClick={() => setOpen(c)} className="whitespace-nowrap font-semibold text-brand-700 hover:underline">{c.id}</button> },
    { key: 'project', header: 'المشروع', sortValue: c => c.project, exportValue: c => c.project, cell: c => <span className="block min-w-56 font-medium">{c.project}</span> },
    { key: 'contractor', header: 'المقاول', defaultHidden: user.role === 'contractor', cell: c => <span className="block max-w-40 truncate text-[12px]">{org(c.contractorId)}</span> },
    { key: 'lab', header: 'المختبر', defaultHidden: user.role === 'lab', cell: c => <span className="block max-w-40 truncate whitespace-nowrap text-[12px]">{org(c.labId)}</span> },
    { key: 'cons', header: 'الاستشاري', defaultHidden: true, cell: c => <span className="block max-w-40 truncate text-[12px]">{org(c.consultantId)}</span> },
    { key: 'services', header: 'الخدمات', width: '150px', cell: c => <div className="flex gap-1 whitespace-nowrap">{c.services.map(s => <Tag key={s}>{s === 'geotech' ? 'جيوتقنية' : 'قياسية'}</Tag>)}</div> },
    { key: 'pay', header: 'الدفع', width: '100px', cell: c => <span className="whitespace-nowrap text-[12px]">{c.payment === 'advance' ? 'مقدّم' : 'عند الإتمام'}</span> },
    { key: 'reqs', header: 'الطلبات', width: '130px', sortValue: c => reqsOf(c).length, cell: c => <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${reqsOf(c).length ? (doneOf(c) / reqsOf(c).length) * 100 : 0}%` }} /></div><span className="num text-[11.5px] text-ink-600">{doneOf(c)}/{reqsOf(c).length}</span></div> },
    { key: 'value', header: 'القيمة', width: '110px', align: 'end', sortValue: c => value(c), exportValue: c => value(c), cell: c => <span className="num whitespace-nowrap font-semibold">{fmtSAR(value(c))}</span> },
    { key: 'ontime', header: 'الاعتماد بلا مهلة', width: '120px', sortValue: c => onTime(c) ?? -1, cell: c => { const v = onTime(c); return v == null ? <span className="meta">—</span> : <span className={cx('num font-semibold', v >= 90 ? 'text-ok-600' : 'text-warn-600')}>{v}%</span> } },
    { key: 'start', header: 'البدء', width: '120px', sortValue: c => c.startedAt, cell: c => <span className="num whitespace-nowrap text-[12px]">{fmtDate(c.startedAt)}</span> },
    { key: 'status', header: 'الحالة', width: '90px', cell: c => <Badge tone={c.active ? 'ok' : 'neutral'} dot size="xs">{c.active ? 'فعّال' : 'منتهٍ'}</Badge> },
    { key: 'act', header: '', width: '80px', hideable: false, cell: c => <Button size="xs" variant="ghost" onClick={() => setOpen(c)}>التفاصيل</Button> },
  ]
  const total = contracts.reduce((a, c) => a + value(c), 0)
  const oReqs = open ? reqsOf(open) : []
  const oInv = open ? invoices.filter(i => i.contractId === open.id) : []
  const oDocs = open ? documents.filter(d => d.contractId === open.id) : []
  const oRating = open ? ratings.find(r => r.contractId === open.id) : undefined
  return (
    <>
      <PageHeader title="العقود" sub="العقود الإلكترونية الفعّالة والسابقة — طلبات الاختبارات تُنشأ على العقود الفعّالة فقط (B.R.132)" actions={user.role === 'contractor' && <Link to="/quotes"><Button icon={Plus}>عقد جديد عبر عرض سعر</Button></Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="عقود فعّالة" value={contracts.filter(c => c.active).length} tone="ok" icon={FileText} /><Kpi label="منتهية" value={contracts.filter(c => !c.active).length} hint={`${contracts.filter(c => !c.active && !ratings.some(r => r.contractId === c.id)).length} بانتظار التقييم`} /><Kpi label="تشمل دراسة جيوتقنية" value={contracts.filter(c => c.services.includes('geotech')).length} /><Kpi label="إجمالي قيمة الطلبات" value={(total / 1000).toFixed(0)} unit="ألف ر.س" /><Kpi label="طلبات على العقود" value={contracts.reduce((a, c) => a + reqsOf(c).length, 0)} hint={`${contracts.reduce((a, c) => a + doneOf(c), 0)} مكتمل`} /></div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="توزيع القيمة حسب العقد" bodyClass="p-3"><ul className="grid gap-1.5">{[...contracts].sort((x, y) => value(y) - value(x)).slice(0, 5).map(c => <li key={c.id} className="flex items-center gap-2 text-[12px]"><button type="button" onClick={() => setOpen(c)} className="w-28 truncate text-start font-medium text-brand-700 hover:underline">{c.id}</button><div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full rounded-full', c.active ? 'bg-brand-500' : 'bg-ink-400')} style={{ width: `${total ? (value(c) / total) * 100 : 0}%` }} /></div><span className="num w-20 text-end font-semibold">{fmtSAR(value(c))}</span></li>)}</ul></Section>
        <Section title="الأطراف الأكثر تعاملاً" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]">{Object.entries(contracts.reduce<Record<string, number>>((a, c) => { const k = user.role === 'lab' ? c.contractorId : c.labId; a[k] = (a[k] ?? 0) + 1; return a }, {})).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([id, n]) => <li key={id} className="flex items-center justify-between gap-2"><Link to={`/directory/${id}`} className="truncate font-medium hover:underline">{org(id)}</Link><span className="num shrink-0 text-ink-600">{n} عقود · <span className="text-warn-600">★ {orgs.find(o => o.id === id)?.rating.toFixed(1) ?? '—'}</span></span></li>)}</ul></Section>
        <Section title="قواعد التعاقد" bodyClass="p-3"><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['العقد يبدأ بعرض سعر معتمد من المختبر والمقاول والاستشاري المشرف', 'الطلبات تُنشأ على العقود الفعّالة فقط (B.R.132)', 'آلية الدفع (مقدّم / عند الإتمام) تحدد توقيت الفاتورة', 'شهادة الإتمام تصدر بعد اعتماد كل المخرجات وتقييم المختبر', 'أسعار العقد ثابتة — تعديل القائمة لا يؤثر عليه (B.R.115)'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></Section>
      </div>
      <div className="mt-3"><DataTable rows={contracts} columns={cols} rowKey={c => c.id} onRowClick={c => setOpen(c)} searchable={c => `${c.id} ${c.project} ${org(c.labId)} ${org(c.contractorId)}`} exportName="contracts" filters={[{ key: 'st', label: 'الحالة', options: [{ value: 'active', label: 'فعّال' }, { value: 'ended', label: 'منتهٍ' }], match: (c, v) => v === 'active' ? c.active : !c.active }, { key: 'svc', label: 'الخدمة', options: [{ value: 'geotech', label: 'جيوتقنية' }, { value: 'standard', label: 'قياسية' }], match: (c, v) => c.services.includes(v as any) }]} /></div>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `العقد ${open.id}` : ''} sub={open?.project} width="w-[600px]" footer={open && <><Button variant="secondary" icon={FileText} onClick={() => printHtml(`عقد ${open.id}`, `
        <h2>${open.project}</h2>
        <div class="row"><span>رقم العقد</span><span class="num">${open.id}</span></div>
        <div class="row"><span>المقاول</span><span>${org(open.contractorId)}</span></div>
        <div class="row"><span>المختبر</span><span>${org(open.labId)}</span></div>
        <div class="row"><span>الاستشاري</span><span>${org(open.consultantId)}</span></div>
        <div class="row"><span>المدينة</span><span>${open.city || '—'}</span></div>
        <div class="row"><span>الحالة</span><span>${open.active ? 'فعّال' : 'منتهٍ'}</span></div>
        <div class="row"><span>آلية الدفع</span><span>${open.payment === 'advance' ? 'مقدّم' : 'عند الإتمام'}</span></div>
        <div class="row"><span>الخدمات</span><span>${(open.services || []).join(' · ')}</span></div>
      `)}>نسخة العقد PDF</Button>{(user.role === 'contractor' || user.role === 'admin') && open.active && <Link to="/requests/new"><Button icon={Plus}>طلب اختبار على هذا العقد</Button></Link>}{user.role === 'contractor' && !open.active && !oRating && <Link to={`/directory/${open.labId}`}><Button icon={Star}>تقييم المختبر</Button></Link>}</>}>
        {open && <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2"><Kpi label="الطلبات" value={oReqs.length} hint={`${doneOf(open)} مكتمل`} /><Kpi label="القيمة" value={(value(open) / 1000).toFixed(1)} unit="ألف ر.س" /><Kpi label="الحالة" value={<span className="text-[14px]">{open.active ? 'فعّال' : 'منتهٍ'}</span>} tone={open.active ? 'ok' : 'neutral'} hint={`منذ ${fmtDate(open.startedAt)}`} /></div>
          <Section title="الأطراف والشروط" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'المقاول', v: <Link to={`/directory/${open.contractorId}`} className="hover:underline">{org(open.contractorId)}</Link> }, { k: 'المختبر', v: <Link to={`/directory/${open.labId}`} className="hover:underline">{org(open.labId)}</Link> }, { k: 'الاستشاري المشرف', v: org(open.consultantId) }, { k: 'الخدمات', v: open.services.map(s => s === 'geotech' ? 'دراسة جيوتقنية' : 'اختبارات قياسية').join(' · ') }, { k: 'آلية الدفع', v: open.payment === 'advance' ? 'دفع مقدّم عند القبول' : 'عند الإتمام' }, { k: 'التقييم', v: oRating ? <span className="text-warn-600">★ {((oRating.quality + oRating.punctuality + oRating.communication) / 3).toFixed(1)}</span> : open.active ? 'بعد انتهاء العقد' : <span className="text-warn-700">مطلوب</span> }]} /></Section>
          <Section title={`الطلبات على العقد (${oReqs.length})`} bodyClass="p-0"><table className="w-full text-[12px]"><tbody>{oReqs.slice(0, 8).map(r => <tr key={r.id} className="border-b border-ink-100 last:border-0"><td className="px-3 py-1.5"><Link to={`/requests/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.id}</Link></td><td className="px-2 py-1.5 text-ink-600">{r.service === 'geotech' ? 'دراسة جيوتقنية' : `${r.tests.length} اختبارات`}</td><td className="num px-2 py-1.5">{fmtSAR(r.tests.reduce((a, t) => a + t.price, 0))}</td><td className="px-3 py-1.5 text-end"><StatusPill code={r.status} size="xs" /></td></tr>)}</tbody></table>{oReqs.length > 8 && <p className="meta px-3 py-2">+{oReqs.length - 8} طلبات أخرى — <Link to="/requests" className="text-brand-700 underline">عرض الكل</Link></p>}</Section>
          <div className="grid gap-3 sm:grid-cols-2">
            <Section title={`الفواتير (${oInv.length})`} bodyClass="p-3"><ul className="grid gap-1 text-[12px]">{oInv.slice(0, 5).map(i => <li key={i.id} className="flex items-center justify-between"><Link to="/invoices" className="font-medium text-brand-700 hover:underline">{i.id}</Link><span className="num">{fmtSAR(i.amount + i.vat)}</span><Badge tone={i.status === 'paid' ? 'ok' : i.status === 'overdue' ? 'danger' : i.status === 'due' ? 'warn' : 'neutral'} size="xs">{{ paid: 'مسددة', due: 'مستحقة', overdue: 'متأخرة', draft: 'مسودة' }[i.status]}</Badge></li>)}{oInv.length === 0 && <li className="meta">تصدر الفاتورة الأولى عند قبول أول طلب</li>}</ul></Section>
            <Section title={`المستندات (${oDocs.length})`} bodyClass="p-3"><ul className="grid gap-1 text-[12px]">{oDocs.slice(0, 5).map(d => <li key={d.id} className="flex items-center gap-2"><FileText className="size-3.5 shrink-0 text-brand-600" /><span className="truncate">{d.name}</span></li>)}</ul><Link to="/archive" className="meta mt-2 block text-brand-700 underline">الأرشيف الكامل</Link></Section>
          </div>
        </div>}
      </Drawer>
    </>
  )
}

/* ───────── Results & certificates (contractor) ───────── */
export function Results() {
  const user = useStore(s => s.user)!
  const requests = useSel(s => s.requests.filter(r => r.contractorId === user.orgId))
  const refTests = useStore(s => s.refTests)
  const ratings = useStore(s => s.ratings)
  const contracts = useStore(s => s.contracts)
  const rows = requests.flatMap(r => r.tests.filter(t => ['STS20', 'STS21'].includes(t.status)).map(t => ({ r, t })))
  type Row = typeof rows[number]
  const cols: Column<Row>[] = [
    { key: 'req', header: 'الطلب', width: '130px', sortValue: x => x.r.id, cell: x => <Link to={`/requests/${x.r.id}`} className="font-semibold text-brand-700 hover:underline">{x.r.id}</Link> },
    { key: 'project', header: 'المشروع', width: '220px', cell: x => <span className="block max-w-56 truncate text-[12px]">{x.r.project}</span> },
    { key: 'test', header: 'الاختبار', sortValue: x => refTests.find(t => t.id === x.t.refTestId)?.nameAr ?? '', cell: x => <span className="whitespace-nowrap font-medium">{refTests.find(t => t.id === x.t.refTestId)?.nameAr}</span> },
    { key: 'method', header: 'الطريقة', width: '110px', cell: x => <Code>{x.t.method}</Code> },
    { key: 'result', header: 'النتيجة', cell: x => <div className="flex flex-wrap gap-1">{x.t.result ? Object.entries(x.t.result).map(([k, v]) => { const f = refTests.find(t => t.id === x.t.refTestId)?.resultFields?.find(f => f.key === k); return <span key={k} className="whitespace-nowrap rounded-xs bg-ink-50 px-1.5 py-0.5 text-[11px]"><span className="text-ink-500">{f?.label.split(' ')[0] ?? k}</span> <b className="num">{v}</b> <span className="text-ink-400">{f?.unit}</span></span> }) : <span className="meta">تقرير مرفق</span>}</div> },
    { key: 'report', header: 'التقرير', width: '90px', cell: x => x.t.report ? <Button size="xs" variant="ghost" icon={FileText} onClick={() => openFile(x.t.report?.file)}>PDF</Button> : <span className="meta">—</span> },
    { key: 'status', header: 'القرار', width: '130px', cell: x => <div className="flex items-center gap-1 whitespace-nowrap"><StatusPill code={x.t.status} size="xs" />{x.t.autoApproved && <Badge tone="warn" size="xs">تلقائي</Badge>}</div> },
    { key: 'at', header: 'التاريخ', width: '120px', sortValue: x => x.t.decidedAt ?? '', cell: x => <span className="num whitespace-nowrap text-[12px]">{fmtDate(x.t.decidedAt)}</span> },
  ]
  return (
    <>
      <PageHeader title="النتائج والشهادات" sub="المخرجات المعتمدة والمرفوضة وشهادات إتمام الاختبارات لكل عقد" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="مخرجات معتمدة" value={rows.filter(x => x.t.status === 'STS20').length} tone="ok" /><Kpi label="مرفوضة" value={rows.filter(x => x.t.status === 'STS21').length} tone="danger" /><Kpi label="اعتماد تلقائي" value={rows.filter(x => x.t.autoApproved).length} tone="warn" /><Kpi label="شهادات إتمام" value={contracts.filter(c => c.contractorId === user.orgId && !c.active).length} hint="عقود منتهية" /></div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2"><Section title="شهادات إتمام الاختبارات" icon={ShieldCheck} bodyClass="p-3"><ul className="grid gap-2 sm:grid-cols-2">{contracts.filter(c => c.contractorId === user.orgId && !c.active).map(c => { const rated = ratings.some(x => x.contractId === c.id && x.contractorId === user.orgId); return <li key={c.id} className="rounded-sm border border-ink-200 p-2.5 text-[12.5px]"><div className="font-semibold">{c.project}</div><div className="meta">{c.id} — انتهى {fmtDate(c.startedAt)}</div><div className="mt-2">{rated ? <Button size="xs" variant="secondary" icon={FileText} onClick={async () => { try { const res = await call<{ file?: string }>('miyar.api.write.download_completion_certificate', { contract: c.id }); if (res?.file) openFile(res.file); else useStore.getState().toast({ title: 'تعذّر التحميل', body: 'لم يُرجع الخادم ملفاً.', tone: 'danger' }) } catch (e) { useStore.getState().toast({ title: 'تعذّر تحميل الشهادة', body: e instanceof Error ? e.message : 'تحقق من التقييم والفوترة.', tone: 'danger' }) } }}>تحميل الشهادة</Button> : <Link to={`/directory/${c.labId}`} className="text-[11.5px] font-semibold text-warn-700 underline">قيّم المختبر أولاً لتحميل الشهادة</Link>}</div></li> })}</ul></Section></div>
        <Section title="ملخص القرارات حسب الاختبار" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]">{Object.entries(rows.reduce<Record<string, [number, number]>>((a, x) => { const k = refTests.find(t => t.id === x.t.refTestId)?.nameAr ?? x.t.refTestId; a[k] ??= [0, 0]; a[k][x.t.status === 'STS20' ? 0 : 1]++; return a }, {})).sort((p, q) => (q[1][0] + q[1][1]) - (p[1][0] + p[1][1])).slice(0, 6).map(([k, [ok, rej]]) => <li key={k} className="flex items-center gap-2"><span className="w-32 truncate text-ink-700">{k}</span><div className="flex h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className="h-full bg-ok-500" style={{ width: `${(ok / (ok + rej)) * 100}%` }} /><div className="h-full bg-danger-500" style={{ width: `${(rej / (ok + rej)) * 100}%` }} /></div><span className="num w-12 shrink-0 text-end text-ink-600">{ok}/{ok + rej}</span></li>)}</ul><p className="meta mt-2">أخضر: معتمد · أحمر: مرفوض — الرفض يتيح طلب إعادة الاختبار بمهلة جديدة.</p></Section>
      </div>
      <div className="mt-3"><DataTable rows={rows} columns={cols} rowKey={x => x.t.id} searchable={x => `${x.r.id} ${x.r.project}`} exportName="results" defaultSort={{ key: 'at', dir: 'desc' }} filters={[{ key: 'st', label: 'القرار', options: [{ value: 'STS20', label: 'معتمد' }, { value: 'STS21', label: 'مرفوض' }], match: (x, v) => x.t.status === v }]} /></div>
    </>
  )
}
