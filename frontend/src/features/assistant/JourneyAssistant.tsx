import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Sparkles, X, ChevronLeft, ChevronRight, MessageCircle, Map, Compass,
  CheckCircle2, Circle, ArrowLeft, HelpCircle, Send,
} from 'lucide-react'
import { useStore, useSel, visibleRequests } from '@/lib/store'
import { ROLE_LABEL, POSITION_LABEL } from '@/lib/roles'
import { Badge, Button, Callout, Progress, cx } from '@/ds/primitives'
import { journeyFor, type JourneyStep } from './journeys'

/** Pin to viewport bottom — avoids parent overflow/transform breaking `fixed`. */
const DOCK: CSSProperties = {
  position: 'fixed',
  bottom: 20,
  insetInlineEnd: 20,
  zIndex: 1100,
}

type ChatMsg = { id: string; from: 'bot' | 'user'; text: string; to?: string; cta?: string }

type Tab = 'journey' | 'now' | 'ask'

const LS_KEY = 'miyar.journeyAssistant.open'
const LS_SEEN = 'miyar.journeyAssistant.seen'

function filterSteps(steps: JourneyStep[], user: { position: string; canDelegate?: boolean }) {
  return steps.filter(s => {
    if (s.principalOnly && user.position !== 'principal' && !user.canDelegate) return false
    return true
  })
}

