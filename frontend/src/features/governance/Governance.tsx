import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ScrollText, ShieldCheck, AlertTriangle, Gavel, FileText, Download, Archive, Receipt, Wallet, Clock, CheckCircle2, Lock, Eye, BarChart3, Printer, Plus } from 'lucide-react'
import { useStore, useSel, visibleRequests } from '@/lib/store'
import { PageHeader } from '@/ds/composite'
import { Kpi, Section, Badge, Button, Tabs, Table, Th, Td, Code, KV, Tag, Callout, Progress, Segmented, Modal, Field, Input, Select, cx } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { TimeArea, Bars, Donut, RankBars, TimeLine, STATUS_FILL, SERIES } from '@/ds/charts'
import { fmtDate, fmtTime, fmtDateTime, fmtSAR, ago } from '@/lib/format'
import { ROLE_LABEL, MATRIX_ROWS, MATRIX_COLS, can } from '@/lib/roles'
import type { AuditEvent, Document, Invoice, Policy, Role } from '@/lib/types'
import { downloadCsv, printHtml, openFile, downloadUrl } from '@/lib/files'

const SEV: Record<AuditEvent['severity'], { t: 'neutral' | 'info' | 'warn' | 'danger'; l: string }> = { info: { t: 'neutral', l: 'معلومة' }, notice: { t: 'info', l: 'إشعار' }, warning: { t: 'warn', l: 'تنبيه' }, critical: { t: 'danger', l: 'حرج' } }

