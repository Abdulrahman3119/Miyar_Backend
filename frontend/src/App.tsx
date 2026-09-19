import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '@/lib/store'
import AppShell, { Toasts } from '@/layout/AppShell'
import Login from '@/features/auth/Login'
import Register from '@/features/auth/Register'
import Dashboard from '@/features/dashboard/Dashboard'
import RequestsList from '@/features/requests/RequestsList'
import NewRequest from '@/features/requests/NewRequest'
import RequestDetail from '@/features/requests/RequestDetail'
import ExecuteTest from '@/features/requests/ExecuteTest'
import ReviewResult from '@/features/requests/ReviewResult'
import Approvals from '@/features/requests/Approvals'
import Retest from '@/features/requests/Retest'
import Delegations from '@/features/delegation/Delegations'
import Catalog from '@/features/catalog/Catalog'
import Directory, { OrgProfile, ProfileManage } from '@/features/directory/Directory'
import StudyPrelim from '@/features/geotech/StudyPrelim'
import Study from '@/features/geotech/Study'
import Borehole, { BoreholeLog } from '@/features/geotech/Borehole'
import { Rules, Reference, Knowledge, Templates, Accounts, RatingsModeration, Contracts, Results } from '@/features/admin/Admin'
import { GovernancePage, ArchivePage, InvoicesPage, ReportsPage } from '@/features/governance/Governance'
import { SamplesPage, EquipmentPage } from '@/features/evidence/Evidence'
import EnginePage from '@/features/engine/Engine'
import QuotesPage from '@/features/contracts/Quotes'
import BackendSettings from '@/features/settings/BackendSettings'
import { PageHeader } from '@/ds/composite'
import { Section, KV, Callout, Toggle, Kpi, Button, Badge, Field, Select, Modal, Input, Textarea } from '@/ds/primitives'
import { ROLE_LABEL, POSITION_LABEL, can, type Permission } from '@/lib/roles'
import type { Role } from '@/lib/types'
import { fmtDateTime } from '@/lib/format'
import { useState, useEffect } from 'react'
import { Bell, Globe, ShieldCheck, BookOpen, MessageSquare, Phone, ExternalLink, Compass } from 'lucide-react'

function RequireAuth() {
  const user = useStore(s => s.user)
  const syncing = useStore(s => s.syncing)
  const booted = useStore(s => s.booted)
  const loc = useLocation()
  if (!user && syncing && !booted) return <div className="grid h-screen place-items-center bg-canvas text-[13px] text-ink-600">جارٍ المزامنة مع الخادم…</div>
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc }} />
}

/** Route-level enforcement of the permission matrix (appendix 7.1). Every protected route declares the permission it needs; optional `roles` narrows further (e.g. per-org pages). */
function Can({ p, roles, children }: { p?: Permission; roles?: Role[]; children: React.ReactNode }) {
  const user = useStore(s => s.user)!
  const ok = (!p || can(user.role, user.position, p)) && (!roles || roles.includes(user.role))
  const loc = useLocation()
  useEffect(() => { if (!ok) useStore.getState().toast({ title: 'لا تملك صلاحية الوصول', body: `الصفحة ${loc.pathname} خارج صلاحيات ${ROLE_LABEL[user.role]} (${POSITION_LABEL[user.position]}).`, tone: 'danger' }) }, [ok, loc.pathname, user.role, user.position])
  return ok ? <>{children}</> : <Navigate to="/" replace />
}

