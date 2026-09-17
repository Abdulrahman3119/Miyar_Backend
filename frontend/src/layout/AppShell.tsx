import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FlaskConical, FileCheck2, Building2, ListChecks, Users, Settings, BookOpen, Bell, LogOut, ChevronDown, Menu, X, Search,
  ShieldCheck, Sliders, Database, Star, FileText, LifeBuoy, BarChart3, Archive, ScrollText, Gavel, PanelRightClose, PanelRightOpen, HelpCircle, Receipt, type LucideIcon, CheckCheck, Boxes, Wrench, FileSignature, Cpu,
} from 'lucide-react'
import { useStore, useSel, visibleRequests } from '@/lib/store'
import { ROLE_LABEL, POSITION_LABEL } from '@/lib/roles'
import { Avatar, cx, Badge } from '@/ds/primitives'
import { MiyarMark, IdoLogo } from '@/ds/Logo'
import { ago } from '@/lib/format'

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const common = (extra: NavItem[] = []): NavGroup[] => [
  { title: 'التقارير والحوكمة', items: [
    { to: '/reports', label: 'التقارير والتحليلات', icon: BarChart3 },
    { to: '/samples', label: 'العينات وسلسلة الحيازة', icon: Boxes },
    { to: '/archive', label: 'الأرشيف والمستندات', icon: Archive },
    { to: '/governance', label: 'الحوكمة وسجل التدقيق', icon: ScrollText, end: true },
    ...extra,
  ] },
]
const NAV: Record<string, NavGroup[]> = {
  contractor: [
    { title: 'العمليات', items: [{ to: '/', label: 'لوحة المعلومات', icon: LayoutDashboard, end: true }, { to: '/requests', label: 'طلبات الاختبارات', icon: FlaskConical }, { to: '/results', label: 'النتائج والشهادات', icon: FileCheck2 }, { to: '/invoices', label: 'الفواتير', icon: Receipt }] },
    { title: 'التعاقد', items: [{ to: '/quotes', label: 'عروض الأسعار', icon: FileSignature }, { to: '/contracts', label: 'العقود', icon: FileText }, { to: '/directory', label: 'دليل المنشآت', icon: Building2 }] },
    { title: 'المنشأة', items: [{ to: '/delegations', label: 'التفويض', icon: Users }, { to: '/profile', label: 'الملف التعريفي', icon: ShieldCheck }] },
    ...common(),
  ],
  lab: [
    { title: 'العمليات', items: [{ to: '/', label: 'لوحة المعلومات', icon: LayoutDashboard, end: true }, { to: '/requests', label: 'طلبات الاختبارات', icon: FlaskConical }, { to: '/engine', label: 'المحرك الذكي', icon: Cpu }, { to: '/catalog', label: 'قائمة الاختبارات', icon: ListChecks }, { to: '/equipment', label: 'المعدات والمعايرة', icon: Wrench }, { to: '/invoices', label: 'الفواتير', icon: Receipt }] },
    { title: 'التعاقد', items: [{ to: '/quotes', label: 'عروض الأسعار', icon: FileSignature }, { to: '/contracts', label: 'العقود', icon: FileText }, { to: '/directory', label: 'دليل المنشآت', icon: Building2 }] },
    { title: 'المنشأة', items: [{ to: '/delegations', label: 'التفويض', icon: Users }, { to: '/profile', label: 'الملف التعريفي', icon: ShieldCheck }] },
    ...common(),
  ],
  consultant: [
    { title: 'العمليات', items: [{ to: '/', label: 'لوحة المعلومات', icon: LayoutDashboard, end: true }, { to: '/requests', label: 'طلبات الاختبارات', icon: FlaskConical }, { to: '/approvals', label: 'اعتماد النتائج', icon: FileCheck2 }, { to: '/engine', label: 'المحرك الذكي', icon: Cpu }] },
    { title: 'التعاقد', items: [{ to: '/quotes', label: 'عروض الأسعار', icon: FileSignature }, { to: '/contracts', label: 'العقود', icon: FileText }, { to: '/directory', label: 'دليل المنشآت', icon: Building2 }] },
    { title: 'المنشأة', items: [{ to: '/delegations', label: 'التفويض', icon: Users }, { to: '/profile', label: 'الملف التعريفي', icon: ShieldCheck }] },
    ...common(),
  ],
  supervisor: [
    { title: 'المتابعة', items: [{ to: '/', label: 'لوحة المتابعة', icon: LayoutDashboard, end: true }, { to: '/requests', label: 'طلبات الاختبارات', icon: FlaskConical }, { to: '/engine', label: 'المحرك الذكي', icon: Cpu }, { to: '/directory', label: 'دليل المنشآت', icon: Building2 }, { to: '/contracts', label: 'العقود', icon: FileText }] },
    ...common([{ to: '/governance/policies', label: 'السياسات والإصدارات', icon: Gavel }]),
  ],
  admin: [
    { title: 'التشغيل', items: [{ to: '/', label: 'لوحة التشغيل', icon: LayoutDashboard, end: true }, { to: '/requests', label: 'طلبات الاختبارات', icon: FlaskConical }, { to: '/admin/accounts', label: 'المنشآت والحسابات', icon: Users }, { to: '/admin/ratings', label: 'مراجعة التقييمات', icon: Star }, { to: '/invoices', label: 'الفواتير', icon: Receipt }] },
    { title: 'إدارة المنتج', items: [{ to: '/admin/reference', label: 'العناصر المرجعية', icon: Database }, { to: '/admin/rules', label: 'قواعد الأعمال', icon: Sliders }, { to: '/admin/knowledge', label: 'قاعدة المعرفة', icon: BookOpen }, { to: '/engine', label: 'المحرك الذكي', icon: Cpu }, { to: '/admin/templates', label: 'القوالب', icon: FileText }] },
    ...common([{ to: '/governance/policies', label: 'السياسات والإصدارات', icon: Gavel }, { to: '/directory', label: 'دليل المنشآت', icon: Building2 }, { to: '/settings', label: 'الإعدادات', icon: Settings }]),
  ],
  support: [
    { title: 'الدعم', items: [{ to: '/', label: 'لوحة الدعم', icon: LifeBuoy, end: true }, { to: '/admin/accounts', label: 'التسجيل والحسابات', icon: Users }, { to: '/requests', label: 'طلبات الاختبارات', icon: FlaskConical }, { to: '/admin/ratings', label: 'مراجعة التقييمات', icon: Star }, { to: '/directory', label: 'دليل المنشآت', icon: Building2 }] },
    ...common(),
  ],
}

