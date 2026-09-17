import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { CheckCircle2, XCircle, FileText, History, Sparkles } from 'lucide-react'
import { TestSheet } from '@/features/evidence/Evidence'
import EngineAdvisor from '@/features/engine/EngineAdvisor'
import { useStore } from '@/lib/store'
import { PageHeader, Countdown, Timeline } from '@/ds/composite'
import { Section, Field, Textarea, Button, Callout, KV, Code, Badge, Table, Th, Td, Modal, Kpi } from '@/ds/primitives'
import { fmtDateTime, fmtDate } from '@/lib/format'
import { openFile, downloadUrl } from '@/lib/files'

export default function ReviewResult() {
  const { id, testId } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)!
  const r = useStore(s => s.requests.find(x => x.id === id))
  const refTests = useStore(s => s.refTests)
  const orgs = useStore(s => s.orgs)
  const requests = useStore(s => s.requests)
  const decide = useStore(s => s.consultantDecide)
  const refLimits = useStore(s => s.refLimits)
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState<'ok' | 'no' | null>(null)
  const [advisor, setAdvisor] = useState(false)
  // The route element is reused when moving to the next output in the queue — reset the form per test
  useEffect(() => { setConfirm(null); setNotes(''); setReason(''); setAdvisor(false) }, [testId])
  const t = r?.tests.find(x => x.id === testId)
  const rt = refTests.find(x => x.id === t?.refTestId)
  if (!r || !t || !rt) return <Callout tone="danger">المخرج غير موجود.</Callout>
  const canApprove = useStore.getState().can('output.approve') // matrix #24/#25 — المفوّض الرئيسي للاستشاري
  const decided = t.status === 'STS20' || t.status === 'STS21'
  const pending = t.status === 'STS19'
  const lab = orgs.find(o => o.id === r.labId)
  // historical results for the same test at the same lab — helps the consultant judge consistency
  const history = requests.flatMap(x => x.tests.filter(y => y.refTestId === t.refTestId && y.result && y.id !== t.id && x.labId === r.labId).map(y => ({ r: x, t: y }))).slice(0, 5)
  // next outputs awaiting this office, excluding the one on screen, nearest deadline first
  const queue = requests.filter(x => x.consultantId === user.orgId).flatMap(x => x.tests.filter(y => y.status === 'STS19' && y.id !== t.id).map(y => ({ r: x, t: y }))).sort((a, b) => (a.t.deadlineAt ?? '9').localeCompare(b.t.deadlineAt ?? '9'))

  return (
    <>
      <PageHeader crumbs={[{ label: 'اعتماد النتائج', to: '/approvals' }, { label: r.id, to: `/requests/${r.id}` }, { label: `مراجعة ${rt.nameAr}` }]} title={`مراجعة نتيجة — ${rt.nameAr}`} sub={`${r.id} · ${r.project} · ${lab?.name} · رُفعت ${fmtDateTime(t.submittedAt)}`}
        meta={<>{pending && <Countdown until={t.deadlineAt} label="متبقٍ للاعتماد" autoLabel="سيُعتمد تلقائياً بعد انتهاء المدة" />}{pending ? <Badge tone="warn" size="xs">بانتظار قرارك</Badge> : <Badge tone={t.status === 'STS20' ? 'ok' : 'danger'} size="xs">{t.status === 'STS20' ? (t.autoApproved ? 'اعتُمد تلقائياً' : 'معتمد') : 'مرفوض'} · {fmtDateTime(t.decidedAt)}</Badge>}{t.status === 'STS18' && <Badge tone="neutral" size="xs">لم يُرفع المخرج بعد</Badge>}<Code>{t.method}</Code></>} />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 xl:col-span-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="التزام المختبر بالمواعيد" value={`${lab?.onTime ?? '—'}%`} tone={(lab?.onTime ?? 0) >= 90 ? 'ok' : 'warn'} /><Kpi label="تقييم المختبر" value={lab?.rating.toFixed(1) ?? '—'} unit="/ 5" hint={`${lab?.reviews} تقييم`} /><Kpi label="اعتمادات تلقائية سابقة" value={lab?.autoApprovals ?? 0} tone={(lab?.autoApprovals ?? 0) > 2 ? 'warn' : 'neutral'} hint="لهذا المختبر" /><Kpi label="في قائمة انتظارك" value={queue.length} unit="مخرج" hint="شاملاً هذا المخرج" tone={queue.length > 3 ? 'warn' : 'neutral'} /></div>
          <Section title="نتائج الاختبار" bodyClass="p-0"><Table className="border-0"><thead><tr><Th>الحقل</Th><Th>القيمة</Th><Th>الوحدة</Th><Th>المرجع / الحد</Th></tr></thead><tbody>{(rt.resultFields ?? []).map(f => <tr key={f.key}><Td>{f.label}</Td><Td className="num text-[14px] font-bold">{t.result?.[f.key] ?? '—'}</Td><Td className="text-ink-500">{f.unit}</Td><Td className="text-[11.5px] text-ink-600">{(() => { const l = refLimits[t.refTestId]?.find(x => x.key === f.key); return l ? <><span>{l.rule}</span><span className="meta block">{l.ref}</span></> : <span className="meta">وفق مواصفات المشروع</span> })()}</Td></tr>)}</tbody></Table>{t.notes && <p className="border-t border-ink-100 px-3 py-2 text-[12.5px] text-ink-600"><b>ملاحظات المختبر:</b> {t.notes}</p>}</Section>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="بيانات العينة" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'رقم العينة', v: t.sample?.id }, { k: 'العمق', v: t.sample ? `${t.sample.depth} م` : '—' }, { k: 'الفني المنفذ', v: t.sample?.technician }, { k: 'التحقق الجغرافي', v: t.sample?.geoVerified ? <Badge tone="ok" size="xs">مطابق</Badge> : <Badge tone="danger" size="xs">خارج النطاق</Badge> }, { k: 'الاستلام', v: fmtDateTime(t.sample?.receivedAt) }, { k: 'تأكيد المقاول', v: t.sample?.confirmedByContractor ? fmtDateTime(t.sample.confirmedAt ?? t.startedAt) : 'لم يُؤكَّد' }]} /></Section>
            <Section title="التقرير المرفق" icon={FileText} bodyClass="p-3">{t.report ? <div className="flex items-center justify-between rounded-sm border border-ink-200 bg-ink-50 px-3 py-2"><div><div className="text-[12.5px] font-semibold text-brand-700">{t.report.name}</div><div className="meta">{t.report.size || 'PDF'} · موقّع رقمياً من المختبر</div></div><div className="flex gap-1"><Button variant="secondary" size="xs" onClick={() => openFile(t.report?.file)}>عرض</Button><Button variant="secondary" size="xs" onClick={() => downloadUrl(t.report!.file || '', t.report!.name)}>تنزيل</Button></div></div> : <span className="meta">لا يوجد مرفق</span>}</Section>
          </div>
          <Section title="ورقة الاختبار والأدلة" icon={FileText} desc="طريقة القياس، المعدات ومعايرتها، الصور بالوقت والإحداثيات، وسلسلة حيازة العينة" bodyClass="p-3"><TestSheet requestId={r.id} testId={t.id} /></Section>
          <Section title="نتائج سابقة لنفس الاختبار من نفس المختبر" icon={History} desc="للمقارنة والاتساق" bodyClass="p-0"><Table className="border-0"><thead><tr><Th>الطلب</Th><Th>المشروع</Th>{(rt.resultFields ?? []).map(f => <Th key={f.key}>{f.label.split(' ')[0]}</Th>)}<Th>القرار</Th><Th>التاريخ</Th></tr></thead><tbody>{history.map(({ r: x, t: y }) => <tr key={y.id}><Td><Link to={`/requests/${x.id}`} className="font-semibold text-brand-700">{x.id}</Link></Td><Td className="max-w-48 truncate">{x.project}</Td>{(rt.resultFields ?? []).map(f => <Td key={f.key} className="num">{y.result?.[f.key] ?? '—'}</Td>)}<Td><Badge tone={y.status === 'STS21' ? 'danger' : 'ok'} size="xs">{y.status === 'STS21' ? 'مرفوض' : 'معتمد'}</Badge></Td><Td className="num">{fmtDate(y.decidedAt)}</Td></tr>)}{history.length === 0 && <tr><Td colSpan={6} className="text-center text-ink-500">لا توجد نتائج سابقة مقارنة</Td></tr>}</tbody></Table></Section>
        </div>
        <Section title="قرار المكتب الاستشاري" className="col-span-12 self-start border-brand-300 ring-2 ring-brand-100 xl:col-span-4" bodyClass="p-3">
          {decided && <Callout tone={t.status === 'STS20' ? 'ok' : 'danger'} compact className="mb-3"><b>صدر القرار:</b> {t.status === 'STS20' ? (t.autoApproved ? 'اعتماد تلقائي بانتهاء المهلة' : 'اعتماد') : `رفض — ${t.rejectReason}`} · {fmtDateTime(t.decidedAt)}. لا يمكن تغيير القرار؛ الإعادة تكون بطلب مستقل من المقاول (B.R.153).</Callout>}
          {!decided && !pending && <Callout tone="info" compact className="mb-3">لم يرفع المختبر مخرج هذا الاختبار بعد — يظهر هنا للقرار فور رفعه.</Callout>}
          {pending && !canApprove && <Callout tone="warn" compact className="mb-3">بصفتك موظفاً يمكنك المراجعة وإضافة الملاحظات؛ الاعتماد والرفض صلاحية المفوّض الرئيسي (مصفوفة الصلاحيات — بندا 24 و25).</Callout>}
          {pending && (
            <div className="mb-3 rounded-sm border border-info-100 bg-info-25 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink-900">لست متأكداً من القرار؟</div>
                  <p className="meta">استشر المحرك الذكي — يقرأ التقرير مقابل المرجع المعتمد ويُظهر ما ينقص وما يتعارض</p>
                </div>
                <Button size="sm" variant="secondary" icon={Sparkles} className="shrink-0" onClick={() => setAdvisor(true)}>استشارة</Button>
              </div>
            </div>
          )}
          <div className="grid gap-3"><Field label="ملاحظات المراجعة"><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-16" /></Field><Field label="سبب الرفض الفني" hint="إلزامي عند الرفض — يظهر للمقاول والمختبر ويُتيح طلب إعادة"><Textarea value={reason} onChange={e => setReason(e.target.value)} className="min-h-16" /></Field>
            <Button variant="success" icon={CheckCircle2} disabled={!canApprove || !pending} onClick={() => setConfirm('ok')}>اعتماد النتيجة</Button><Button variant="danger" icon={XCircle} disabled={!canApprove || !pending || reason.trim().length < 5} onClick={() => setConfirm('no')}>رفض وطلب إعادة</Button></div>
          <div className="mt-3 border-t border-ink-100 pt-2"><div className="data-label mb-1">سجل المخرج</div><Timeline entries={r.history.filter(h => h.action.includes(rt.nameAr))} limit={4} /></div>
        </Section>
      </div>
      <EngineAdvisor open={advisor} onClose={() => setAdvisor(false)}
        title={`مراجعة نتيجة — ${rt.nameAr}`}
        subtitle={`${r.id} · ${r.project} · ${lab?.name}${t.report ? ` · المرفق ${t.report.name}` : ''}`}
        requestId={r.id} testId={t.id} defaultProfile="الفحص والتقييم الإنشائي" />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'ok' ? 'اعتماد النتيجة' : 'رفض النتيجة وطلب إعادة'} width="sm" footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>تراجع</Button><Button variant={confirm === 'ok' ? 'success' : 'danger'} onClick={() => { decide(r.id, t.id, confirm === 'ok', reason); setConfirm(null); nav(queue.length ? `/requests/${queue[0].r.id}/tests/${queue[0].t.id}/review` : `/requests/${r.id}`) }}>{confirm === 'ok' ? 'نعم، اعتمد' : 'نعم، ارفض'}</Button></>}><p className="text-[13px]">{confirm === 'ok' ? `هل تريد اعتماد نتيجة ${rt.nameAr}؟ سيُشعر المقاول والمختبر بالاعتماد ويُسجَّل قرارك في سجل التدقيق.` : 'سيُشعر المقاول بالرفض وبالسبب الفني، ويتمكن من إنشاء طلب إعادة اختبار مستقل مرتبط بهذا الطلب.'}{queue.length > 0 && <span className="meta block mt-2">سيُفتح المخرج التالي الأقرب مهلةً في قائمة الانتظار تلقائياً (متبقٍ {queue.length}).</span>}</p></Modal>
    </>
  )
}