/* ───────── Governance: audit log + compliance + policies ───────── */
export function GovernancePage({ initial = 'audit' }: { initial?: 'audit' | 'compliance' | 'policies' | 'access' }) {
  const user = useStore(s => s.user)!
  const monitor = useStore(s => s.can)('monitor.view')
  // Parties see their own organisation's trail (B.R.158); the supervising body, admin and support see the platform-wide log
  const audit = useSel(s => monitor ? s.audit : s.audit.filter(a => a.org === user.orgName))
  const policies = useStore(s => s.policies)
  const requests = useStore(s => s.requests)
  const orgs = useStore(s => s.orgs)
  const [tab, setTab] = useState<'audit' | 'compliance' | 'policies' | 'access'>(initial)
  // /governance and /governance/policies share one route element — follow the URL when it changes, not only on first mount
  useEffect(() => { setTab(initial) }, [initial])
  const nav = useNavigate()
  // Keep the URL (and the sidebar highlight) in step with the tab the user picks
  const pickTab = (t: typeof tab) => { setTab(t); nav(t === 'policies' ? '/governance/policies' : '/governance', { replace: true }) }
  const critical = audit.filter(a => a.severity === 'critical')
  const autoApprovals = requests.flatMap(r => r.tests).filter(t => t.autoApproved).length
  const cols: Column<AuditEvent>[] = [
    { key: 'id', header: 'الحدث', width: '100px', sortValue: a => a.id, cell: a => <span className="font-mono text-[11px] text-ink-600">{a.id}</span> },
    { key: 'at', header: 'الوقت', width: '150px', sortValue: a => a.at, exportValue: a => fmtDateTime(a.at), cell: a => <div className="whitespace-nowrap"><div className="num text-[12px]">{fmtDate(a.at)}</div><div className="meta">{fmtTime(a.at)} · {ago(a.at)}</div></div> },
    { key: 'actor', header: 'المنفّذ', sortValue: a => a.actor, exportValue: a => a.actor, cell: a => <div><div className="font-semibold">{a.actor}</div><div className="meta">{ROLE_LABEL[a.role]} · {a.org}</div></div> },
    { key: 'action', header: 'الإجراء', sortValue: a => a.action, exportValue: a => a.action, cell: a => <span className="font-medium">{a.action}</span> },
    { key: 'entity', header: 'الكيان', cell: a => <span className="flex items-center gap-1"><Tag>{a.entity}</Tag><span className="font-mono text-[11px] text-brand-700">{a.entityId}</span></span> },
    { key: 'ip', header: 'العنوان', width: '120px', defaultHidden: true, cell: a => <span className="ltr font-mono text-[11px]">{a.ip}</span> },
    { key: 'sev', header: 'الخطورة', width: '90px', sortValue: a => ({ info: 0, notice: 1, warning: 2, critical: 3 }[a.severity]), cell: a => <Badge tone={SEV[a.severity].t} size="xs" dot>{SEV[a.severity].l}</Badge> },
  ]
  const controls = [['1', 'حوكمة الأمن السيبراني', 22, 20], ['2', 'تعزيز الأمن السيبراني', 46, 41], ['3', 'صمود الأمن السيبراني', 12, 12], ['4', 'الأطراف الثالثة والحوسبة السحابية', 28, 24]]
  return (
    <>
      <PageHeader title="الحوكمة وسجل التدقيق" sub="كل إجراء في المنصة مسجَّل بالمنفّذ والدور والوقت وعنوان الجهاز ولا يمكن تعديله — الحوكمة تشمل المهل، الاعتماد التلقائي، السياسات المُصدَّرة، والامتثال لضوابط NCA" actions={<Button variant="secondary" icon={Download} onClick={() => downloadCsv('governance-audit', ['الوقت', 'المنفّذ', 'الدور', 'الإجراء', 'الكيان', 'المنشأة', 'الخطورة'], audit.map(a => [a.at, a.actor, a.role, a.action, a.entityId, a.org, a.severity]))}>تصدير تقرير الحوكمة</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Kpi label="أحداث التدقيق" value={audit.length} hint={monitor ? 'على مستوى المنصة · آخر 40 يوماً' : `منشأتك — ${user.orgName}`} icon={ScrollText} /><Kpi label="أحداث حرجة" value={critical.length} tone={critical.length ? 'danger' : 'ok'} icon={AlertTriangle} hint="تعديل قواعد · قاعدة معرفة · وصول مرفوض" /><Kpi label="اعتمادات تلقائية" value={autoApprovals} tone="warn" hint="مخرجات اعتُمدت بانتهاء المهلة" icon={Clock} /><Kpi label="السياسات السارية" value={policies.filter(p => p.status === 'ساري').length} hint={`${policies.filter(p => p.status === 'مسودة').length} مسودة`} icon={Gavel} /><Kpi label="امتثال ECC-2:2024" value="90%" tone="ok" hint="97 / 108 ضابط" icon={ShieldCheck} /><Kpi label="محاولات وصول مرفوضة" value={audit.filter(a => a.action.includes('مرفوضة')).length} tone="warn" icon={Lock} /></div>
      <div className="mt-3"><Tabs value={tab} onChange={pickTab} items={[{ value: 'audit', label: 'سجل التدقيق', count: audit.length, icon: ScrollText }, { value: 'compliance', label: 'الامتثال', icon: ShieldCheck }, { value: 'policies', label: 'السياسات والإصدارات', count: policies.length, icon: Gavel }, { value: 'access', label: 'مصفوفة الصلاحيات', icon: Lock }]} /></div>
      <div className="mt-3">
        {tab === 'audit' && <DataTable rows={audit} columns={cols} rowKey={a => a.id} searchable={a => `${a.actor} ${a.action} ${a.entityId} ${a.org}`} exportName="audit-log" defaultSort={{ key: 'at', dir: 'desc' }} pageSize={20} compactDefault filters={[{ key: 'sev', label: 'الخطورة', options: Object.entries(SEV).map(([v, s]) => ({ value: v, label: s.l })), match: (a, v) => a.severity === v }, { key: 'role', label: 'الدور', options: Object.entries(ROLE_LABEL).filter(([k]) => k !== 'visitor').map(([v, l]) => ({ value: v, label: l })), match: (a, v) => a.role === v }, { key: 'entity', label: 'الكيان', options: [...new Set(audit.map(a => a.entity))].map(e => ({ value: e, label: e })), match: (a, v) => a.entity === v }]} rowClass={a => a.severity === 'critical' ? 'bg-danger-25' : ''} />}
        {tab === 'compliance' && <div className="grid grid-cols-12 gap-3">
          <Section title="الضوابط الأساسية للأمن السيبراني ECC-2:2024" icon={ShieldCheck} desc="4 نطاقات · 28 نطاقاً فرعياً · 108 ضوابط" className="col-span-12 xl:col-span-7" bodyClass="p-3"><ul className="grid gap-2.5">{controls.map(([n, t, total, done]) => <li key={n as string} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[12.5px]"><span className="grid size-6 place-items-center rounded-sm bg-brand-50 text-[11px] font-bold text-brand-700">{n}</span><div><div className="font-semibold">{t}</div><Progress value={(+done / +total) * 100} tone={done === total ? 'ok' : 'accent'} /></div><span className="num text-[12px] text-ink-600">{done}/{total}</span></li>)}</ul><Callout tone="info" compact className="mt-3">حُذف ضابط توطين البيانات 4-2-3-3 في ECC-2 وأُحيل إلى NDMO/SDAIA؛ المنصة مستضافة داخل المملكة وفق قرار مجلس الوزراء 555، والنطاق 4-2 (السحابة) مطبَّق: فصل البيئة، تصنيف البيانات، إعادة البيانات عند الانتهاء.</Callout></Section>
          <div className="col-span-12 grid content-start gap-3 xl:col-span-5">
            <Section title="الامتثال التشغيلي لكود البناء" icon={CheckCircle2} bodyClass="p-3"><KV cols={2} dense items={[{ k: 'اعتماد الاستشاري لكل مخرج', v: <Badge tone="ok" size="xs">مطبّق — B.R.152</Badge> }, { k: 'الاعتماد التلقائي بعد 48 س', v: <Badge tone="warn" size="xs">{autoApprovals} حالة</Badge> }, { k: 'الجسات وفق SBC 303 Table 2.1', v: <Badge tone="ok" size="xs">قاعدة v1.2</Badge> }, { k: 'الحقول الفنية محمية', v: <Badge tone="ok" size="xs">B.R.218</Badge> }, { k: 'التحقق الجغرافي للعينات', v: <Badge tone="ok" size="xs">3 م</Badge> }, { k: 'تجميد القواعد لكل طلب', v: <Badge tone="ok" size="xs">مطبّق</Badge> }]} /></Section>
            <Section title="مختبرات تحتاج متابعة" icon={AlertTriangle} bodyClass="p-0"><Table className="border-0"><thead><tr><Th>المختبر</Th><Th>الالتزام</Th><Th>اعتماد تلقائي</Th><Th>الاعتماد</Th></tr></thead><tbody>{orgs.filter(o => o.type === 'lab' && ((o.onTime ?? 100) < 88 || (o.autoApprovals ?? 0) > 2 || (o.saac && new Date(o.saac.expires).getTime() - Date.now() < 120 * 864e5))).map(o => <tr key={o.id}><Td><Link to={`/directory/${o.id}`} className="font-semibold text-brand-700">{o.name}</Link></Td><Td><Badge tone={(o.onTime ?? 0) >= 88 ? 'ok' : 'danger'} size="xs">{o.onTime}%</Badge></Td><Td className="num">{o.autoApprovals}</Td><Td>{o.saac ? <Badge tone={new Date(o.saac.expires).getTime() - Date.now() < 120 * 864e5 ? 'warn' : 'ok'} size="xs">حتى {o.saac.expires}</Badge> : <span className="meta">غير معتمد</span>}</Td></tr>)}</tbody></Table></Section>
          </div>
        </div>}
        {tab === 'policies' && <PoliciesTable policies={policies} />}
        {tab === 'access' && <AccessMatrix />}
      </div>
      {user.role === 'supervisor' && <p className="meta mt-2">بصفتك جهة إشرافية تطّلع على السجلات والتقارير دون دور تشغيلي (BRD 3.2.1).</p>}
    </>
  )
}

function PoliciesTable({ policies }: { policies: Policy[] }) {
  const user = useStore(s => s.user)!; const upsertPolicy = useStore(s => s.upsertPolicy)
  const [edit, setEdit] = useState<Policy | null>(null)
  const canEdit = user.role === 'admin' || user.role === 'supervisor'
  const editor = <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && policies.some(p => p.id === edit.id) ? `تعديل السياسة ${edit.id}` : 'سياسة جديدة'} sub="كل تعديل يُسجَّل كحدث حرج في سجل التدقيق" width="md" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button><Button disabled={!edit || edit.title.trim().length < 5} onClick={() => { upsertPolicy(edit!); setEdit(null) }}>حفظ</Button></>}>{edit && <div className="grid gap-3 sm:grid-cols-2"><Field label="العنوان" required className="sm:col-span-2"><Input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field><Field label="الإصدار"><Input value={edit.version} onChange={e => setEdit({ ...edit, version: e.target.value })} className="ltr" /></Field><Field label="تاريخ السريان"><Input type="date" value={edit.effective} onChange={e => setEdit({ ...edit, effective: e.target.value })} className="ltr" /></Field><Field label="المالك"><Input value={edit.owner} onChange={e => setEdit({ ...edit, owner: e.target.value })} /></Field><Field label="النطاق"><Input value={edit.scope} onChange={e => setEdit({ ...edit, scope: e.target.value })} /></Field><Field label="المرجع"><Input value={edit.ref} onChange={e => setEdit({ ...edit, ref: e.target.value })} className="ltr" /></Field><Field label="الحالة"><Select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value as any })}><option>ساري</option><option>مسودة</option><option>منتهٍ</option></Select></Field></div>}</Modal>
  const cols: Column<Policy>[] = [
    { key: 'id', header: '#', width: '70px', sortValue: p => p.id, cell: p => <span className="font-mono text-[11px]">{p.id}</span> },
    { key: 'title', header: 'السياسة', sortValue: p => p.title, exportValue: p => p.title, cell: p => <span className="font-semibold">{p.title}</span> },
    { key: 'ver', header: 'الإصدار', width: '90px', cell: p => <Code>{p.version}</Code> },
    { key: 'eff', header: 'ساري من', width: '110px', sortValue: p => p.effective, cell: p => <span className="num text-[12px]">{p.effective}</span> },
    { key: 'owner', header: 'المالك', cell: p => <span className="text-[12px]">{p.owner}</span> },
    { key: 'scope', header: 'النطاق', width: '130px', cell: p => <Tag>{p.scope}</Tag> },
    { key: 'ref', header: 'المرجع', cell: p => <Code>{p.ref}</Code> },
    { key: 'status', header: 'الحالة', width: '90px', cell: p => <Badge tone={p.status === 'ساري' ? 'ok' : p.status === 'مسودة' ? 'warn' : 'neutral'} size="xs" dot>{p.status}</Badge> },
    { key: 'act', header: '', width: '110px', hideable: false, cell: p => <div className="flex gap-1"><Button size="xs" variant="ghost" icon={Eye} onClick={() => useStore.getState().toast({ title: p.title, body: `${p.version} · ${p.ref} · ${p.owner}`, tone: 'info' })}>عرض</Button>{canEdit && <Button size="xs" variant="ghost" onClick={() => setEdit(p)}>تعديل</Button>}</div> },
  ]
  return <>{editor}{canEdit && <div className="mb-2 flex justify-end"><Button size="sm" icon={Plus} onClick={() => setEdit({ id: `P-${String(policies.length + 1).padStart(2, '0')}`, title: '', version: 'v1.0', effective: new Date().toISOString().slice(0, 10), owner: 'الإدارة العامة لكود البناء', scope: 'المنصة', status: 'مسودة', ref: '' })}>سياسة جديدة</Button></div>}<DataTable rows={policies} columns={cols} rowKey={p => p.id} searchable={p => `${p.title} ${p.ref} ${p.owner}`} exportName="policies" filters={[{ key: 'st', label: 'الحالة', options: [{ value: 'ساري', label: 'ساري' }, { value: 'مسودة', label: 'مسودة' }], match: (p, v) => p.status === v }]} /></>
}