export default function AppShell() {
  const user = useStore(s => s.user)!
  const logout = useStore(s => s.logout)
  const collapsed = useStore(s => s.sidebarCollapsed)
  const toggleSidebar = useStore(s => s.toggleSidebar)
  const tick = useStore(s => s.tick)
  useEffect(() => {
    tick()
    const h = setInterval(() => {
      if (document.visibilityState === 'visible') tick()
    }, 60_000)
    const onFocus = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(h)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [tick])
  const notifications = useSel(s => s.notifications.filter(n => n.forRole === user.role && (!n.forOrgId || n.forOrgId === user.orgId)))
  const markRead = useStore(s => s.markRead)
  const markAllRead = useStore(s => s.markAllRead)
  const requests = useSel(visibleRequests)
  const org = useStore(s => s.orgs.find(o => o.id === user.orgId))
  const live = useStore(s => s.live)
  const syncError = useStore(s => s.syncError)
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<'none' | 'bell' | 'user' | 'search'>('none')
  const [q, setQ] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const unread = notifications.filter(n => !n.read).length
  const groups = NAV[user.role] ?? []
  useEffect(() => { const h = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu('none') }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  useEffect(() => { setOpen(false); setMenu('none') }, [loc.pathname])
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setMenu('search') } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [])
  const hits = q.trim() ? requests.filter(r => r.id.includes(q) || r.project.includes(q) || r.contractId.includes(q)).slice(0, 6) : []
  const badges: Record<string, number> = {
    '/requests': user.role === 'lab' ? requests.filter(r => r.labId === user.orgId && r.status === 'STS11').length : user.role === 'consultant' ? requests.filter(r => r.consultantId === user.orgId && r.tests.some(t => t.status === 'STS19')).length : 0,
    '/approvals': requests.filter(r => r.consultantId === user.orgId && r.tests.some(t => t.status === 'STS19')).length,
  }

  return (
    <div data-role={user.role} className="flex h-screen flex-col overflow-hidden bg-canvas">
      {/* ── Topbar ── */}
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 bg-brand-800 px-3 text-white shadow-[inset_0_-1px_0_rgba(255,255,255,.08)] lg:px-4" ref={wrap}>
        <button className="grid size-9 place-items-center rounded-sm hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة"><Menu className="size-5" /></button>
        <Link to="/" className="flex items-center gap-2.5"><MiyarMark size={32} onDark /><span className="hidden leading-none sm:block"><span className="block text-[15px] font-bold">معيار</span><span className="block text-[10px] text-white/65">المنصة الوطنية لاختبارات التربة والطرق</span></span></Link>
        <button className="hidden size-8 place-items-center rounded-sm text-white/70 hover:bg-white/10 hover:text-white lg:grid" onClick={toggleSidebar} aria-label="طي القائمة">{collapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}</button>
        <div className="relative mx-2 hidden flex-1 max-w-xl md:block">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-white/50" />
          <input value={q} onChange={e => { setQ(e.target.value); setMenu('search') }} onFocus={() => setMenu('search')} placeholder="بحث برقم الطلب، المشروع، العقد…  (Ctrl+K)" className="h-9 w-full rounded-sm border border-white/15 bg-white/10 ps-9 pe-3 text-[13px] text-white placeholder:text-white/50 focus:border-white/40 focus:bg-white/15 focus:outline-none" />
          {menu === 'search' && hits.length > 0 && (
            <div className="absolute inset-x-0 top-11 rounded-md bg-ink-0 p-1 text-ink-900 shadow-pop">
              {hits.map(r => <button key={r.id} onClick={() => { nav(`/requests/${r.id}`); setQ(''); setMenu('none') }} className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-start text-[12.5px] hover:bg-ink-50"><span><span className="font-semibold text-brand-700">{r.id}</span> · {r.project}</span><span className="meta">{r.contractId}</span></button>)}
            </div>
          )}
        </div>
        <div className="ms-auto flex items-center gap-1.5">
          {/* مصدر البيانات — الخادم أم بيانات العرض (يُضبط من الإعدادات) */}
          <Link to="/settings" title={live ? (syncError ? `خطأ في المزامنة: ${syncError}` : 'البيانات من خادم معيار') : 'أضِف عنوان الخادم من الإعدادات'} className="hidden items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-0.5 text-[11.5px] font-medium hover:bg-white/10 sm:inline-flex">
            <i className={cx('size-1.5 rounded-full', live ? (syncError ? 'bg-danger-400' : 'bg-lime-300') : 'bg-warn-400')} />
            {live ? (syncError ? 'مزامنة متعثرة' : 'مباشر') : 'غير مربوط'}
          </Link>
          <span className="hidden rounded-full border border-white/20 px-2.5 py-0.5 text-[11.5px] font-medium sm:inline">{ROLE_LABEL[user.role]}</span>
          <button className="grid size-9 place-items-center rounded-sm text-white/80 hover:bg-white/10" aria-label="المساعدة" onClick={() => nav('/help')}><HelpCircle className="size-4" /></button>
          <div className="relative">
            <button onClick={() => setMenu(m => m === 'bell' ? 'none' : 'bell')} className="relative grid size-9 place-items-center rounded-sm text-white/80 hover:bg-white/10" aria-label="الإشعارات"><Bell className="size-4" />{unread > 0 && <span className="num absolute -top-0.5 -end-0.5 grid min-w-4 place-items-center rounded-full bg-danger-500 px-1 text-[10px] font-bold">{unread}</span>}</button>
            {menu === 'bell' && (
              <div className="absolute end-0 top-11 w-[380px] rounded-md bg-ink-0 text-ink-900 shadow-pop">
                <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2"><span className="text-[13px] font-bold">الإشعارات <span className="meta">({unread} غير مقروء)</span></span><button onClick={() => markAllRead()} className="flex items-center gap-1 text-[11.5px] text-brand-700 hover:underline"><CheckCheck className="size-3.5" />تعليم الكل كمقروء</button></div>
                <ul className="max-h-[420px] overflow-y-auto">{notifications.map(n => (
                  <li key={n.id}><button onClick={() => { markRead(n.id); setMenu('none'); n.link && nav(n.link) }} className={cx('flex w-full gap-2.5 border-b border-ink-100 px-3 py-2.5 text-start hover:bg-ink-50', !n.read && 'bg-brand-50/50')}>
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', { ok: 'bg-ok-500', warn: 'bg-warn-500', danger: 'bg-danger-500', info: 'bg-info-500' }[n.tone ?? 'info'])} />
                    <span className="min-w-0"><span className={cx('block text-[12.5px]', !n.read ? 'font-semibold' : 'font-medium')}>{n.title}</span><span className="block truncate text-[11.5px] text-ink-600">{n.body}</span><span className="meta">{ago(n.at)}</span></span>
                  </button></li>))}</ul>
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setMenu(m => m === 'user' ? 'none' : 'user')} className="flex h-9 items-center gap-2 rounded-sm ps-1 pe-2 hover:bg-white/10"><Avatar name={user.name} size="sm" tone="onDark" /><span className="hidden text-start leading-tight md:block"><span className="block text-[12.5px] font-semibold">{user.name}</span><span className="block text-[10.5px] text-white/65">{POSITION_LABEL[user.position]}</span></span><ChevronDown className="size-3.5 text-white/60" /></button>
            {menu === 'user' && (
              <div className="absolute end-0 top-11 w-64 rounded-md bg-ink-0 py-1 text-ink-900 shadow-pop">
                <div className="border-b border-ink-100 px-3 py-2"><div className="text-[13px] font-semibold">{user.name}</div><div className="meta">{POSITION_LABEL[user.position]} — {user.orgName}</div><div className="meta ltr text-start">{user.mobile}</div></div>
                <Link to="/profile" className="block px-3 py-2 text-[12.5px] hover:bg-ink-50">الملف التعريفي للمنشأة</Link>
                <Link to="/delegations" className="block px-3 py-2 text-[12.5px] hover:bg-ink-50">التفويضات</Link>
                <Link to="/settings" className="block px-3 py-2 text-[12.5px] hover:bg-ink-50">الإعدادات</Link>
                <div className="my-1 border-t border-ink-100" />
                <button onClick={() => { logout(); nav('/login') }} className="flex w-full items-center gap-2 px-3 py-2 text-[12.5px] text-danger-600 hover:bg-ink-50"><LogOut className="size-4" />تسجيل الخروج</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar ── */}
        <aside className={cx('fixed inset-y-0 start-0 z-40 flex flex-col bg-brand-700 text-white transition-[width,transform] duration-200 lg:static lg:translate-x-0', collapsed ? 'lg:w-16' : 'lg:w-[236px]', 'w-[236px]', open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0')}>
          <div className="flex items-center justify-between px-3 py-3 lg:hidden"><MiyarMark size={28} onDark /><button onClick={() => setOpen(false)} aria-label="إغلاق"><X className="size-5" /></button></div>
          <nav className="flex-1 overflow-y-auto px-2 py-2">
            {groups.map(g => (
              <div key={g.title} className="mb-3">
                {!collapsed ? <div className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold tracking-wider text-white/55">{g.title}</div> : <div className="mx-2 my-2 border-t border-white/15" />}
                {g.items.map(it => { const b = badges[it.to]; return (
                  <NavLink key={it.to} to={it.to} end={it.end} title={collapsed ? it.label : undefined} className={({ isActive }) => cx('mb-0.5 flex items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-[13px] transition-colors', isActive ? 'bg-white font-bold text-brand-800 shadow-sm' : 'text-white/85 hover:bg-white/10', collapsed && 'justify-center px-0')}>
                    <it.icon className="size-4 shrink-0" strokeWidth={1.9} />
                    {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
                    {!collapsed && !!b && <span className="num rounded-full bg-warn-500 px-1.5 text-[10.5px] font-bold text-white">{b}</span>}
                  </NavLink>) })}
              </div>
            ))}
          </nav>
          {!collapsed && org && (
            <div className="border-t border-white/15 p-3">
              <div className="rounded-sm bg-white/10 p-2.5">
                <div className="flex items-center justify-between"><span className="text-[10.5px] font-bold tracking-wider text-white/55">المنشأة</span>{org.saac && <Badge tone="ok" size="xs">ISO 17025</Badge>}</div>
                <div className="mt-1 truncate text-[12.5px] font-semibold">{org.name}</div>
                {org.cr && org.cr !== '—' ? <div className="ltr text-start text-[10.5px] text-white/60">CR {org.cr}</div> : <div className="text-[10.5px] text-white/60">{org.type === 'supervisor' ? 'جهة إشرافية حكومية' : 'مشغّل المنصة'}</div>}
              </div>
            </div>
          )}
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden" onClick={() => setOpen(false)} />}

        {/* ── Main ── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {/* content grows; the footer is pinned to the bottom of the viewport on short pages and follows the content on long ones */}
          <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 lg:px-5"><Outlet /></div>
          <footer className="mx-auto mt-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 border-t border-ink-200/70 px-5 pb-4 pt-3 text-[11px] text-ink-500">
            <span>© 2026 الإدارة العامة لكود البناء السعودي — وزارة البلديات والإسكان · جميع الحقوق محفوظة</span>
            <span className="flex items-center gap-3"><span>متوافق مع كود المنصات — هيئة الحكومة الرقمية</span><span className="flex items-center gap-1.5">نُفّذ بواسطة <IdoLogo height={16} /></span></span>
          </footer>
        </main>
      </div>
      <Toasts />
    </div>
  )
}

export function Toasts() {
  const toasts = useStore(s => s.toasts)
  const dismiss = useStore(s => s.dismissToast)
  const tone = { ok: 'border-ok-500', warn: 'border-warn-500', danger: 'border-danger-500', info: 'border-info-500' }
  return (
    <div className="pointer-events-none fixed bottom-4 start-4 z-[1200] flex w-80 flex-col gap-2">
      {toasts.map(t => <div key={t.id} className={cx('pointer-events-auto rounded-md border-s-4 bg-ink-0 px-3.5 py-2.5 shadow-pop', tone[t.tone ?? 'info'])}><div className="flex items-start justify-between gap-2"><div><div className="text-[13px] font-semibold">{t.title}</div>{t.body && <div className="text-[12px] text-ink-600">{t.body}</div>}</div><button onClick={() => dismiss(t.id)} aria-label="إغلاق"><X className="size-4 text-ink-400" /></button></div></div>)}
    </div>
  )
}