function Settings() {
  const user = useStore(s => s.user)!
  const rules = useStore(s => s.rules)
  const prefs = useStore(s => s.preferences)
  const sessions = useStore(s => s.sessions)
  const savePreferences = useStore(s => s.savePreferences)
  const lastLogin = user.lastLogin ? fmtDateTime(user.lastLogin) : '—'
  return (
    <>
      <PageHeader title="الإعدادات" sub="عنوان الخادم وإعدادات الحساب والإشعارات والجلسة" />
      <div className="grid grid-cols-12 gap-3">
        <BackendSettings className="col-span-12 lg:col-span-4" />
        <Section title="الحساب" icon={ShieldCheck} className="col-span-12 lg:col-span-4" bodyClass="p-3"><KV cols={1} dense items={[{ k: 'الاسم', v: user.name }, { k: 'الدور', v: ROLE_LABEL[user.role] }, { k: 'الصفة', v: POSITION_LABEL[user.position] }, { k: 'المنشأة', v: user.orgName }, { k: 'الجوال', v: <span className="ltr">{user.mobile}</span> }, { k: 'صلاحية التفويض', v: user.canDelegate ? 'أصلية' : '—' }, { k: 'آخر دخول', v: lastLogin }]} /></Section>
        <Section title="الإشعارات" icon={Bell} className="col-span-12 lg:col-span-4" bodyClass="p-3"><div className="grid gap-3"><Toggle checked={prefs.sms} onChange={v => savePreferences({ sms: v })} label="رسائل SMS للإجراءات الحرجة (المهل، الاعتماد)" /><Toggle checked={prefs.email} onChange={v => savePreferences({ email: v })} label="بريد إلكتروني لكل إجراء رئيسي" /><Toggle checked={prefs.push} onChange={v => savePreferences({ push: v })} label="إشعارات المتصفح الفورية" /><Toggle checked={prefs.digest} onChange={v => savePreferences({ digest: v })} label="ملخص يومي الساعة 8 صباحاً" /></div><Callout tone="info" compact className="mt-3">الإشعارات تُرسل تلقائياً عند كل إجراء رئيسي في دورة حياة الطلب وفق نوع الخدمة وصلاحياتك (B.R.157).</Callout></Section>
        <Section title="القواعد السارية (للاطلاع)" icon={Globe} className="col-span-12 lg:col-span-4" bodyClass="p-3"><KV cols={2} dense items={[{ k: 'اختبارات لكل طلب', v: rules.maxTestsPerRequest }, { k: 'مهلة المختبر', v: `${rules.labDecisionHours} ساعة` }, { k: 'مهلة الاستشاري', v: `${rules.consultantDecisionHours} ساعة` }, { k: 'أول موعد', v: `≥ ${rules.minLeadHours} ساعة` }, { k: 'الضريبة', v: `${rules.vat}%` }, { k: 'النطاق الجغرافي', v: `${rules.geofenceMeters} م` }]} /><p className="meta mt-3">تُدار من مدير النظام وتُطبَّق على العمليات الجديدة فقط.</p></Section>
        <Section title="الجلسات النشطة" icon={ShieldCheck} className="col-span-12 lg:col-span-5" bodyClass="p-0">
          <table className="w-full text-[12px]"><thead><tr className="bg-ink-50 text-[10.5px] text-ink-500"><th className="px-3 py-1.5 text-start font-semibold">الجلسة</th><th className="px-2 py-1.5 text-start font-semibold">IP</th><th className="px-2 py-1.5 text-start font-semibold">آخر نشاط</th></tr></thead>
            <tbody>{sessions.length ? sessions.map(s => <tr key={s.id} className="border-t border-ink-100"><td className="px-3 py-2 font-medium">{s.current ? <Badge tone="ok" size="xs">الحالية</Badge> : <span className="meta">{s.status || 'نشطة'}</span>}</td><td className="ltr px-2 py-2 text-start text-ink-600">{s.ip || '—'}</td><td className="px-2 py-2 text-ink-600">{s.at ? fmtDateTime(s.at) : '—'}</td></tr>) : <tr><td className="px-3 py-3 text-ink-500" colSpan={3}>لا توجد جلسات مسجَّلة على الخادم.</td></tr>}</tbody></table>
        </Section>
        <Section title="التفضيلات" icon={Globe} className="col-span-12 lg:col-span-3" bodyClass="p-3">
          <div className="grid gap-3"><Field label="التقويم"><Select value={prefs.calendar} onChange={e => savePreferences({ calendar: e.target.value })}><option value="both">ميلادي مع الهجري</option><option value="g">ميلادي فقط</option><option value="h">هجري فقط</option></Select></Field><Field label="كثافة العرض"><Select value={prefs.density} onChange={e => savePreferences({ density: e.target.value })}><option value="comfortable">عادية</option><option value="compact">مضغوطة</option></Select></Field><Field label="الصفحة الرئيسية"><Select value={prefs.home} onChange={e => savePreferences({ home: e.target.value })}><option value="dash">لوحة المعلومات</option><option value="req">طلبات الاختبارات</option></Select></Field></div>
        </Section>
      </div>
    </>
  )
}

