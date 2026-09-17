import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck, Smartphone, ArrowRight, Fingerprint, Building2, Server } from 'lucide-react'
import { useStore, useSel } from '@/lib/store'
import { getBackend, setBackendUrl } from '@/lib/backend'
import { Button, Field, Input, Badge } from '@/ds/primitives'
import { MiyarLogo, MomrahLogo, IdoLogo } from '@/ds/Logo'

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p.startsWith('/') ? p : `/${p}`}`

export default function Login() {
  const stats = useSel(s => { const done = s.requests.flatMap(r => r.tests).filter(t => t.status === 'STS20').length; const decided = s.requests.flatMap(r => r.tests).filter(t => t.decidedAt); const onTime = decided.length ? Math.round((decided.filter(t => !t.autoApproved).length / decided.length) * 100) : 0; return { done, onTime, studies: s.requests.filter(r => r.service === 'geotech').length, labs: s.orgs.filter(o => o.type === 'lab' && o.active).length } })
  const live = useStore(s => s.live)
  const requestOtp = useStore(s => s.requestOtp)
  const loginLive = useStore(s => s.loginLive)
  const nav = useNavigate()
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile')
  const [mobile, setMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [srv, setSrv] = useState(getBackend().url)
  const [srvOpen, setSrvOpen] = useState(!getBackend().url)

  const submitMobile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!getBackend().url) return setErr('أضِف عنوان الخادم أولاً')
    if (!/^05\d{8}$/.test(mobile)) return setErr('أدخل رقم جوال سعودي صحيح يبدأ بـ 05')
    setErr(''); setBusy(true)
    try {
      const res = await requestOtp(mobile)
      setHint(res.dev_otp ? `بيئة تطوير — الرمز ${res.dev_otp}` : 'أُرسل الرمز إلى جوالك المسجَّل')
      setStep('otp')
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر إرسال الرمز') } finally { setBusy(false) }
  }

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 4) return setErr('رمز التحقق مكوّن من 4 أرقام')
    setErr(''); setBusy(true)
    try { await loginLive(mobile, otp); nav('/') } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر تسجيل الدخول') } finally { setBusy(false) }
  }

  const saveServer = async () => {
    setBackendUrl(srv)
    useStore.setState({ live: !!srv.trim() })
    setSrvOpen(false); setErr(''); setStep('mobile')
    await useStore.getState().hydrate()
  }

  return (
    <div className="grid h-screen overflow-hidden bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-8 text-white lg:flex">
        <img src={asset('/brand/momrah-hero.jpg')} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top" />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,51,45,0.45) 0%, rgba(16,72,64,0.25) 30%, rgba(16,72,64,0.78) 58%, rgba(16,72,64,0.96) 78%, #0B332D 100%)' }} />
        <div className="relative flex items-center justify-between">
          <MiyarLogo size="lg" onDark />
          <div className="rounded-md bg-white/95 px-3 py-2 shadow-md"><MomrahLogo height={38} /></div>
        </div>
        <div className="relative max-w-lg">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11.5px] font-medium backdrop-blur-sm"><ShieldCheck className="size-3.5 text-lime-300" />متوافق مع كود البناء السعودي SBC 303 · كود المنصات</div>
          <h2 className="text-[30px] font-bold leading-[1.35] text-white">من العقد إلى شهادة الإتمام — رحلة موحّدة لاختبارات التربة والطرق</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-white/75">المقاول والمختبر والمكتب الاستشاري والجهة الإشرافية في بيئة رقمية واحدة.</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[[stats.done.toLocaleString('en-US'), 'مخرج اختبار معتمد'], [`${stats.onTime}%`, 'اعتماد ضمن المهلة'], [String(stats.studies), 'دراسة جيوتقنية']].map(([v, l]) => <div key={l} className="rounded-md border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm"><div className="num text-[22px] font-bold leading-none">{v}</div><div className="mt-1 text-[11px] text-white/75">{l}</div></div>)}
          </div>
        </div>
        <div className="relative flex items-center justify-between text-[11px] text-white/60">
          <span>الإدارة العامة لكود البناء السعودي · وزارة البلديات والإسكان</span>
          <span className="flex items-center gap-1.5">نُفّذ بواسطة <IdoLogo height={16} className="brightness-0 invert opacity-80" /></span>
        </div>
      </section>

      <section className="flex h-screen flex-col overflow-hidden px-6 py-5 lg:px-12">
        <div className="flex items-center justify-between lg:hidden"><MiyarLogo size="sm" /><MomrahLogo height={30} /></div>
        <div className="my-auto grid w-full max-w-md gap-5 self-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-bold">تسجيل الدخول</h1>
              {live ? <Badge tone="ok" dot size="xs">مربوط بالخادم</Badge> : <Badge tone="warn" dot size="xs">بانتظار عنوان الخادم</Badge>}
            </div>
            {typeof window !== 'undefined' && (window as unknown as { __MIYAR_EMBEDDED__?: boolean }).__MIYAR_EMBEDDED__ ? (
              <p className="meta mt-0.5">إذا كنت مسجّلاً في النظام سيتم دخولك تلقائياً بنفس الحساب…</p>
            ) : (
              <p className="meta mt-0.5">{step === 'mobile' ? 'أدخل رقم الجوال المسجّل لمنشأتك — يصلك رمز تحقق OTP' : `أُرسل رمز التحقق إلى ${mobile}`}</p>
            )}
          </div>
          {step === 'mobile' ? (
            <form onSubmit={submitMobile} className="grid gap-3">
              <Field label="رقم الجوال" required error={err}><Input prefixIcon={Smartphone} value={mobile} onChange={e => setMobile(e.target.value)} placeholder="05xxxxxxxx" inputMode="tel" className="ltr h-10 text-start text-[14px]" autoFocus /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Button type="submit" size="lg" loading={busy} disabled={!live}>إرسال رمز التحقق</Button>
                <Button type="button" size="lg" variant="secondary" icon={Fingerprint} disabled title="نفاذ غير مربوط بعد على الخادم">الدخول عبر نفاذ</Button>
              </div>
              <p className="text-center text-[12px] text-ink-500">ليس لديك حساب؟ <Link to="/register" className="font-semibold text-brand-700 hover:underline">سجّل منشأتك</Link> · <Link to="/directory" className="font-semibold text-brand-700 hover:underline">تصفّح الدليل كزائر</Link></p>
            </form>
          ) : (
            <form onSubmit={submitOtp} className="grid gap-3">
              <Field label="رمز التحقق (OTP)" required error={err} hint={hint || 'أدخل الرمز المرسل إلى جوالك'}><Input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" inputMode="numeric" className="ltr h-11 text-center text-2xl tracking-[0.5em]" autoFocus /></Field>
              <Button type="submit" size="lg" loading={busy}>تأكيد الدخول</Button>
              <button type="button" onClick={() => setStep('mobile')} className="flex items-center justify-center gap-1 text-[12px] text-ink-500 hover:text-ink-800"><ArrowRight className="size-3" />تغيير رقم الجوال</button>
            </form>
          )}

          <div className="rounded-sm border border-ink-200 bg-ink-0 p-2.5">
            {srvOpen ? (
              <div className="grid gap-2">
                <Field label="عنوان خادم معيار" hint="مثال: http://localhost:8010">
                  <Input value={srv} onChange={e => setSrv(e.target.value)} placeholder="http://localhost:8010" inputMode="url" className="ltr h-8 text-start" />
                </Field>
                <div className="flex gap-2"><Button size="sm" onClick={saveServer} disabled={!srv.trim()}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => { setSrv(getBackend().url); setSrvOpen(false) }}>إلغاء</Button></div>
              </div>
            ) : (
              <button type="button" onClick={() => setSrvOpen(true)} className="flex w-full items-center gap-2 text-[12px] text-ink-600 hover:text-ink-900">
                <Server className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-start">{live ? <>الخادم: <span className="ltr">{getBackend().url}</span></> : 'لم يُضبط عنوان الخادم'}</span>
                <span className="shrink-0 font-semibold text-brand-700">تغيير</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-500">
          <span className="flex items-center gap-1"><Building2 className="size-3.5" />الإدارة العامة لكود البناء السعودي</span>
          <span className="flex items-center gap-1.5 lg:hidden">نُفّذ بواسطة <IdoLogo height={14} /></span>
          <span className="hidden lg:inline">سياسة الخصوصية · شروط الاستخدام</span>
        </div>
      </section>
    </div>
  )
}
