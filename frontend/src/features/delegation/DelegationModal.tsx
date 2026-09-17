import { useState } from 'react'
import { useStore, useSel } from '@/lib/store'
import { Modal, Button, Field, Select, Callout, Badge } from '@/ds/primitives'

export default function DelegationModal({ open, onClose, requestId, testId }: { open: boolean; onClose: () => void; requestId: string; testId?: string }) {
  const user = useStore(s => s.user)!
  const users = useSel(s => s.users.filter(u => u.orgId === user.orgId && u.id !== user.id))
  const refTests = useStore(s => s.refTests)
  const r = useStore(s => s.requests.find(x => x.id === requestId))
  const create = useStore(s => s.createDelegation)
  const [scope, setScope] = useState<'request' | 'test'>(testId ? 'test' : 'request')
  const [tid, setTid] = useState(testId ?? r?.tests[0]?.id ?? '')
  const [to, setTo] = useState(users[0]?.id ?? '')
  const type = user.canDelegate ? 'direct' : 'indirect'
  const submit = () => { create({ type, scope, requestId, testId: scope === 'test' ? tid : undefined, fromUserId: user.id, toUserId: to }); onClose() }
  return (
    <Modal open={open} onClose={onClose} title="تفويض موظف" sub={`${requestId} · ${r?.project ?? ''}`} width="sm" footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button onClick={submit} disabled={!to}>{type === 'direct' ? 'إنشاء وتفعيل التفويض' : 'إرسال التفويض'}</Button></>}>
      <div className="grid gap-3">
        <Callout tone="info" compact>{type === 'direct' ? <span><b>تفويض مباشر</b> — يصبح فعّالاً فوراً لأنك تملك صلاحية التفويض الأصلية، ويُشعر الموظف.</span> : <span><b>تفويض غير مباشر</b> — يصبح فعّالاً بعد قبول الموظف المفوَّض إليه، ويقتصر على نطاق تفويضك.</span>}</Callout>
        <Field label="نطاق التفويض"><Select value={scope} onChange={e => setScope(e.target.value as any)}><option value="request">الطلب كاملاً — {requestId}</option><option value="test">اختبار محدد</option></Select></Field>
        {scope === 'test' && <Field label="الاختبار"><Select value={tid} onChange={e => setTid(e.target.value)}>{r?.tests.map(t => <option key={t.id} value={t.id}>{refTests.find(x => x.id === t.refTestId)?.nameAr}</option>)}</Select></Field>}
        <Field label="الموظف المفوَّض إليه" required><Select value={to} onChange={e => setTo(e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.position === 'principal' ? 'المفوّض الرئيسي' : 'موظف'}</option>)}</Select></Field>
        <div className="meta">الحالة بعد الإنشاء: <Badge tone={type === 'direct' ? 'ok' : 'warn'} size="xs">{type === 'direct' ? 'فعّال' : 'بانتظار القبول'}</Badge> · يُسجَّل في سجل التدقيق</div>
      </div>
    </Modal>
  )
}