function Help() {
  const help = useStore(s => s.help)
  const tickets = useStore(s => s.tickets)
  const user = useStore(s => s.user)!
  const createTicket = useStore(s => s.createTicket)
  const masters = useStore(s => s.masters)
  const [ticket, setTicket] = useState(false)
  const [faq, setFaq] = useState<number | null>(0)
  const [form, setForm] = useState({ subject: '', cat: masters.ticketCategories[0]?.label ?? '', body: '' })
  const faqs = help.faqs.filter(f => !f.roles.length || f.roles.includes(user.role))
  const openTickets = tickets.filter(t => t.status !== 'مغلقة')
  const integTone = (st: string) => st === 'يعمل' ? 'ok' : st.includes('تأخر') ? 'warn' : 'info'
  const ticketTone = (st: string) => masters.ticketStatuses.find(x => x.code === st || x.label === st) ? (st.includes('مغلق') ? 'ok' : st.includes('عاج') ? 'danger' : 'info') : (st.includes('مغلق') ? 'ok' : 'info')
  const guideUrl = '/assets/miyar/help/guide/index.html'
  return (
    <>
      <PageHeader title="المساعدة والدعم" sub="أدلة الاستخدام، الأسئلة الشائعة، والتواصل مع الدعم التقني" actions={<Button icon={MessageSquare} onClick={() => setTicket(true)}>فتح تذكرة</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="تذاكري المفتوحة" value={openTickets.length} hint="من الخادم" /><Kpi label="أدلة الاستخدام" value={help.guides.length + 1} icon={BookOpen} /><Kpi label="الدعم الهاتفي" value={<span className="ltr text-[20px]">{help.support.phone || '—'}</span>} icon={Phone} hint={help.support.hours} /></div>

      <Section title="دليل تشغيل المنصة" icon={Compass} className="mt-3" desc="الأدوار ودورات العمل — يُفتح كصفحة مستقلة" bodyClass="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink-900">دليل تشغيل منصة معيار</div>
            <p className="mt-0.5 text-[12.5px] text-ink-600">مرجع تفاعلي لرحلة كل دور (مقاول، مختبر، استشاري، إشراف، إدارة، دعم) — خارج واجهة المساعدة.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button icon={ExternalLink} onClick={() => window.open(guideUrl, '_blank', 'noopener,noreferrer')}>فتح الدليل</Button>
            <Button variant="secondary" onClick={() => { window.location.href = guideUrl }}>الانتقال للصفحة</Button>
          </div>
        </div>
      </Section>

      <div className="mt-3 grid grid-cols-12 gap-3">
        <div className="col-span-12 grid content-start gap-3 lg:col-span-5"><Section title="أدلة سريعة" icon={BookOpen} bodyClass="p-0"><ul className="divide-y divide-ink-100"><li className="flex items-center gap-3 px-3 py-2 text-[12.5px]"><span className="min-w-0 flex-1"><span className="block truncate font-medium">دليل تشغيل المنصة — الأدوار ودورات العمل</span><span className="meta">كل الأدوار · صفحة مستقلة</span></span><a href={guideUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[11.5px] font-semibold text-brand-700 hover:underline">فتح</a></li>{help.guides.map(g => <li key={g.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{g.title}</span><span className="meta">{g.audience} · {g.minutes} دقائق</span></span><button type="button" className="shrink-0 text-[11.5px] font-semibold text-brand-700 hover:underline" onClick={() => useStore.getState().toast({ title: g.title, body: g.body.slice(0, 280), tone: 'info' })}>فتح</button></li>)}{!help.guides.length && <li className="px-3 py-3 text-[12px] text-ink-500">لا أدلة إضافية بعد.</li>}</ul></Section><Section title="التواصل" icon={Phone} bodyClass="p-3"><KV cols={1} dense items={[{ k: 'الهاتف', v: <span className="ltr">{help.support.phone || '—'}</span> }, { k: 'البريد', v: help.support.email || '—' }, { k: 'الطوارئ الميدانية', v: <span className="ltr">{help.support.emergency || '—'}</span> }]} /></Section></div>
        <div className="col-span-12 grid content-start gap-3 lg:col-span-4"><Section title="الأسئلة الشائعة" bodyClass="p-0"><ul className="divide-y divide-ink-100">{faqs.map((f, i) => <li key={f.id}><button type="button" onClick={() => setFaq(faq === i ? null : i)} className="flex w-full items-center justify-between px-3 py-2 text-start text-[12.5px] font-medium hover:bg-ink-50">{f.q}<span className="text-ink-400">{faq === i ? '−' : '+'}</span></button>{faq === i && <p className="px-3 pb-2.5 text-[12px] leading-relaxed text-ink-600">{f.a}</p>}</li>)}{!faqs.length && <li className="px-3 py-3 text-[12px] text-ink-500">لا أسئلة شائعة بعد.</li>}</ul></Section><Section title="حالة التكاملات" bodyClass="p-0"><ul className="divide-y divide-ink-100">{help.integrations.map(i => <li key={i.code} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]"><span className="truncate">{i.title}</span><Badge tone={integTone(i.status) as any} dot size="xs">{i.status}</Badge></li>)}{!help.integrations.length && <li className="px-3 py-3 text-[12px] text-ink-500">لا تكاملات مسجَّلة.</li>}</ul></Section></div>
        <div className="col-span-12 grid content-start gap-3 lg:col-span-3"><Section title="تذاكري" icon={MessageSquare} bodyClass="p-0"><ul className="divide-y divide-ink-100">{tickets.map(t => <li key={t.id} className="px-3 py-2 text-[12px]"><div className="flex items-center justify-between"><span className="font-semibold text-brand-700">{t.id}</span><Badge tone={ticketTone(t.status) as any} size="xs">{t.status}</Badge></div><div className="truncate text-ink-700">{t.subject}</div><div className="meta">{t.at}</div></li>)}{!tickets.length && <li className="px-3 py-3 text-[12px] text-ink-500">لا تذاكر بعد.</li>}</ul></Section>
          <Section title="روابط مفيدة" bodyClass="p-3"><ul className="grid gap-1.5 text-[12px]"><li className="flex items-center justify-between gap-2"><a href={guideUrl} target="_blank" rel="noreferrer" className="truncate font-medium text-brand-700 hover:underline">دليل التشغيل (أدوار ودورات العمل)</a><span className="ltr meta shrink-0">/assets/miyar/help/guide</span></li>{help.links.map(l => <li key={l.url} className="flex items-center justify-between gap-2"><span className="truncate">{l.title}</span><span className="ltr meta shrink-0">{l.url.replace(/^https?:\/\//, '')}</span></li>)}</ul></Section>
        </div>
      </div>
      <Modal open={ticket} onClose={() => setTicket(false)} title="تذكرة دعم جديدة" sub="يرد فريق الدعم التقني خلال ساعة عمل" width="sm" footer={<><Button variant="secondary" onClick={() => setTicket(false)}>إلغاء</Button><Button disabled={form.subject.trim().length < 5 || form.body.trim().length < 10} onClick={async () => { await createTicket(form.subject, form.body, form.cat); setTicket(false); setForm({ subject: '', cat: masters.ticketCategories[0]?.label ?? '', body: '' }) }}>إرسال</Button></>}>
        <div className="grid gap-3"><Field label="الموضوع" required><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></Field><Field label="التصنيف"><Select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>{masters.ticketCategories.map(c => <option key={c.code} value={c.label}>{c.label}</option>)}</Select></Field><Field label="الوصف" required hint="أرفق رقم الطلب أو الجسة إن وجد"><Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="min-h-24" /></Field></div>
      </Modal>
    </>
  )
}

export default function App() {
  const user = useStore(s => s.user)
  const booted = useStore(s => s.booted)
  const syncing = useStore(s => s.syncing)
  const live = useStore(s => s.live)
  useEffect(() => { useStore.getState().hydrate() }, [])
  if (live && !booted && syncing) return <div className="grid h-screen place-items-center bg-canvas text-[13px] text-ink-600">جارٍ المزامنة مع الخادم…</div>
  return (
    <BrowserRouter basename={import.meta.env.PROD ? '/miyar' : undefined}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <><Login /><Toasts /></>} />
        <Route path="/register" element={<><Register /><Toasts /></>} />
        {!user && <Route path="/directory" element={<Directory />} />}
        {!user && <Route path="/directory/:id" element={<OrgProfile />} />}
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="requests" element={<Can p="request.view"><RequestsList /></Can>} />
            <Route path="requests/new" element={<Can p="request.create"><NewRequest /></Can>} />
            <Route path="requests/new/:id" element={<Can p="request.create"><NewRequest /></Can>} />
            <Route path="requests/:id/edit" element={<Can p="request.create"><NewRequest /></Can>} />
            <Route path="requests/:id" element={<Can p="request.view"><RequestDetail /></Can>} />
            <Route path="requests/:id/tests/:testId/execute" element={<Can p="test.execute"><ExecuteTest /></Can>} />
            <Route path="requests/:id/tests/:testId/review" element={<Can p="output.review"><ReviewResult /></Can>} />
            <Route path="requests/:id/tests/:testId/retest" element={<Can p="request.retest"><Retest /></Can>} />
            <Route path="samples" element={<Can p="request.view"><SamplesPage /></Can>} />
            <Route path="quotes" element={<Can p="directory.view"><QuotesPage /></Can>} />
            <Route path="equipment" element={<Can p="request.view"><EquipmentPage /></Can>} />
            <Route path="requests/:id/study/prelim" element={<Can p="study.prelim"><StudyPrelim /></Can>} />
            <Route path="requests/:id/study" element={<Can p="study.view"><Study /></Can>} />
            <Route path="requests/:id/study/:phase" element={<Can p="study.view"><Study /></Can>} />
            <Route path="requests/:id/study/borehole/:bhId" element={<Can p="study.view"><Borehole /></Can>} />
            <Route path="requests/:id/study/borehole/:bhId/log" element={<Can p="study.view"><BoreholeLog /></Can>} />
            <Route path="engine" element={<Can p="engine.run"><EnginePage /></Can>} />
            <Route path="approvals" element={<Can p="output.review"><Approvals /></Can>} />
            <Route path="results" element={<Can p="results.view"><Results /></Can>} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="archive" element={<ArchivePage />} />
            <Route path="governance" element={<GovernancePage />} />
            <Route path="governance/policies" element={<GovernancePage initial="policies" />} />
            <Route path="catalog" element={<Can p="catalog.view" roles={['lab', 'admin']}><Catalog /></Can>} />
            <Route path="directory" element={<Directory />} />
            <Route path="directory/:id" element={<OrgProfile />} />
            <Route path="profile" element={<Can p="profile.manage"><ProfileManage /></Can>} />
            <Route path="delegations" element={<Can p="delegation.view"><Delegations /></Can>} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
            <Route path="admin/rules" element={<Can p="admin.settings"><Rules /></Can>} />
            <Route path="admin/reference" element={<Can p="admin.reference"><Reference /></Can>} />
            <Route path="admin/knowledge" element={<Can p="admin.knowledge"><Knowledge /></Can>} />
            <Route path="admin/templates" element={<Can p="admin.settings"><Templates /></Can>} />
            <Route path="admin/accounts" element={<Can p="admin.accounts"><Accounts /></Can>} />
            <Route path="admin/ratings" element={<Can p="rating.moderate"><RatingsModeration /></Can>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
