import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { Button, Field, Input, Callout, Card, Checkbox, cx, KV, Select } from '@/ds/primitives'
import { Step } from '@/ds/composite'
import { MiyarLogo, MomrahLogo, IdoLogo } from '@/ds/Logo'
import { useStore, useSel } from '@/lib/store'
import { isCommercialRegistration, isSaudiMobile, normalizeSaudiMobile, onlyDigits } from '@/lib/phone'

export default function Register() {
  const nav = useNavigate()
  const counts = useSel(s => ({ lab: s.orgs.filter(o => o.type === 'lab' && o.active).length, contractor: s.orgs.filter(o => o.type === 'contractor' && o.active).length, consultant: s.orgs.filter(o => o.type === 'consultant' && o.active).length }))
  const seededTypes = [
    { code: 'lab', label: 'مختبر', canSelfRegister: true },
    { code: 'contractor', label: 'مقاول', canSelfRegister: true },
    { code: 'consultant', label: 'مكتب استشاري', canSelfRegister: true },
  ]
  const types = useStore(s => {
    const fromServer = s.masters.orgTypes.filter(t => t.canSelfRegister)
    return fromServer.length ? fromServer : seededTypes
  })
  const cities = useStore(s => s.masters.cities)
  const faqs = useStore(s => s.help.faqs.slice(0, 3))
  const submitRegistration = useStore(s => s.submitRegistration)
  const [cr, setCr] = useState('')
  const [orgName, setOrgName] = useState('')
  const [city, setCity] = useState('الرياض')
  const [type, setType] = useState(types[0]?.code ?? 'lab')
  const [rep, setRep] = useState({ name: '', id: '', mobile: '', email: '', saac: '' })
  const [agree, setAgree] = useState(false)
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const step1 = isCommercialRegistration(cr) && orgName.trim().length >= 3
  const step2ok = step1 && rep.name.trim().length >= 3 && /^\d{10}$/.test(onlyDigits(rep.id)) && isSaudiMobile(rep.mobile) && rep.email.includes('@') && agree
  const missing = [
    !isCommercialRegistration(cr) && 'السجل التجاري (١٠ أرقام)',
    orgName.trim().length < 3 && 'اسم المنشأة',
    rep.name.trim().length < 3 && 'اسم المفوّض',
    !/^\d{10}$/.test(onlyDigits(rep.id)) && 'رقم الهوية (١٠ أرقام)',
    !isSaudiMobile(rep.mobile) && 'الجوال 05xxxxxxxx',
    !rep.email.includes('@') && 'البريد الإلكتروني',
    !agree && 'الموافقة على الشروط',
  ].filter(Boolean) as string[]
  const send = async () => {
    setErr(''); setBusy(true)
    try {
      const name = await submitRegistration({
        cr: onlyDigits(cr).slice(0, 10), organization_type: type, organization_name: orgName.trim(),
        principal_name: rep.name.trim(), principal_national_id: onlyDigits(rep.id).slice(0, 10), principal_mobile: normalizeSaudiMobile(rep.mobile), principal_email: rep.email.trim(),
        saac_number: rep.saac || undefined, agreed_terms: 1,
      })
      setDone(name)
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر إرسال الطلب') } finally { setBusy(false) }
  }
  return (
    <div className="grid h-screen overflow-hidden bg-canvas lg:grid-cols-[380px_1fr]">
      <aside className="hidden flex-col justify-between bg-brand-800 p-7 text-white lg:flex">
        <div><MiyarLogo size="md" onDark /><div className="mt-6 rounded-md bg-white px-3 py-2 w-fit"><MomrahLogo height={34} /></div></div>
        <div>
          <h2 className="text-[22px] font-bold leading-snug">تسجيل منشأة في المنصة</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/75">السجل التجاري هو المعرّف الفريد للمنشأة. يتحقق فريق الدعم التقني من الاعتماد يدوياً في المرحلة الحالية حتى توفر الربط الحكومي، ويُفعَّل الحساب خلال يومي عمل.</p>
          <ul className="mt-4 grid gap-1.5 text-[12.5px]">{['التحقق من السجل التجاري', 'المفوّض الرئيسي يمثّل المنشأة قانونياً', 'اعتماد SAAC (ISO/IEC 17025) يظهر شارة في الدليل'].map(t => <li key={t} className="flex items-center gap-2"><ShieldCheck className="size-3.5 shrink-0 text-lime-300" />{t}</li>)}</ul>
          <div className="mt-4 grid grid-cols-3 gap-2">{[[String(counts.lab), 'مختبراً معتمداً'], [String(counts.contractor), 'مقاولاً'], [String(counts.consultant), 'مكتباً استشارياً']].map(([v, l]) => <div key={l} className="rounded-sm bg-white/10 px-2 py-2 text-center"><div className="num text-[17px] font-bold">{v}</div><div className="text-[10.5px] text-white/70">{l}</div></div>)}</div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-white/60"><span>الإدارة العامة لكود البناء السعودي</span><span className="flex items-center gap-1.5">نُفّذ بواسطة <IdoLogo height={14} className="brightness-0 invert opacity-80" /></span></div>
      </aside>
      <section className="overflow-y-auto p-5 lg:p-8">
        {done ? <Card className="mx-auto mt-10 max-w-md text-center"><CheckCircle2 className="mx-auto size-12 text-ok-500" /><h1 className="mt-2 text-xl font-bold">استُلم طلب التسجيل</h1><p className="mt-2 text-[13px] text-ink-600">سيراجع فريق الدعم التقني بيانات المنشأة ويتحقق من اعتمادها خلال يومي عمل. يصلك إشعار على {rep.mobile} عند التفعيل.</p><KV cols={2} dense items={[{ k: 'رقم الطلب', v: done }, { k: 'المنشأة', v: orgName }]} /><Button className="mt-4" onClick={() => nav('/login')}>العودة لتسجيل الدخول</Button></Card> : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between lg:hidden"><MiyarLogo size="sm" /><MomrahLogo height={28} /></div>
            <h1 className="text-[20px] font-bold">تسجيل منشأة جديدة</h1><p className="meta mb-4">بيانات المنشأة والمفوّض الرئيسي — يُراجع الطلب من الدعم التقني</p>
            <div className="grid gap-3">
              <Step n={1} title="بيانات المنشأة" state={step1 ? 'done' : 'active'}><div className="grid gap-3 sm:grid-cols-2"><Field label="رقم السجل التجاري" required hint={`${onlyDigits(cr).length}/10 أرقام`}><Input value={cr} onChange={e => setCr(onlyDigits(e.target.value).slice(0, 10))} className="ltr text-start" inputMode="numeric" placeholder="10 أرقام" /></Field><Field label="اسم المنشأة" required><Input value={orgName} onChange={e => setOrgName(e.target.value)} /></Field><Field label="المدينة">{cities.length ? <Select value={city} onChange={e => setCity(e.target.value)}><option value="">اختر…</option>{cities.filter(c => !c.isGroup).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</Select> : <Input value={city} onChange={e => setCity(e.target.value)} />}</Field></div></Step>
              <Step n={2} title="نوع المنشأة وبيانات المفوّض الرئيسي" state={!step1 ? 'locked' : step2ok ? 'done' : 'active'}><div className="grid gap-3"><div className="grid grid-cols-3 gap-2">{types.map(t => <button key={t.code} type="button" onClick={() => setType(t.code)} className={cx('rounded-sm border px-3 py-2 text-[13px] font-semibold', type === t.code ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-300 bg-ink-0 text-ink-700')}>{t.label}</button>)}</div><Callout tone="info" compact>بإنشاء الحساب يُقرّ المفوّض الرئيسي بأنه يمثّل المنشأة قانونياً ويلتزم بشروط المنصة ويتحمّل مسؤولية حسابات الموظفين (A.S.05، A.S.09).</Callout><div className="grid gap-3 sm:grid-cols-2"><Field label="اسم المفوّض الرئيسي" required><Input value={rep.name} onChange={e => setRep({ ...rep, name: e.target.value })} /></Field><Field label="رقم الهوية الوطنية" required hint={`${onlyDigits(rep.id).length}/10`}><Input value={rep.id} onChange={e => setRep({ ...rep, id: onlyDigits(e.target.value).slice(0, 10) })} className="ltr text-start" inputMode="numeric" /></Field><Field label="رقم الجوال" required hint="05xxxxxxxx"><Input value={rep.mobile} onChange={e => setRep({ ...rep, mobile: normalizeSaudiMobile(e.target.value) })} className="ltr text-start" inputMode="tel" placeholder="05xxxxxxxx" /></Field><Field label="البريد الإلكتروني" required><Input value={rep.email} onChange={e => setRep({ ...rep, email: e.target.value })} className="ltr text-start" type="email" /></Field>{type === 'lab' && <Field label="رقم اعتماد المركز السعودي للاعتماد" hint="اختياري — ISO/IEC 17025" className="sm:col-span-2"><Input value={rep.saac} onChange={e => setRep({ ...rep, saac: e.target.value })} className="ltr text-start" placeholder="SAC-L-YYYY-NNN" /></Field>}</div><Checkbox checked={agree} onChange={setAgree} label={<>أوافق على شروط وأحكام المنصة وسياسة الخصوصية</>} /></div></Step>
              <Step n={3} title="إرسال الطلب" state={!step2ok ? 'locked' : 'active'}><div className="grid gap-2"><Button onClick={send} disabled={!step2ok} loading={busy}>إرسال طلب التسجيل</Button>{!step2ok && missing.length > 0 && <p className="text-[12px] text-warn-700">أكمل: {missing.join(' · ')}</p>}{err && <p className="text-[12px] text-danger-600">{err}</p>}</div></Step>
            </div>
            {!step1 && <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Card pad={false} className="p-3"><div className="section-title mb-2 text-[12.5px]">ما تحتاجه قبل البدء</div><ul className="grid gap-1.5 text-[12px] text-ink-700">{[['رقم السجل التجاري (10 أرقام)', 'يُراجع يدوياً حتى ربط واثق'], ['هوية المفوّض الرئيسي وجواله', 'يُرسل عليه رمز OTP بعد التفعيل'], ['شهادة اعتماد SAAC للمختبرات', 'اختياري — يظهر كشارة'], ['بريد إلكتروني رسمي للمنشأة', 'للإشعارات والفواتير']].map(([t, d]) => <li key={t} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok-500" /><span><span className="font-medium">{t}</span><span className="meta block">{d}</span></span></li>)}</ul></Card>
              <Card pad={false} className="p-3"><div className="section-title mb-2 text-[12.5px]">أسئلة شائعة</div><ul className="grid gap-2 text-[12px]">{faqs.length ? faqs.map(f => <li key={f.id}><div className="font-semibold text-ink-900">{f.q}</div><div className="text-ink-600">{f.a}</div></li>) : <li className="text-ink-500">تظهر الأسئلة من الخادم بعد ضبط العنوان.</li>}</ul></Card>
            </div>}
            <p className="mt-4 text-center text-[12px] text-ink-500">لديك حساب؟ <Link to="/login" className="font-semibold text-brand-700 hover:underline">تسجيل الدخول</Link></p>
          </div>
        )}
      </section>
    </div>
  )
}