export default function JourneyAssistant() {
  const user = useStore(s => s.user)
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('now')
  const [stepIdx, setStepIdx] = useState(0)
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const chatEnd = useRef<HTMLDivElement>(null)
  const reqs = useSel(visibleRequests)
  const delegations = useStore(s => s.delegations)
  const contracts = useStore(s => s.contracts)
  const ratings = useStore(s => s.ratings)
  const invoices = useStore(s => s.invoices)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, open ? '1' : '0') } catch { /* */ }
  }, [open])

  useEffect(() => {
    const openEv = () => {
      setOpen(true)
      setTab('now')
    }
    window.addEventListener('miyar:open-journey', openEv)
    return () => window.removeEventListener('miyar:open-journey', openEv)
  }, [])

  useEffect(() => {
    if (!user) return
    try {
      // First visit: remember user, keep FAB closed at the bottom (don't pop a full panel).
      if (localStorage.getItem(LS_SEEN) !== user.id) {
        localStorage.setItem(LS_SEEN, user.id)
        localStorage.setItem(LS_KEY, '0')
        setOpen(false)
      }
    } catch { /* */ }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'ask' || !open) return
    chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [msgs, open, tab])

  const def = journeyFor((user?.role ?? 'visitor') as import('@/lib/types').Role)
  const steps = useMemo(() => (user ? filterSteps(def.steps, user) : []), [def.steps, user])
  const step = steps[Math.min(stepIdx, Math.max(0, steps.length - 1))]

  const nextActions = useMemo(() => {
    if (!user) return []
    const out: { title: string; body: string; to: string; tone: 'warn' | 'info' | 'ok' | 'danger' }[] = []
    if (user.role === 'lab') {
      const n = reqs.filter(r => r.labId === user.orgId && r.status === 'STS11').length
      if (n) out.push({ title: `${n} طلب بانتظار قرارك`, body: 'قبول مع موعد أو رفض بسبب — قبل انتهاء المهلة.', to: '/requests', tone: 'warn' })
    }
    if (user.role === 'consultant') {
      const n = reqs.filter(r => r.consultantId === user.orgId && r.tests.some(t => t.status === 'STS19')).length
      if (n) out.push({ title: `${n} مخرج للاعتماد`, body: 'راجع النتائج قبل الاعتماد التلقائي.', to: '/approvals', tone: 'warn' })
      const plans = reqs.filter(r => r.consultantId === user.orgId && r.status === 'STS10').length
      if (plans) out.push({ title: `${plans} خطة استكشاف`, body: 'اعتماد الخطة قبل الميدان.', to: '/requests', tone: 'info' })
    }
    if (user.role === 'contractor') {
      const drafts = reqs.filter(r => r.contractorId === user.orgId && r.status === 'STS09').length
      if (drafts && user.position === 'principal') out.push({ title: `${drafts} مسودة`, body: 'أكمل وأرسل الطلب.', to: '/requests', tone: 'info' })
      const rate = contracts.filter(c => !c.active && c.contractorId === user.orgId && !ratings.some(r => r.contractId === c.id && r.contractorId === user.orgId))
      if (rate.length) out.push({ title: 'قيّم المختبر', body: `${rate.length} عقد منتهٍ بانتظار التقييم قبل الشهادة.`, to: '/results', tone: 'info' })
      const overdue = invoices.filter(i => i.contractorId === user.orgId && i.status === 'overdue').length
      if (overdue) out.push({ title: `${overdue} فاتورة متأخرة`, body: 'التأخر قد يمنع شهادة الإتمام.', to: '/invoices', tone: 'danger' })
    }
    const pendingDel = delegations.filter(d => d.toUserId === user.id && d.status === 'STS22').length
    if (pendingDel) out.push({ title: `${pendingDel} تفويض بانتظارك`, body: 'اقبل أو ارفض التفويض غير المباشر.', to: '/delegations', tone: 'info' })
    if (user.role === 'support' || user.role === 'admin') {
      out.push({ title: 'مراجعة الحسابات', body: 'فعّل طلبات التسجيل المعلّقة.', to: '/admin/accounts', tone: 'info' })
    }
    if (!out.length) {
      out.push({
        title: 'لا مهام عاجلة الآن',
        body: `تصفّح رحلتك كـ${ROLE_LABEL[user.role]} أو اسأل المساعد عن أي خطوة.`,
        to: steps[0]?.to || '/',
        tone: 'ok',
      })
    }
    return out.slice(0, 5)
  }, [user, reqs, contracts, ratings, invoices, delegations, steps])

  const pathHint = useMemo(() => {
    const p = loc.pathname
    if (p.startsWith('/requests/new')) return 'أنت في إنشاء طلب — تأكد من العقد الفعّال وبنود الكتالوج.'
    if (p.includes('/execute')) return 'مرحلة التنفيذ: عيّنة مؤكَّدة ← نتائج ← تقرير PDF ← رفع.'
    if (p.includes('/review') || p.startsWith('/approvals')) return 'اعتماد المخرج: قبول أو رفض بسبب واضح.'
    if (p.includes('/study')) return 'رحلة الدراسة الجيوتقنية: مراحل 1→6 حتى اعتماد التقرير.'
    if (p.startsWith('/delegations')) return 'التفويض: مباشر يفعّل فوراً · غير مباشر ينتظر القبول.'
    if (p.startsWith('/engine')) return 'المحرك يراجع التقارير مقابل المعرفة والكود — لا يغني عن اعتمادك.'
    if (p.startsWith('/results')) return 'النتائج والشهادات: قيّم المختبر أولاً لتحميل شهادة الإتمام.'
    if (p.startsWith('/catalog')) return 'الكتالوج أساس التسعير والعروض — حدّث SLA والأسعار.'
    if (p.startsWith('/admin/rules')) return 'القواعد تُجمَّد على الطلب عند الإرسال.'
    return def.tagline
  }, [loc.pathname, def.tagline])

  const progressPct = useMemo(() => {
    if (!user) return 0
    let done = 0
    const total = Math.max(1, steps.length)
    if (user.role === 'contractor') {
      if (contracts.some(c => c.contractorId === user.orgId)) done++
      if (reqs.length) done++
      if (reqs.some(r => ['STS15', 'STS14', 'STS12'].includes(r.status))) done++
      if (ratings.some(r => r.contractorId === user.orgId)) done++
    } else if (user.role === 'lab') {
      if (reqs.some(r => r.labId === user.orgId)) done++
      if (reqs.some(r => r.labId === user.orgId && ['STS12', 'STS14', 'STS15'].includes(r.status))) done++
      if (reqs.some(r => r.tests.some(t => t.status === 'STS19' || t.status === 'STS20'))) done++
    } else if (user.role === 'consultant') {
      if (reqs.some(r => r.consultantId === user.orgId && r.tests.some(t => t.status === 'STS20'))) done++
      if (reqs.some(r => r.status === 'STS15')) done++
    } else {
      done = Math.min(2, nextActions[0]?.tone === 'ok' ? 2 : 1)
    }
    return Math.min(100, Math.round((done / Math.min(4, total)) * 100))
  }, [user, contracts, reqs, ratings, steps.length, nextActions])

  if (!user || !step) return null

  const pushBot = (text: string, extra?: { to?: string; cta?: string }) => {
    setMsgs(m => [...m, { id: `b-${Date.now()}`, from: 'bot', text, ...extra }])
  }

  const answer = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    setMsgs(m => [...m, { id: `u-${Date.now()}`, from: 'user', text: q }])
    setInput('')
    const low = q.toLowerCase()
    const faq = def.faqs.find(f => low.includes(f.q.slice(0, 8)) || f.q.includes(q.slice(0, 10)) || q.includes(f.q.slice(0, 6)))
    if (faq) {
      pushBot(faq.a, faq.to ? { to: faq.to, cta: 'فتح الصفحة' } : undefined)
      return
    }
    if (/التالي|ماذا أفعل|الخطوة|next|الآن|مطلوب/.test(q)) {
      const a = nextActions[0]
      pushBot(`${a.title}: ${a.body}`, { to: a.to, cta: 'خذني هناك' })
      setTab('now')
      return
    }
    if (/تفويض|موظف|STS22|STS23/.test(q)) {
      pushBot('التفويض المباشر يفعّل فوراً. غير المباشر STS22 حتى يقبل الموظف فيصبح STS23. بعد بدء الميدان التعديل للمفوّض الرئيسي فقط (B.R.235).', { to: '/delegations', cta: 'صفحة التفويض' })
      return
    }
    if (/شهادة|تقييم|إتمام|اتمام/.test(q)) {
      pushBot('شهادة إتمام الاختبارات للمقاول بعد انتهاء العقد وتقييم المختبر مرة واحدة (B.R.127). الفاتورة المتأخرة قد تمنع الإصدار.', { to: '/results', cta: 'النتائج والشهادات' })
      return
    }
    if (/مهلة|SLA|تأخير|deadline/.test(q)) {
      pushBot('المهل مضبوطة في قواعد الأعمال وتُجمَّد عند إرسال الطلب. تجاوز مدة التنفيذ ينعكس على التزام المختبر (B.R.155/156).', { to: user.role === 'admin' ? '/admin/rules' : '/requests', cta: 'متابعة' })
      return
    }
    if (/جيوتق|جسة|دراسة|تقرير/.test(q)) {
      pushBot('رحلة الدراسة: أولية → خطة → ميدان/جسات → معمل → تحليل → تقرير. اعتماد التقرير يولّد الملف من القالب الساري.', { to: '/requests', cta: 'الطلبات' })
      return
    }
    if (/صلاح|ممنوع|لا أستطيع|رفض/.test(q)) {
      pushBot(`صلاحياتك كـ${ROLE_LABEL[user.role]} (${POSITION_LABEL[user.position]}) من ملحق 7.1. إن ظهر زر وخُفي إجراء، فالسيرفر هو الحكم.`, { to: '/governance', cta: 'الحوكمة' })
      return
    }
    // match step titles
    const hit = steps.find(s => q.includes(s.title.slice(0, 6)) || s.title.includes(q.slice(0, 6)))
    if (hit) {
      pushBot(`${hit.title}: ${hit.body}${hit.br ? ` (${hit.br})` : ''}`, hit.to ? { to: hit.to, cta: hit.cta || 'فتح' } : undefined)
      return
    }
    pushBot(`أنا دليل رحلتك كـ${ROLE_LABEL[user.role]}. جرّب: «ما الخطوة التالية؟» أو «التفويض» أو «الشهادة» — أو اختر سؤالاً جاهزاً.`)
  }

  const openAssistant = () => {
    setOpen(true)
    if (!msgs.length) {
      pushBot(`أهلاً ${user.name.split(' ')[0]} 👋 أنا مساعدك في منصة معيار. سأرشدك في «${def.title}» حسب دورك: ${ROLE_LABEL[user.role]} — ${POSITION_LABEL[user.position]}.`)
    }
  }

  const ui = (
    <>
      {/* FAB — docked to viewport bottom (inline-end), opposite side of toasts */}
      {!open && (
        <button
          type="button"
          onClick={openAssistant}
          style={DOCK}
          className="flex items-center gap-2 rounded-full bg-brand-700 px-4 py-3 text-white shadow-pop hover:bg-brand-800"
          aria-label="مساعد الرحلة"
        >
          <span className="relative grid size-8 place-items-center rounded-full bg-white/15">
            <Sparkles className="size-4" />
            {nextActions[0]?.tone === 'warn' || nextActions[0]?.tone === 'danger' ? (
              <span className="absolute -top-0.5 -end-0.5 size-2.5 rounded-full bg-warn-400 ring-2 ring-brand-700" />
            ) : null}
          </span>
          <span className="hidden text-start leading-tight sm:block">
            <span className="block text-[12.5px] font-bold">مساعد الرحلة</span>
            <span className="block text-[10.5px] text-white/75">{def.title}</span>
          </span>
        </button>
      )}

      {open && (
        <div
          style={{ ...DOCK, bottom: 16, insetInlineEnd: 16, display: 'flex' }}
          className="h-[min(520px,calc(100vh-6.5rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-ink-200 bg-ink-0 shadow-pop"
        >
          <header className="flex items-start gap-2 bg-brand-800 px-3 py-2.5 text-white">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15"><Compass className="size-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold">مساعد الرحلة</div>
              <div className="truncate text-[11px] text-white/70">{ROLE_LABEL[user.role]} · {POSITION_LABEL[user.position]} · {user.orgName}</div>
            </div>
            <button type="button" className="grid size-8 place-items-center rounded-sm hover:bg-white/10" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="size-4" /></button>
          </header>

          <div className="flex border-b border-ink-200 bg-ink-25 text-[12px] font-semibold">
            {([
              ['now', 'الآن', MessageCircle],
              ['journey', 'رحلتي', Map],
              ['ask', 'اسألني', HelpCircle],
            ] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cx('flex flex-1 items-center justify-center gap-1.5 py-2.5', tab === k ? 'border-b-2 border-brand-700 text-brand-800' : 'text-ink-500 hover:text-ink-800')}
              >
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'now' && (
              <div className="grid gap-3">
                <Callout tone="info" compact>{pathHint}</Callout>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11.5px]"><span className="font-semibold text-ink-700">تقدّم تقريبي في رحلتك</span><span className="num text-ink-500">{progressPct}%</span></div>
                  <Progress value={progressPct} tone={progressPct >= 70 ? 'ok' : 'accent'} />
                </div>
                <div className="data-label">ماذا تحتاج الآن؟</div>
                <ul className="grid gap-2">
                  {nextActions.map(a => (
                    <li key={a.title}>
                      <button
                        type="button"
                        onClick={() => nav(a.to)}
                        className="flex w-full items-start gap-2 rounded-md border border-ink-200 bg-ink-0 px-3 py-2.5 text-start hover:border-brand-400 hover:bg-brand-50/40"
                      >
                        <Badge tone={a.tone} size="xs" dot>{a.tone === 'ok' ? 'جاهز' : a.tone === 'danger' ? 'عاجل' : a.tone === 'warn' ? 'مطلوب' : 'تنبيه'}</Badge>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold text-ink-900">{a.title}</span>
                          <span className="block text-[11.5px] text-ink-600">{a.body}</span>
                        </span>
                        <ArrowLeft className="mt-1 size-3.5 shrink-0 text-brand-700" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1.5">
                  {['ما الخطوة التالية؟', 'التفويض', 'الشهادة', 'المهل'].map(chip => (
                    <button key={chip} type="button" onClick={() => { setTab('ask'); setTimeout(() => answer(chip), 0) }} className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:border-brand-400 hover:text-brand-800">{chip}</button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'journey' && step && (
              <div className="grid gap-3">
                <div>
                  <div className="text-[14px] font-bold text-brand-900">{def.title}</div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">{def.tagline}</p>
                </div>
                <ol className="grid gap-1.5">
                  {steps.map((s, i) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setStepIdx(i)}
                        className={cx('flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start text-[12px]', i === stepIdx ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-ink-50')}
                      >
                        {i < stepIdx ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok-600" /> : i === stepIdx ? <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-700" /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-ink-300" />}
                        <span className={cx('leading-snug', i === stepIdx ? 'font-semibold text-brand-900' : 'text-ink-700')}>{i + 1}. {s.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="rounded-md border border-ink-200 bg-ink-25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-bold">{step.title}</div>
                    {step.br && <Badge tone="neutral" size="xs">{step.br}</Badge>}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700">{step.body}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      <button type="button" disabled={stepIdx <= 0} onClick={() => setStepIdx(i => Math.max(0, i - 1))} className="grid size-8 place-items-center rounded-sm border border-ink-200 disabled:opacity-40" aria-label="السابق"><ChevronRight className="size-4" /></button>
                      <button type="button" disabled={stepIdx >= steps.length - 1} onClick={() => setStepIdx(i => Math.min(steps.length - 1, i + 1))} className="grid size-8 place-items-center rounded-sm border border-ink-200 disabled:opacity-40" aria-label="التالي"><ChevronLeft className="size-4" /></button>
                    </div>
                    {step.to && <Button size="sm" onClick={() => { nav(step.to!); setOpen(false) }}>{step.cta || 'افتح'}</Button>}
                  </div>
                </div>
                {def.tips.length > 0 && (
                  <Callout tone="info" compact>
                    <ul className="grid gap-1">{def.tips.slice(0, 2).map(t => <li key={t}>• {t}</li>)}</ul>
                  </Callout>
                )}
              </div>
            )}

            {tab === 'ask' && (
              <div className="flex h-full min-h-[280px] flex-col">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {def.faqs.map(f => (
                    <button key={f.q} type="button" onClick={() => answer(f.q)} className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:border-brand-400">{f.q}</button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md bg-ink-25 p-2">
                  {!msgs.length && (
                    <p className="p-2 text-[12px] text-ink-500">اسأل عن خطوتك التالية، التفويض، الشهادة، المهل، أو الدراسة الجيوتقنية…</p>
                  )}
                  {msgs.map(m => (
                    <div key={m.id} className={cx('flex', m.from === 'user' ? 'justify-start' : 'justify-end')}>
                      <div className={cx('max-w-[90%] rounded-lg px-2.5 py-2 text-[12.5px] leading-relaxed', m.from === 'user' ? 'bg-brand-700 text-white' : 'bg-ink-0 text-ink-800 shadow-sm ring-1 ring-ink-100')}>
                        {m.text}
                        {m.to && m.from === 'bot' && (
                          <button type="button" className="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold text-brand-700 hover:underline" onClick={() => { nav(m.to!); setOpen(false) }}>
                            {m.cta || 'فتح'} <ArrowLeft className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEnd} />
                </div>
              </div>
            )}
          </div>

          {tab === 'ask' && (
            <form
              className="flex items-center gap-2 border-t border-ink-200 p-2"
              onSubmit={e => { e.preventDefault(); answer(input) }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="اكتب سؤالك…"
                className="h-9 flex-1 rounded-sm border border-ink-200 bg-ink-0 px-2.5 text-[12.5px] focus:border-brand-500 focus:outline-none"
              />
              <button type="submit" className="grid size-9 place-items-center rounded-sm bg-brand-700 text-white hover:bg-brand-800" aria-label="إرسال"><Send className="size-4" /></button>
            </form>
          )}
        </div>
      )}
    </>
  )

  return typeof document !== 'undefined' ? createPortal(ui, document.body) : ui
}