function AccessMatrix() {
  // One source of truth: the same MATRIX that guards every route (roles.ts)
  return <div className="card overflow-x-auto"><table className="w-full text-[11.5px]"><thead><tr><th className="sticky start-0 bg-ink-50 px-3 py-2 text-start font-semibold text-ink-600">الصلاحية</th>{MATRIX_COLS.map(h => <th key={h.key} className="bg-ink-50 px-1 py-2 text-center font-semibold text-ink-600" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 110 }}>{h.label}</th>)}</tr></thead><tbody>{MATRIX_ROWS.map(row => <tr key={row.p} className="border-t border-ink-100 hover:bg-ink-50"><td className="sticky start-0 bg-ink-0 px-3 py-1.5 font-medium">{row.label} <span className="meta font-mono text-[10px]">{row.p}</span></td>{MATRIX_COLS.map(c => { const [role, pos] = c.key.split(':') as [Role, 'principal' | 'employee']; const v = can(role, pos, row.p); return <td key={c.key} className="text-center">{v ? <span className="inline-block size-4 rounded-full bg-ok-50 text-[10px] font-bold leading-4 text-ok-600">✓</span> : <span className="text-ink-300">·</span>}</td> })}</tr>)}</tbody></table><p className="meta px-3 py-2">الملحق 7.1 بعد التصحيحات الموثّقة: (11) تقييم المختبر للمقاول فقط؛ (13–14) الدعم يُخفي ومدير النظام يحذف؛ (26) موظف المختبر يعرض الدراسة ضمن تفويضه؛ (20/24/25/34/35) القرارات للمفوّض الرئيسي حصراً. هذه المصفوفة هي نفسها التي تحرس كل مسار في التطبيق، والتفويض يُتحقق منه على مستوى السجل.</p></div>
}

