import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Plus, Check, X, Pencil, UserCheck, Clock } from 'lucide-react'
import { useStore, useSel, visibleRequests } from '@/lib/store'
import { PageHeader } from '@/ds/composite'
import { StatusPill, Badge, Button, Modal, Field, Select, Callout, Kpi, Section, Avatar, Progress, cx } from '@/ds/primitives'
import { DataTable, type Column } from '@/ds/DataTable'
import { fmtDateTime, fmtDate, fmtTime } from '@/lib/format'
import type { Delegation } from '@/lib/types'
import DelegationModal from './DelegationModal'

export default function Delegations() {
  const user = useStore(s => s.user)!
  const users = useStore(s => s.users)
  const orgUsers = users.filter(u => u.orgId === user.orgId)
  const requests = useStore(s => s.requests)
  const mine = useSel(s => visibleRequests(s).filter(r => !['STS09', 'STS15', 'STS16', 'STS13', 'STS26'].includes(r.status)))
  const refTests = useStore(s => s.refTests)
  const all = useSel(s => s.delegations.filter(d => orgUsers.some(u => u.id === d.fromUserId || u.id === d.toUserId)))
  const decide = useStore(s => s.decideDelegation)
  const edit = useStore(s => s.editDelegation)
  const [create, setCreate] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [newTo, setNewTo] = useState('')
  const [cancelling, setCancelling] = useState<Delegation | null>(null)
  // B.R.236 — cancellation keeps the record (STS25) and is audited; the employee loses access immediately (B.R.238)
  const cancelDelegation = async (d: Delegation) => {
    try {
      await edit(d.id, '') // revoke only — store.editDelegation with empty toUser → revoke API
      useStore.getState().toast({ title: 'أُلغي التفويض', body: `${name(d.toUserId)} لم يعد يصل إلى ${d.requestId} — احتُفظ بالسجل.`, tone: 'info' })
    } catch { /* toast from store */ }
  }
  const [reqForNew, setReqForNew] = useState('')
  const name = (id: string) => users.find(u => u.id === id)?.name ?? id
  const pending = all.filter(d => d.toUserId === user.id && d.status === 'STS22')
  const fieldStarted = (reqId: string) => requests.find(r => r.id === reqId)?.status === 'STS14'
  const canEdit = (d: Delegation) => user.canDelegate || (!fieldStarted(d.requestId) && d.fromUserId === user.id)
  const workload = orgUsers.filter(u => u.position === 'employee').map(u => ({ u, n: all.filter(d => d.toUserId === u.id && d.status === 'STS23').length }))

  const cols: Column<Delegation>[] = [
    { key: 'type', header: 'النوع', width: '100px', sortValue: d => d.type, cell: d => <Badge tone={d.type === 'direct' ? 'accent' : 'info'} size="xs">{d.type === 'direct' ? 'مباشر' : 'غير مباشر'}</Badge> },
    { key: 'scope', header: 'النطاق', width: '110px', sortValue: d => d.scope, cell: d => <span className="whitespace-nowrap">{d.scope === 'request' ? 'طلب كامل' : 'اختبار محدد'}</span> },
    { key: 'req', header: 'الطلب / الاختبار', sortValue: d => d.requestId, exportValue: d => d.requestId, cell: d => { const r = requests.find(x => x.id === d.requestId); const t = r?.tests.find(x => x.id === d.testId); return <div><Link to={`/requests/${d.requestId}`} className="font-semibold text-brand-700 hover:underline">{d.requestId}</Link><div className="meta truncate">{t ? refTests.find(x => x.id === t.refTestId)?.nameAr : r?.project}</div></div> } },
    { key: 'from', header: 'من', sortValue: d => name(d.fromUserId), exportValue: d => name(d.fromUserId), cell: d => <span className="flex items-center gap-1.5 whitespace-nowrap"><Avatar name={name(d.fromUserId)} size="xs" />{name(d.fromUserId)}</span> },
    { key: 'to', header: 'إلى', sortValue: d => name(d.toUserId), exportValue: d => name(d.toUserId), cell: d => <span className="flex items-center gap-1.5 whitespace-nowrap"><Avatar name={name(d.toUserId)} size="xs" />{name(d.toUserId)}</span> },
    { key: 'at', header: 'التاريخ', width: '120px', sortValue: d => d.createdAt, exportValue: d => fmtDateTime(d.createdAt), cell: d => <div className="whitespace-nowrap"><div className="num text-[12px]">{fmtDate(d.createdAt)}</div><div className="meta">{fmtTime(d.createdAt)}</div></div> },
    { key: 'status', header: 'الحالة', width: '130px', sortValue: d => d.status, cell: d => <StatusPill code={d.status} size="xs" /> },
    { key: 'act', header: '', width: '120px', hideable: false, cell: d => <div className="flex gap-1 whitespace-nowrap">{d.status === 'STS22' && d.toUserId === user.id && <><Button size="xs" variant="success" icon={Check} onClick={() => decide(d.id, true)}>قبول</Button><Button size="xs" variant="secondary" icon={X} onClick={() => decide(d.id, false)}>رفض</Button></>}{d.status === 'STS23' && canEdit(d) && <Button size="xs" variant="ghost" icon={Pencil} onClick={() => { setEditing(d.id); setNewTo(d.toUserId) }}>تعديل</Button>}{d.status === 'STS23' && user.canDelegate && <Button size="xs" variant="ghost" icon={X} className="text-danger-600" onClick={() => setCancelling(d)}>إلغاء</Button>}{d.status === 'STS23' && !canEdit(d) && <span className="meta">بدأت الأعمال — للمفوّض الرئيسي</span>}</div> },
  ]

  return (
    <>
      <PageHeader title="التفويض" sub="توزيع المهام على الطلبات والاختبارات مع تتبع كامل — المفوَّض يرى ما فُوِّض له فقط" actions={<Button icon={Plus} onClick={() => setCreate(true)}>تفويض جديد</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="بانتظار قبولك" value={pending.length} tone={pending.length ? 'warn' : 'ok'} icon={Clock} />
        <Kpi label="فعّالة لك" value={all.filter(d => d.toUserId === user.id && d.status === 'STS23').length} tone="ok" icon={UserCheck} />
        <Kpi label="أنشأتها" value={all.filter(d => d.fromUserId === user.id).length} icon={Users} />
        <Kpi label="إجمالي المنشأة" value={all.length} hint={`${all.filter(d => d.status === 'STS23').length} فعّال · ${all.filter(d => d.status === 'STS25').length} ملغي`} />
      </div>
      {pending.length > 0 && <Callout tone="warn" compact className="mt-3">لديك {pending.length} تفويض غير مباشر بانتظار قبولك — لا يمكنك الوصول للطلب قبل القبول.</Callout>}
      <div className="mt-3 grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-9"><DataTable rows={all} columns={cols} rowKey={d => d.id} searchable={d => `${d.requestId} ${name(d.fromUserId)} ${name(d.toUserId)}`} exportName="delegations" defaultSort={{ key: 'at', dir: 'desc' }} filters={[{ key: 'st', label: 'الحالة', options: [{ value: 'STS22', label: 'بانتظار القبول' }, { value: 'STS23', label: 'فعّال' }, { value: 'STS24', label: 'مرفوض' }, { value: 'STS25', label: 'ملغي' }], match: (d, v) => d.status === v }, { key: 'mine', label: 'العرض', options: [{ value: 'to', label: 'المفوَّضة إليّ' }, { value: 'from', label: 'التي أنشأتها' }], match: (d, v) => v === 'to' ? d.toUserId === user.id : d.fromUserId === user.id }]} /></div>
        <Section title="توزيع المهام على الموظفين" className="col-span-12 xl:col-span-3" bodyClass="p-3"><ul className="grid gap-2.5">{workload.map(({ u, n }) => <li key={u.id} className="flex items-center gap-2 text-[12px]"><Avatar name={u.name} size="xs" /><span className="w-28 truncate font-medium">{u.name}</span><div className="flex-1"><Progress value={Math.min(100, n * 33)} tone={n >= 3 ? 'warn' : 'accent'} label={`${n}`} /></div></li>)}</ul><div className="mt-4 grid grid-cols-2 gap-2 text-center">{[['مباشر', all.filter(d => d.type === 'direct').length, 'accent'], ['غير مباشر', all.filter(d => d.type === 'indirect').length, 'info'], ['على طلب كامل', all.filter(d => d.scope === 'request').length, 'neutral'], ['على اختبار محدد', all.filter(d => d.scope === 'test').length, 'neutral']].map(([l, v, t]: any) => <div key={l} className="rounded-sm bg-ink-50 py-2"><div className={cx('num text-[17px] font-bold', t === 'accent' ? 'text-brand-700' : t === 'info' ? 'text-info-600' : 'text-ink-800')}>{v}</div><div className="text-[10.5px] text-ink-500">{l}</div></div>)}</div>
          <div className="mt-4 rounded-sm border border-ink-200 p-2.5"><div className="data-label mb-1.5">قواعد التفويض</div><ul className="grid gap-1.5 text-[11.5px] text-ink-600">{['المباشر: يبدأ فوراً دون قبول الموظف', 'غير المباشر: يصبح فعّالاً بعد قبول الموظف (B.R.235)', 'بعد بدء الأعمال الميدانية لا يُعدَّل إلا من المفوّض الرئيسي', 'المفوَّض يرى الطلب/الاختبار المفوَّض له فقط', 'كل تفويض وتعديل مُسجَّل في سجل التدقيق'].map(t => <li key={t} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{t}</li>)}</ul></div></Section>
      </div>
      {create && <Modal open onClose={() => setCreate(false)} title="اختر الطلب" width="sm" footer={<Button onClick={() => { setCreate(false); setEditing('new') }} disabled={!reqForNew}>متابعة</Button>}><Field label="الطلب" hint={user.position === 'employee' ? 'يظهر لك ما فُوِّض لك فقط — التفويض غير المباشر ضمن نطاقك (B.R.233)' : 'الطلبات الجارية لمنشأتك'}><Select value={reqForNew} onChange={e => setReqForNew(e.target.value)}><option value="">اختر…</option>{mine.map(r => <option key={r.id} value={r.id}>{r.id} — {r.project}</option>)}</Select></Field></Modal>}
      {editing === 'new' && <DelegationModal open onClose={() => setEditing(null)} requestId={reqForNew} />}
      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="إلغاء التفويض" width="sm" footer={<><Button variant="secondary" onClick={() => setCancelling(null)}>تراجع</Button><Button variant="danger" onClick={async () => { await cancelDelegation(cancelling!); setCancelling(null) }}>نعم، ألغِ التفويض</Button></>}><p className="text-[13px]">سيفقد {cancelling && name(cancelling.toUserId)} الوصول إلى {cancelling?.requestId} فوراً، ويبقى التفويض في السجل بحالة «ملغي» (B.R.236).</p></Modal>
      <Modal open={!!editing && editing !== 'new'} onClose={() => setEditing(null)} title="تعديل الموظف المفوَّض" width="sm" footer={<><Button variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button><Button onClick={() => { edit(editing!, newTo); setEditing(null); useStore.getState().toast({ title: 'عُدّل التفويض', body: 'أُلغي التفويض السابق وفُعّل الجديد وأُشعر الموظف.', tone: 'ok' }) }}>حفظ التعديلات</Button></>}><Callout tone="info" compact className="mb-3">سيُلغى التفويض الحالي (مع الاحتفاظ به في السجل) ويُنشأ تفويض جديد فعّال للموظف المختار.</Callout><Field label="الموظف الجديد"><Select value={newTo} onChange={e => setNewTo(e.target.value)}>{orgUsers.filter(u => u.id !== user.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field></Modal>
    </>
  )
}