/* ───────── Archive ───────── */
const DOC_LABEL: Record<Document['type'], string> = { report: 'تقرير', 'borehole-log': 'سجل جسة', 'test-result': 'نتيجة اختبار', certificate: 'شهادة', contract: 'عقد', deed: 'قرار مساحي', invoice: 'فاتورة', photo: 'صورة ميدانية' }
export function ArchivePage() {
  const user = useStore(s => s.user)!
  const docs = useSel(s => s.documents.filter(d => ['admin', 'supervisor', 'support'].includes(user.role) || d.orgId === user.orgId || s.requests.some(r => r.id === d.requestId && (r.contractorId === user.orgId || r.labId === user.orgId || r.consultantId === user.orgId))))
  const orgs = useStore(s => s.orgs)
  const byType = Object.entries(docs.reduce<Record<string, number>>((a, d) => { a[d.type] = (a[d.type] ?? 0) + 1; return a }, {}))
  const size = docs.reduce((a, d) => a + parseFloat(d.size), 0)
  const cols: Column<Document>[] = [
    { key: 'name', header: 'المستند', sortValue: d => d.name, exportValue: d => d.name, cell: d => <div className="flex items-center gap-2"><FileText className="size-4 shrink-0 text-brand-600" /><div className="min-w-0"><div className="truncate font-semibold text-brand-700">{d.name}</div><div className="meta font-mono">{d.hash}</div></div></div> },
    { key: 'type', header: 'النوع', width: '110px', sortValue: d => d.type, cell: d => <Tag>{DOC_LABEL[d.type]}</Tag> },
    { key: 'req', header: 'الطلب / العقد', width: '150px', sortValue: d => d.requestId ?? d.contractId ?? '', cell: d => <div className="whitespace-nowrap text-[12px]">{d.requestId && <Link to={`/requests/${d.requestId}`} className="text-brand-700 hover:underline">{d.requestId}</Link>}<div className="meta">{d.contractId}</div></div> },
    { key: 'org', header: 'المنشأة', width: '150px', defaultHidden: true, cell: d => <span className="block max-w-36 truncate text-[12px]">{orgs.find(o => o.id === d.orgId)?.name}</span> },
    { key: 'ver', header: 'الإصدار', width: '60px', cell: d => <span className="num">v{d.version}</span> },
    { key: 'size', header: 'الحجم', width: '80px', sortValue: d => parseFloat(d.size), cell: d => <span className="num whitespace-nowrap text-[12px]">{d.size}</span> },
    { key: 'at', header: 'التاريخ', width: '120px', sortValue: d => d.at, cell: d => <span className="num whitespace-nowrap text-[12px]">{fmtDate(d.at)}</span> },
    { key: 'cls', header: 'التصنيف', width: '90px', cell: d => <Badge tone={d.classification === 'سري' ? 'danger' : d.classification === 'داخلي' ? 'warn' : 'ok'} size="xs">{d.classification}</Badge> },
    { key: 'ret', header: 'الاحتفاظ حتى', width: '110px', defaultHidden: true, cell: d => <span className="num text-[12px]">{d.retentionUntil}</span> },
    { key: 'act', header: '', width: '130px', hideable: false, cell: d => <div className="flex gap-1 whitespace-nowrap"><Button size="xs" variant="ghost" icon={Eye} onClick={() => d.file ? openFile(d.file) : useStore.getState().toast({ title: d.name, body: 'لا يوجد ملف مرفق لهذا المستند بعد.', tone: 'info' })}>عرض</Button><Button size="xs" variant="ghost" icon={Download} onClick={() => d.file ? downloadUrl(d.file!, d.name) : useStore.getState().toast({ title: 'لا يوجد ملف', tone: 'warn' })}>تنزيل</Button></div> },
  ]
  return (
    <>
      <PageHeader title="الأرشيف والمستندات" sub="كل مستند مولَّد أو مرفوع يُحفظ بإصدار وبصمة sha256 وتصنيف بيانات ومدة احتفاظ وفق سياسة NDMO — لا حذف، إصدارات فقط" actions={<Button variant="secondary" icon={Download} onClick={() => downloadCsv('archive', ['المستند', 'النوع', 'الطلب', 'العقد', 'الحجم', 'التاريخ', 'التصنيف'], docs.map(d => [d.name, DOC_LABEL[d.type] || d.type, d.requestId, d.contractId, d.size, d.at, d.classification]))}>تصدير كشف الأرشيف</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Kpi label="المستندات" value={docs.length} icon={Archive} /><Kpi label="الحجم الإجمالي" value={size.toFixed(0)} unit="MB" /><Kpi label="سرية" value={docs.filter(d => d.classification === 'سري').length} tone="danger" hint="وصول مقيّد" /><Kpi label="نتائج اختبارات" value={docs.filter(d => d.type === 'test-result').length} /><Kpi label="سجلات جسات وصور" value={docs.filter(d => d.type === 'borehole-log' || d.type === 'photo').length} /><Kpi label="عقود وشهادات" value={docs.filter(d => d.type === 'contract' || d.type === 'certificate').length} /></div>
      <div className="mt-3 grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-9"><DataTable rows={docs} columns={cols} rowKey={d => d.id} searchable={d => `${d.name} ${d.requestId ?? ''} ${d.contractId ?? ''}`} exportName="archive" defaultSort={{ key: 'at', dir: 'desc' }} pageSize={15} compactDefault selectable bulkActions={k => <Button size="xs" variant="secondary" icon={Download} onClick={() => { const sel = docs.filter(d => k.includes(d.id)); downloadCsv('archive-selected', ['المستند', 'النوع', 'الطلب', 'الحجم'], sel.map(d => [d.name, d.type, d.requestId, d.size])); sel.filter(d => d.file).forEach(d => downloadUrl(d.file!, d.name)) }}>تنزيل المحدد ({k.length}) كحزمة</Button>} filters={[{ key: 'type', label: 'النوع', options: Object.entries(DOC_LABEL).map(([v, l]) => ({ value: v, label: l })), match: (d, v) => d.type === v }, { key: 'cls', label: 'التصنيف', options: ['عام', 'داخلي', 'سري'].map(c => ({ value: c, label: c })), match: (d, v) => d.classification === v }]} /></div>
        <div className="col-span-12 grid content-start gap-3 xl:col-span-3"><Section title="التوزيع حسب النوع" bodyClass="p-3"><ul className="grid gap-1.5">{byType.map(([t, n]) => <li key={t} className="flex items-center gap-2 text-[12px]"><span className="w-24 text-ink-700">{DOC_LABEL[t as Document['type']]}</span><div className="flex-1"><Progress value={(n / docs.length) * 100} /></div><span className="num w-8 text-end font-semibold">{n}</span></li>)}</ul></Section><Section title="سياسة الاحتفاظ" icon={Lock} bodyClass="p-3"><KV cols={1} dense items={[{ k: 'نتائج وسجلات', v: '10 سنوات' }, { k: 'عقود وشهادات', v: '20 سنة' }, { k: 'القرار المساحي', v: 'سري — 10 سنوات' }, { k: 'التعديل', v: 'إصدار جديد فقط — الأصل محفوظ' }]} /></Section></div>
      </div>
    </>
  )
}

/* ───────── Invoices ───────── */
const INV_LABEL: Record<Invoice['status'], { l: string; t: 'ok' | 'warn' | 'danger' | 'neutral' }> = { paid: { l: 'مسددة', t: 'ok' }, due: { l: 'مستحقة', t: 'warn' }, overdue: { l: 'متأخرة', t: 'danger' }, draft: { l: 'مسودة', t: 'neutral' } }
export function InvoicesPage() {
  const user = useStore(s => s.user)!
  const invoices = useSel(s => s.invoices.filter(i => ['admin', 'supervisor', 'support'].includes(user.role) || i.contractorId === user.orgId || i.labId === user.orgId))
  const orgs = useStore(s => s.orgs)
  const org = (id: string) => orgs.find(o => o.id === id)?.name ?? id
  const sum = (f: (i: Invoice) => boolean) => invoices.filter(f).reduce((a, i) => a + i.amount + i.vat, 0)
  const payInvoice = useStore(s => s.payInvoice)
  const monthly = useStore(s => s.analytics.monthly)
  const [pay, setPay] = useState<Invoice | null>(null); const [channel, setChannel] = useState('سداد')
  const printInvoice = (i: Invoice) => printHtml(`فاتورة ${i.id}`, `
    <div class="row"><span>الطلب</span><span class="num">${i.requestId}</span></div>
    <div class="row"><span>العقد</span><span class="num">${i.contractId}</span></div>
    <div class="row"><span>المقاول</span><span>${org(i.contractorId)}</span></div>
    <div class="row"><span>المختبر</span><span>${org(i.labId)}</span></div>
    <div class="row"><span>تاريخ الإصدار</span><span class="num">${fmtDate(i.issuedAt)}</span></div>
    <div class="row"><span>الاستحقاق</span><span class="num">${fmtDate(i.dueAt)}</span></div>
    <div class="row"><span>الحالة</span><span>${INV_LABEL[i.status].l}</span></div>
    <h2>المبالغ</h2>
    <table><tbody>
      <tr><td>قبل الضريبة</td><td class="num">${fmtSAR(i.amount)}</td></tr>
      <tr><td>ضريبة القيمة المضافة</td><td class="num">${fmtSAR(i.vat)}</td></tr>
      <tr><td><b>الإجمالي</b></td><td class="num total">${fmtSAR(i.amount + i.vat)}</td></tr>
    </tbody></table>
    ${i.paidAt ? `<p class="meta">سُددت في ${fmtDate(i.paidAt)}${i.channel ? ` عبر ${i.channel}` : ''}</p>` : ''}
  `)
  const cols: Column<Invoice>[] = [
    { key: 'id', header: 'الفاتورة', width: '130px', sortValue: i => i.id, exportValue: i => i.id, cell: i => <span className="whitespace-nowrap font-semibold text-brand-700">{i.id}</span> },
    { key: 'req', header: 'الطلب / العقد', sortValue: i => i.requestId, cell: i => <div className="whitespace-nowrap"><Link to={`/requests/${i.requestId}`} className="text-[12.5px] font-medium hover:underline">{i.requestId}</Link><div className="meta">{i.contractId}</div></div> },
    { key: 'party', header: user.role === 'lab' ? 'المقاول' : 'المختبر', cell: i => <span className="block max-w-44 truncate text-[12px]">{org(user.role === 'lab' ? i.contractorId : i.labId)}</span> },
    { key: 'amount', header: 'قبل الضريبة', width: '110px', align: 'end', sortValue: i => i.amount, exportValue: i => i.amount, cell: i => <span className="num whitespace-nowrap">{fmtSAR(i.amount)}</span> },
    { key: 'vat', header: 'الضريبة', width: '90px', align: 'end', cell: i => <span className="num whitespace-nowrap text-[12px]">{fmtSAR(i.vat)}</span> },
    { key: 'total', header: 'الإجمالي', width: '110px', align: 'end', sortValue: i => i.amount + i.vat, exportValue: i => i.amount + i.vat, cell: i => <span className="num whitespace-nowrap font-bold">{fmtSAR(i.amount + i.vat)}</span> },
    { key: 'issued', header: 'الإصدار', width: '125px', sortValue: i => i.issuedAt, cell: i => <span className="num whitespace-nowrap text-[12px]">{fmtDate(i.issuedAt)}</span> },
    { key: 'due', header: 'الاستحقاق', width: '125px', sortValue: i => i.dueAt, cell: i => <span className={cx('num whitespace-nowrap text-[12px]', i.status === 'overdue' && 'text-danger-600 font-semibold')}>{fmtDate(i.dueAt)}</span> },
    { key: 'status', header: 'الحالة', width: '100px', sortValue: i => i.status, cell: i => <Badge tone={INV_LABEL[i.status].t} dot size="xs">{INV_LABEL[i.status].l}</Badge> },
    { key: 'act', header: '', width: '110px', hideable: false, cell: i => <div className="flex gap-1"><Button size="xs" variant="ghost" icon={Printer} onClick={() => printInvoice(i)}>PDF</Button>{(i.status === 'due' || i.status === 'overdue') && user.role === 'contractor' && <Button size="xs" onClick={() => setPay(i)}>سداد</Button>}</div> },
  ]
  return (
    <>
      <Modal open={!!pay} onClose={() => setPay(null)} title={pay ? `سداد الفاتورة ${pay.id}` : ''} sub="بوابة الدفع الحكومية — محاكاة" width="sm" footer={<><Button variant="secondary" onClick={() => setPay(null)}>إلغاء</Button><Button onClick={() => { payInvoice(pay!.id, channel); setPay(null) }}>تأكيد السداد</Button></>}>
        {pay && <div className="grid gap-3"><KV cols={2} dense items={[{ k: 'المبلغ', v: fmtSAR(pay.amount) }, { k: 'الضريبة 15%', v: fmtSAR(pay.vat) }, { k: 'الإجمالي', v: <b className="num">{fmtSAR(pay.amount + pay.vat)}</b> }, { k: 'الاستحقاق', v: fmtDate(pay.dueAt) }]} /><Field label="قناة السداد"><Select value={channel} onChange={e => setChannel(e.target.value)}><option>سداد</option><option>مدى</option><option>تحويل بنكي</option></Select></Field><p className="meta">يُصدر إيصال إلكتروني ويُشعر المختبر فوراً، وتُحدَّث حالة الفاتورة وشهادة الإتمام.</p></div>}
      </Modal>
      <PageHeader title="الفواتير" sub="تُصدر الفاتورة تلقائياً عند قبول المختبر للطلب وفق آلية الدفع في العقد — الفوترة الإلكترونية متوافقة مع هيئة الزكاة والضريبة والجمارك" actions={<Button variant="secondary" icon={Download} onClick={() => downloadCsv('invoices-statement', ['الفاتورة', 'الطلب', 'العقد', 'المقاول', 'المختبر', 'قبل الضريبة', 'الضريبة', 'الإجمالي', 'الإصدار', 'الاستحقاق', 'الحالة'], invoices.map(i => [i.id, i.requestId, i.contractId, org(i.contractorId), org(i.labId), i.amount, i.vat, i.amount + i.vat, i.issuedAt, i.dueAt, INV_LABEL[i.status].l]))}>تصدير كشف حساب</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="إجمالي الفواتير" value={invoices.length} icon={Receipt} /><Kpi label="مسددة" value={(sum(i => i.status === 'paid') / 1000).toFixed(1)} unit="ألف ر.س" tone="ok" hint={`${invoices.filter(i => i.status === 'paid').length} فاتورة`} /><Kpi label="مستحقة" value={(sum(i => i.status === 'due') / 1000).toFixed(1)} unit="ألف ر.س" tone="warn" hint={`${invoices.filter(i => i.status === 'due').length} فاتورة`} /><Kpi label="متأخرة" value={(sum(i => i.status === 'overdue') / 1000).toFixed(1)} unit="ألف ر.س" tone="danger" hint={`${invoices.filter(i => i.status === 'overdue').length} فاتورة`} /><Kpi label="متوسط أيام السداد" value={18} unit="يوم" icon={Wallet} /></div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Section title="الإيراد الشهري" desc="ألف ر.س — آخر 12 شهراً" bodyClass="p-2"><Bars data={monthly} series={[{ key: 'revenue', label: 'الإيراد' }]} height={150} /></Section>
        <Section title="أعمار الذمم المستحقة" desc="حسب أيام التأخر" bodyClass="p-3">{(() => { const open = invoices.filter(i => i.status === 'due' || i.status === 'overdue'); const age = (i: Invoice) => Math.floor((Date.now() - new Date(i.dueAt).getTime()) / 864e5); const buckets = [['غير مستحقة بعد', (i: Invoice) => age(i) < 0], ['1–30 يوم', (i: Invoice) => age(i) >= 0 && age(i) <= 30], ['31–60 يوم', (i: Invoice) => age(i) > 30 && age(i) <= 60], ['أكثر من 60 يوماً', (i: Invoice) => age(i) > 60]] as const; const totals = buckets.map(([l, f]) => [l, open.filter(f).reduce((x, i) => x + i.amount + i.vat, 0), open.filter(f).length] as const); const max = Math.max(1, ...totals.map(t => t[1])); return <ul className="grid gap-2">{totals.map(([l, v, n], idx) => <li key={l} className="text-[12px]"><div className="flex justify-between"><span className="text-ink-700">{l} <span className="meta">· {n} فاتورة</span></span><span className="num font-semibold">{fmtSAR(v)}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full rounded-full', idx === 0 ? 'bg-brand-500' : idx === 1 ? 'bg-warn-500' : 'bg-danger-500')} style={{ width: `${(v / max) * 100}%` }} /></div></li>)}</ul> })()}</Section>
        <Section title="الفوترة والسداد" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'آلية الإصدار', v: 'تلقائي عند قبول المختبر' }, { k: 'الضريبة', v: `${Math.round(useStore.getState().rules.vat)}% قيمة مضافة` }, { k: 'مدة السداد', v: '30 يوماً من الإصدار' }, { k: 'قنوات السداد', v: 'سداد · مدى · تحويل' }, { k: 'الفوترة الإلكترونية', v: 'ZATCA المرحلة 2' }, { k: 'الفاتورة النهائية', v: 'عند اعتماد كل المخرجات' }]} /><p className="meta mt-2">التأخر في السداد يوقف إصدار شهادة الإتمام للعقد ويُسجَّل في مؤشرات المنشأة.</p></Section>
      </div>
      <div className="mt-3"><DataTable rows={invoices} columns={cols} rowKey={i => i.id} searchable={i => `${i.id} ${i.requestId} ${i.contractId}`} exportName="invoices" defaultSort={{ key: 'issued', dir: 'desc' }} pageSize={15} filters={[{ key: 'st', label: 'الحالة', options: Object.entries(INV_LABEL).map(([v, s]) => ({ value: v, label: s.l })), match: (i, v) => i.status === v }]} rowClass={i => i.status === 'overdue' ? 'bg-danger-25' : ''} /></div>
    </>
  )
}

/* ───────── Reports & analytics ───────── */
export function ReportsPage() {
  const user = useStore(s => s.user)!
  const reqs = useSel(visibleRequests)
  const orgs = useStore(s => s.orgs)
  const refTests = useStore(s => s.refTests)
  const studies = useStore(s => s.studies)
  const analytics = useStore(s => s.analytics)
  const [period, setPeriod] = useState<'m6' | 'm12'>('m12')
  const [tab, setTab] = useState<'ops' | 'quality' | 'labs' | 'geo' | 'finance'>('ops')
  const months = analytics.monthly.slice(period === 'm6' ? -6 : 0)
  const tests = reqs.flatMap(r => r.tests.map(t => ({ r, t })))
  const labs = orgs.filter(o => o.type === 'lab' && o.active)
  const testMix = Object.entries(tests.reduce<Record<string, number>>((a, x) => { a[x.t.refTestId] = (a[x.t.refTestId] ?? 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ name: refTests.find(t => t.id === k)?.nameAr ?? k, value: v }))
  const labRows = labs.map(l => { const lr = reqs.filter(r => r.labId === l.id); const lt = lr.flatMap(r => r.tests); return { l, n: lr.length, tests: lt.length, rej: lt.filter(t => t.status === 'STS21').length, auto: lt.filter(t => t.autoApproved).length, value: lt.reduce((a, t) => a + t.price, 0) } }).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  const rejectReasons = Object.entries(tests.reduce<Record<string, number>>((a, x) => { if (x.t.status === 'STS21' && x.t.rejectReason) { a[x.t.rejectReason] = (a[x.t.rejectReason] ?? 0) + 1 } return a }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  const geoRt = refTests.find(t => t.isGeotech)?.id
  const bhCount = studies.reduce((a, s) => a + s.boreholes.length, 0)
  const avgBh = studies.length ? (bhCount / studies.length).toFixed(1) : '—'
  const avgDepth = (() => { const depths = studies.flatMap(s => s.boreholes.map(b => b.executedDepth ?? b.approvedDepth)).filter(Boolean); return depths.length ? (depths.reduce((a, d) => a + d, 0) / depths.length).toFixed(1) : '—' })()
  const uscsMix = Object.entries(studies.reduce<Record<string, number>>((a, s) => { s.boreholes.forEach(b => b.layers.forEach(l => { const k = (l as { uscs?: string }).uscs; if (k) a[k] = (a[k] ?? 0) + 1 })); return a }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  return (
    <>
      <PageHeader title="التقارير والتحليلات" sub="مؤشرات التشغيل والجودة وأداء المختبرات والمالية — قابلة للتصفية والتصدير والجدولة الدورية" actions={<><Segmented value={period} onChange={setPeriod} items={[{ value: 'm6', label: '6 أشهر' }, { value: 'm12', label: '12 شهراً' }]} /><Button variant="secondary" icon={Printer} onClick={() => printHtml('تقرير معيار التحليلي', `
        <h2>ملخص الفترة (${period === 'm6' ? '6' : '12'} أشهر)</h2>
        <table><thead><tr><th>الشهر</th><th>الطلبات</th><th>المكتملة</th><th>المرفوضة</th><th>الالتزام %</th><th>الإيراد</th></tr></thead>
        <tbody>${months.map(m => `<tr><td>${m.m}</td><td class="num">${m.requests}</td><td class="num">${m.completed}</td><td class="num">${m.rejected}</td><td class="num">${m.sla}</td><td class="num">${m.revenue}</td></tr>`).join('')}</tbody></table>
      `)}>طباعة</Button><Button icon={Download} onClick={() => downloadCsv('miyar-analytics', ['الشهر', 'الطلبات', 'المكتملة', 'المرفوضة', 'الالتزام', 'الإيراد', 'جيوتقنية'], months.map(m => [m.m, m.requests, m.completed, m.rejected, m.sla, m.revenue, m.geotech]))}>تصدير التقرير</Button></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Kpi label="الطلبات" value={months.reduce((a, m) => a + m.requests, 0)} spark={months.map(m => m.requests)} trend={9} /><Kpi label="المكتملة" value={months.reduce((a, m) => a + m.completed, 0)} tone="ok" spark={months.map(m => m.completed)} /><Kpi label="الدراسات الجيوتقنية" value={months.reduce((a, m) => a + m.geotech, 0)} spark={months.map(m => m.geotech)} trend={22} /><Kpi label="الالتزام بالمهل" value={`${months.length ? Math.round(months.reduce((a, m) => a + m.sla, 0) / months.length) : 0}%`} tone="ok" spark={months.map(m => m.sla)} /><Kpi label="المخرجات المرفوضة" value={months.reduce((a, m) => a + m.rejected, 0)} tone="warn" spark={months.map(m => m.rejected)} trendInvert trend={-3} /><Kpi label="الإيراد" value={(months.reduce((a, m) => a + m.revenue, 0) / 1000).toFixed(1)} unit="مليون ر.س" spark={months.map(m => m.revenue)} trend={14} /></div>
      <div className="mt-3"><Tabs value={tab} onChange={setTab} items={[{ value: 'ops', label: 'التشغيل', icon: BarChart3 }, { value: 'quality', label: 'الجودة والامتثال', icon: ShieldCheck }, { value: 'labs', label: 'أداء المختبرات' }, { value: 'geo', label: 'الدراسات الجيوتقنية' }, { value: 'finance', label: 'المالية', icon: Wallet }]} /></div>
      <div className="mt-3 grid grid-cols-12 gap-3">
        {tab === 'ops' && <>
          <Section title="الطلبات الواردة والمكتملة والمرفوضة" desc="شهرياً" className="col-span-12 xl:col-span-7" bodyClass="p-3"><Bars data={months} series={[{ key: 'requests', label: 'واردة' }, { key: 'completed', label: 'مكتملة' }, { key: 'rejected', label: 'مخرج مرفوض', color: SERIES[2] }]} height={230} /></Section>
          <Section title="الاختبارات الأكثر طلباً" className="col-span-12 md:col-span-6 xl:col-span-5" bodyClass="p-2"><RankBars data={testMix} height={230} labelWidth={150} /></Section>
          <Section title="التوزيع حسب التصنيف" className="col-span-12 md:col-span-6 xl:col-span-4" bodyClass="p-3"><Donut data={analytics.categoryMix.map((c, i) => ({ ...c, color: SERIES[i] }))} height={160} centerLabel="اختبار" /></Section>
          <Section title="التوزيع الجغرافي" className="col-span-12 md:col-span-6 xl:col-span-4" bodyClass="p-3"><Donut data={analytics.cityMix.map((c, i) => ({ ...c, color: [...SERIES, '#9DA4AE'][i] }))} height={160} centerLabel="طلب" /></Section>
          <Section title="زمن الدورة (متوسط الأيام)" className="col-span-12 md:col-span-6 xl:col-span-4" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'إرسال → قرار المختبر', v: '7.4 ساعة' }, { k: 'قبول → استلام العينة', v: '2.1 يوم' }, { k: 'استلام → رفع النتيجة', v: '3.6 يوم' }, { k: 'رفع → قرار الاستشاري', v: '19 ساعة' }, { k: 'الدورة الكاملة (قياسي)', v: '6.8 يوم' }, { k: 'الدورة الكاملة (جيوتقنية)', v: '24 يوماً' }]} /></Section>
        </>}
        {tab === 'quality' && <>
          <Section title="الالتزام بالمهل مقابل المستهدف" className="col-span-12 xl:col-span-7" bodyClass="p-3"><TimeLine data={months} series={[{ key: 'sla', label: 'الالتزام %' }]} height={220} unit="%" refY={90} refLabel="المستهدف 90%" /></Section>
          <Section title="الاعتمادات التلقائية (48 س)" desc="مؤشر استجابة الاستشاريين" className="col-span-12 xl:col-span-5" bodyClass="p-3"><Bars data={months} series={[{ key: 'auto', label: 'اعتماد تلقائي', color: STATUS_FILL.warn }]} height={220} /></Section>
          <Section title="أسباب رفض المخرجات" className="col-span-12 md:col-span-6" bodyClass="p-2"><RankBars data={rejectReasons} height={190} labelWidth={170} color={STATUS_FILL.danger} /></Section>
          <Section title="مؤشرات الحوكمة" className="col-span-12 md:col-span-6" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'طلبات أُنهيت بتجاوز مهلة المختبر', v: 4 }, { k: 'عينات سُجّلت خارج النطاق', v: 3 }, { k: 'جسات نُقلت عن الخطة', v: 6 }, { k: 'تفويضات غير مباشرة مرفوضة', v: 2 }, { k: 'تعديلات على قواعد الأعمال', v: 3 }, { k: 'محاولات وصول مرفوضة', v: 5 }]} /></Section>
        </>}
        {tab === 'labs' && <>
          <Section title="ترتيب المختبرات — الالتزام بالمواعيد" className="col-span-12 xl:col-span-5" bodyClass="p-2"><RankBars data={labs.map(l => ({ name: l.name.replace('مختبر ', ''), value: l.onTime ?? 0, color: (l.onTime ?? 0) >= 90 ? STATUS_FILL.ok : (l.onTime ?? 0) >= 85 ? STATUS_FILL.warn : STATUS_FILL.danger })).sort((a, b) => b.value - a.value)} height={240} benchmark={90} unit="%" labelWidth={130} /></Section>
          <Section title="بطاقة أداء المختبرات" className="col-span-12 xl:col-span-7" bodyClass="p-0"><Table className="border-0"><thead><tr><Th>المختبر</Th><Th>الطلبات</Th><Th>الاختبارات</Th><Th>مرفوض</Th><Th>اعتماد تلقائي</Th><Th>الالتزام</Th><Th>التقييم</Th><Th className="text-end">القيمة</Th></tr></thead><tbody>{labRows.map(x => <tr key={x.l.id} className="hover:bg-ink-50"><Td><Link to={`/directory/${x.l.id}`} className="font-semibold text-brand-700">{x.l.name}</Link></Td><Td className="num">{x.n}</Td><Td className="num">{x.tests}</Td><Td className="num">{x.rej}</Td><Td className="num">{x.auto}</Td><Td><Badge tone={(x.l.onTime ?? 0) >= 90 ? 'ok' : 'warn'} size="xs">{x.l.onTime}%</Badge></Td><Td className="num">★ {x.l.rating.toFixed(1)}</Td><Td className="num text-end font-semibold">{fmtSAR(x.value)}</Td></tr>)}</tbody></Table></Section>
        </>}
        {tab === 'geo' && <>
          <Section title="الدراسات الجيوتقنية شهرياً" className="col-span-12 xl:col-span-6" bodyClass="p-3"><TimeArea data={months} series={[{ key: 'geotech', label: 'دراسات' }]} height={220} /></Section>
          <Section title="مؤشرات الدراسات" className="col-span-12 xl:col-span-6" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'عدد الدراسات', v: studies.length }, { k: 'متوسط عدد الجسات', v: avgBh }, { k: 'متوسط العمق المنفَّذ', v: `${avgDepth} م` }, { k: 'جسات لم تبلغ العمق المعتمد', v: studies.flatMap(s => s.boreholes).filter(b => b.executedDepth != null && b.approvedDepth && b.executedDepth < b.approvedDepth).length }]} /></Section>
          <Section title="تصنيف التربة السائد (USCS)" className="col-span-12 md:col-span-6" bodyClass="p-2"><RankBars data={uscsMix} height={150} labelWidth={60} /></Section>
        </>}
        {tab === 'finance' && <>
          <Section title="الإيراد الشهري" desc="ألف ر.س" className="col-span-12 xl:col-span-7" bodyClass="p-3"><TimeArea data={months} series={[{ key: 'revenue', label: 'الإيراد' }]} height={220} /></Section>
          <Section title="ملخص" className="col-span-12 xl:col-span-5" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'إجمالي قيمة الطلبات', v: fmtSAR(tests.reduce((a, x) => a + x.t.price, 0)) }, { k: 'متوسط قيمة الطلب', v: fmtSAR(Math.round(tests.reduce((a, x) => a + x.t.price, 0) / Math.max(1, reqs.length))) }, { k: 'الدراسات الجيوتقنية', v: fmtSAR(tests.filter(x => x.t.refTestId === geoRt).reduce((a, x) => a + x.t.price, 0)) }, { k: 'الضريبة المحصّلة', v: fmtSAR(Math.round(tests.reduce((a, x) => a + x.t.price, 0) * (useStore.getState().rules.vat / 100))) }]} /></Section>
        </>}
      </div>
      <p className="meta mt-2">التقارير تعتمد على بيانات {reqs.length} طلباً ضمن نطاق صلاحياتك ({ROLE_LABEL[user.role]}).</p>
    </>
  )
}
