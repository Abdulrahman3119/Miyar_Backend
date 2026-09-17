import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, Info, AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/lib/statuses'
import { status as statusDef } from '@/lib/statuses'
import { initials } from '@/lib/format'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ───────── Button ───────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'link'
type Size = 'xs' | 'sm' | 'md' | 'lg'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; icon?: LucideIcon; iconEnd?: LucideIcon; loading?: boolean }
const V: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-800 border-transparent shadow-sm',
  secondary: 'bg-ink-0 text-ink-700 border-ink-300 hover:bg-ink-50',
  ghost: 'bg-transparent text-ink-600 border-transparent hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-danger-500 text-white border-transparent hover:bg-danger-600',
  success: 'bg-ok-500 text-white border-transparent hover:bg-ok-600',
  link: 'bg-transparent text-brand-600 border-transparent hover:underline px-0 h-auto',
}
const S: Record<Size, string> = { xs: 'h-7 px-2 text-[12px] gap-1', sm: 'h-8 px-2.5 text-[12.5px] gap-1.5', md: 'h-9 px-3.5 text-[13px] gap-2', lg: 'h-10 px-4 text-sm gap-2' }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'primary', size = 'md', icon: Icon, iconEnd: IconEnd, loading, className, children, disabled, ...p }, ref) => (
  <button ref={ref} disabled={disabled || loading} className={cx('inline-flex items-center justify-center rounded-sm border font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none', V[variant], S[size], className)} {...p}>
    {Icon && <Icon className={cx(size === 'xs' ? 'size-3.5' : 'size-4', 'shrink-0')} strokeWidth={2} />}{children}{IconEnd && <IconEnd className="size-4 shrink-0" strokeWidth={2} />}
  </button>
))
Button.displayName = 'Button'
export const ButtonLink = ({ to, variant = 'primary', size = 'md', icon: Icon, className, children }: { to: string; variant?: Variant; size?: Size; icon?: LucideIcon; className?: string; children: ReactNode }) => (
  <Link to={to} className={cx('inline-flex items-center justify-center rounded-sm border font-semibold whitespace-nowrap transition-colors', V[variant], S[size], className)}>{Icon && <Icon className="size-4 shrink-0" strokeWidth={2} />}{children}</Link>
)
export const IconButton = ({ icon: Icon, label, onClick, className, active, size = 'md' }: { icon: LucideIcon; label: string; onClick?: () => void; className?: string; active?: boolean; size?: 'sm' | 'md' }) => (
  <button type="button" onClick={onClick} aria-label={label} title={label} className={cx('grid place-items-center rounded-sm border transition-colors', size === 'sm' ? 'size-7' : 'size-8', active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 bg-ink-0 text-ink-600 hover:bg-ink-50 hover:text-ink-900', className)}><Icon className="size-4" /></button>
)

/* ───────── Badge / StatusPill ───────── */
const TONE: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200', info: 'bg-info-50 text-info-700 border-info-100', accent: 'bg-brand-50 text-brand-700 border-brand-200',
  ok: 'bg-ok-50 text-ok-700 border-ok-100', warn: 'bg-warn-50 text-warn-700 border-warn-100', danger: 'bg-danger-50 text-danger-700 border-danger-100',
}
export const DOT: Record<Tone, string> = { neutral: 'bg-ink-400', info: 'bg-info-500', accent: 'bg-brand-500', ok: 'bg-ok-500', warn: 'bg-warn-500', danger: 'bg-danger-500' }
export const TONE_TEXT: Record<Tone, string> = { neutral: 'text-ink-700', info: 'text-info-600', accent: 'text-brand-600', ok: 'text-ok-600', warn: 'text-warn-600', danger: 'text-danger-600' }
export const Badge = ({ tone = 'neutral', children, dot, className, size = 'sm' }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string; size?: 'xs' | 'sm' }) => (
  <span className={cx('inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap', size === 'xs' ? 'px-1.5 text-[10.5px] leading-4' : 'px-2 text-[11.5px] leading-[18px]', TONE[tone], className)}>{dot && <i className={cx('size-1.5 rounded-full', DOT[tone])} />}{children}</span>
)
export const StatusPill = ({ code, className, size }: { code: string; className?: string; size?: 'xs' | 'sm' }) => { const d = statusDef(code); return <Badge tone={d.tone} dot className={className} size={size}>{d.ar}</Badge> }
export const Chip = ({ children, active, onClick, count }: { children: ReactNode; active?: boolean; onClick?: () => void; count?: number }) => (
  <button type="button" onClick={onClick} className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 bg-ink-0 text-ink-600 hover:bg-ink-50')}>{children}{count != null && <span className={cx('num rounded-full px-1 text-[10.5px]', active ? 'bg-white/20' : 'bg-ink-100')}>{count}</span>}</button>
)
export const Tag = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cx('inline-flex rounded-xs bg-ink-100 px-1.5 py-px text-[11px] font-medium text-ink-600', className)}>{children}</span>
export const Code = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cx('ltr inline-flex whitespace-nowrap rounded-xs border border-brand-100 bg-brand-50 px-1.5 py-px font-mono text-[10.5px] font-semibold text-brand-700', className)}>{children}</span>

/* ───────── Card / Section (house pattern: accent bar + gradient header) ───────── */
export const Card = ({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) => (
  <div className={cx('card', pad && 'p-4', className)}>{children}</div>
)
export const Section = ({ title, icon: Icon, actions, children, className, desc, noPad, bodyClass }: { title: string; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; desc?: string; noPad?: boolean; bodyClass?: string }) => (
  <div className={cx('card flex min-w-0 flex-col', className)}>
    <div className="flex items-center justify-between gap-3 rounded-t-md border-b border-ink-200 bg-gradient-to-b from-ink-50 to-ink-0 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <IconTile icon={Icon} tone="accent" size="sm" />}
        <h3 className={cx('truncate', Icon ? 'text-[14.5px] font-bold text-ink-900' : 'section-title')}>{title}</h3>
        {desc && <span className="meta truncate">{desc}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
    <div className={cx('min-w-0 flex-1', !noPad && 'p-4', bodyClass)}>{children}</div>
  </div>
)

/* ───────── Sparkline ───────── */
export const Sparkline = ({ data, tone = 'accent', height = 28, width = 90 }: { data: number[]; tone?: Tone; height?: number; width?: number }) => {
  if (!data.length) return null
  const max = Math.max(...data), min = Math.min(...data), r = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / r) * (height - 4)] as const)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const col = { accent: 'var(--color-brand-500)', ok: 'var(--color-ok-500)', warn: 'var(--color-warn-500)', danger: 'var(--color-danger-500)', info: 'var(--color-info-500)', neutral: 'var(--color-ink-400)' }[tone]
  const id = `sp-${tone}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block shrink-0" aria-hidden style={{ direction: "ltr" }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity="0.28" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={col} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2.5" fill={col} stroke="white" strokeWidth="1.5" />
    </svg>
  )
}
export const Trend = ({ value, suffix = '%', invert }: { value: number; suffix?: string; invert?: boolean }) => {
  const good = invert ? value <= 0 : value >= 0
  const I = value === 0 ? Minus : value > 0 ? TrendingUp : TrendingDown
  return <span className={cx('num inline-flex items-center gap-0.5 rounded-xs px-1 text-[11px] font-semibold', value === 0 ? 'bg-ink-100 text-ink-600' : good ? 'bg-ok-50 text-ok-700' : 'bg-danger-50 text-danger-700')}><I className="size-3" />{value > 0 ? '+' : ''}{value}{suffix}</span>
}

/* ───────── KPI card ─────────
   Art direction: one quiet surface (no accent bar), a tinted icon tile that carries the tone,
   the figure as the hero, a full-bleed sparkline as the card's "ground", and a faint outline
   glyph watermark for depth. Icons are 1.5px outline everywhere; 1.25px inside tiles. */
const TILE: Record<Tone, string> = {
  neutral: 'text-ink-700 ring-ink-200 bg-[radial-gradient(120%_120%_at_30%_20%,#FFFFFF_0%,#EEF2F1_100%)]',
  accent:  'text-brand-700 ring-brand-200 bg-[radial-gradient(120%_120%_at_30%_20%,#FFFFFF_0%,#D9EAE3_100%)]',
  ok:      'text-ok-700 ring-ok-100 bg-[radial-gradient(120%_120%_at_30%_20%,#FFFFFF_0%,#DDF5E7_100%)]',
  warn:    'text-warn-700 ring-warn-100 bg-[radial-gradient(120%_120%_at_30%_20%,#FFFFFF_0%,#FDEFC7_100%)]',
  danger:  'text-danger-700 ring-danger-100 bg-[radial-gradient(120%_120%_at_30%_20%,#FFFFFF_0%,#FDE1DE_100%)]',
  info:    'text-info-700 ring-info-100 bg-[radial-gradient(120%_120%_at_30%_20%,#FFFFFF_0%,#DCEDFF_100%)]',
}
const SPARK_TONE = (t: Tone): Tone => t === 'neutral' ? 'accent' : t
export const IconTile = ({ icon: Icon, tone = 'neutral', size = 'md', className }: { icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) => (
  <span className={cx('relative grid shrink-0 place-items-center rounded-md ring-1 ring-inset shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_1px_2px_rgba(17,25,39,.06)]', size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10', TILE[tone], className)}>
    <Icon className={cx(size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5')} strokeWidth={1.25} absoluteStrokeWidth />
  </span>
)
export const Kpi = ({ label, value, unit, hint, tone = 'neutral', icon: Icon, spark, trend, trendInvert, onClick, to }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: Tone; icon?: LucideIcon; spark?: number[]; trend?: number; trendInvert?: boolean; onClick?: () => void; to?: string }) => {
  const body = (
    <div className={cx('card kpi relative flex h-full flex-col gap-2.5 overflow-hidden p-3.5 transition-[box-shadow,transform]', (onClick || to) && 'cursor-pointer hover:-translate-y-px hover:shadow-elev')}>
      {/* outline watermark — the same glyph, large and faint, anchored to the trailing edge */}
      {Icon && <Icon className={cx('pointer-events-none absolute -bottom-3 -end-3 size-[84px] opacity-[0.035]', TONE_TEXT[tone])} strokeWidth={1} absoluteStrokeWidth aria-hidden />}
      <div className="flex items-center gap-2.5">
        {Icon && <IconTile icon={Icon} tone={tone} />}
        <div className="min-w-0 flex-1">
          <div className="data-label line-clamp-2 leading-[1.3]">{label}</div>
          {hint && <div className="meta truncate" title={typeof hint === 'string' ? hint : undefined}>{hint}</div>}
        </div>
        {trend != null && <span className="shrink-0 self-start"><Trend value={trend} invert={trendInvert} /></span>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0"><span className="num text-[28px] font-bold leading-none tracking-[-0.01em] text-ink-900">{value}</span>{unit && <span className="ms-1 whitespace-nowrap text-[11.5px] font-semibold text-ink-500">{unit}</span>}</div>
        {spark && <Sparkline data={spark} tone={SPARK_TONE(tone)} width={96} height={30} />}
      </div>
    </div>
  )
  return to ? <Link to={to} className="block h-full">{body}</Link> : <div onClick={onClick} className="h-full">{body}</div>
}

/* ───────── Form ───────── */
export const Field = ({ label, required, hint, error, children, className, inline }: { label?: string; required?: boolean; hint?: string; error?: string; children: ReactNode; className?: string; inline?: boolean }) => (
  <label className={cx('block min-w-0', className)}>
    {label && <span className={cx('block text-[12px] font-semibold text-ink-700', inline ? 'mb-0' : 'mb-1')}>{label}{required && <span className="text-danger-500"> *</span>}</span>}
    {children}
    {error ? <span className="mt-1 block text-[11.5px] text-danger-600">{error}</span> : hint ? <span className="mt-1 block text-[11.5px] text-ink-500">{hint}</span> : null}
  </label>
)
const ctl = 'h-9 w-full rounded-sm border border-ink-300 bg-ink-0 px-2.5 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-brand-600 disabled:bg-ink-50 disabled:text-ink-500 read-only:bg-ink-50'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: string; prefixIcon?: LucideIcon }>(({ className, suffix, prefixIcon: P, ...p }, ref) =>
  suffix || P ? (
    <div className="relative">
      {P && <P className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-ink-400" />}
      {/* In an LTR (numeric) input the text starts at the visual left, so the unit sits at the visual right (= logical start in RTL). */}
      <input ref={ref} className={cx(ctl, suffix && (className?.includes('ltr') ? 'ps-12' : 'pe-12'), P && 'ps-8', className)} {...p} />
      {suffix && <span className={cx('pointer-events-none absolute inset-y-0 flex items-center text-[11px] text-ink-500', className?.includes('ltr') ? 'start-2.5' : 'end-2.5')}>{suffix}</span>}
    </div>
  ) : <input ref={ref} className={cx(ctl, className)} {...p} />,
)
Input.displayName = 'Input'
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cx(ctl, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%236C727E%27%20stroke-width%3D%272.5%27%3E%3Cpath%20d%3D%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[position:left_10px_center] bg-no-repeat pl-7', className)} {...p}>{children}</select>
))
Select.displayName = 'Select'
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cx(ctl, 'h-auto min-h-20 py-2 leading-relaxed', className)} {...p} />
))
Textarea.displayName = 'Textarea'
export const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-[12.5px] text-ink-700">
    <span className={cx('relative h-[18px] w-8 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-ink-300')}><span className={cx('absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-all', checked ? 'start-[15px]' : 'start-0.5')} /></span>{label}
  </button>
)
export const Checkbox = ({ checked, onChange, label, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; indeterminate?: boolean }) => (
  <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-700">
    <input type="checkbox" checked={checked} ref={el => { if (el) el.indeterminate = !!indeterminate }} onChange={e => onChange(e.target.checked)} className="mt-[3px] size-3.5 accent-[#026C68]" />
    {label && <span>{label}</span>}
  </label>
)
export const Segmented = <T extends string>({ value, onChange, items, size = 'sm' }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; size?: 'xs' | 'sm' }) => (
  <div className={cx('inline-flex rounded-sm border border-ink-300 bg-ink-0 p-0.5', size === 'xs' ? 'h-7' : 'h-8')}>
    {items.map(it => <button key={it.value} type="button" onClick={() => onChange(it.value)} className={cx('rounded-xs px-2.5 text-[12px] font-medium transition-colors', value === it.value ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-600 hover:bg-ink-100')}>{it.label}</button>)}
  </div>
)

/* ───────── Callout ───────── */
const CAL: Record<'info' | 'warn' | 'danger' | 'ok', { c: string; I: LucideIcon }> = {
  info: { c: 'bg-info-25 text-info-700 border-info-100', I: Info }, warn: { c: 'bg-warn-25 text-warn-700 border-warn-100', I: AlertTriangle },
  danger: { c: 'bg-danger-25 text-danger-700 border-danger-100', I: XCircle }, ok: { c: 'bg-ok-25 text-ok-700 border-ok-100', I: CheckCircle2 },
}
export const Callout = ({ tone = 'info', children, className, compact }: { tone?: keyof typeof CAL; children: ReactNode; className?: string; compact?: boolean }) => {
  const { c, I } = CAL[tone]
  return <div className={cx('flex items-start gap-2 rounded-sm border text-[12.5px] leading-relaxed', compact ? 'px-2.5 py-1.5' : 'px-3 py-2', c, className)}><I className="mt-0.5 size-3.5 shrink-0" /><div className="min-w-0">{children}</div></div>
}

/* ───────── Tabs ───────── */
export const Tabs = <T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number; icon?: LucideIcon }[]; className?: string }) => (
  <div className={cx('flex gap-0.5 overflow-x-auto border-b border-ink-200', className)}>
    {items.map(it => (
      <button key={it.value} type="button" onClick={() => onChange(it.value)} className={cx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors', value === it.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800')}>
        {it.icon && <it.icon className="size-3.5" />}{it.label}{it.count != null && <span className={cx('num rounded-full px-1.5 text-[10.5px]', value === it.value ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600')}>{it.count}</span>}
      </button>
    ))}
  </div>
)

/* ───────── Plain table primitives (for small inline tables) ───────── */
export const Table = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx('overflow-x-auto rounded-md border border-ink-200 bg-ink-0', className)}><table className="w-full text-[12.5px]">{children}</table></div>
)
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th className={cx('bg-ink-50 px-3 py-2 text-start text-[11px] font-semibold tracking-wide text-ink-600 whitespace-nowrap', className)}>{children}</th>
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={cx('border-t border-ink-100 px-3 py-2 align-middle text-ink-800', className)}>{children}</td>

/* ───────── Key/Value ───────── */
export const KV = ({ items, cols = 3, dense }: { items: { k: string; v: ReactNode }[]; cols?: 1 | 2 | 3 | 4 | 5 | 6; dense?: boolean }) => (
  <dl className={cx('grid gap-x-5', dense ? 'gap-y-2' : 'gap-y-3', { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4', 5: 'sm:grid-cols-3 lg:grid-cols-5', 6: 'sm:grid-cols-3 lg:grid-cols-6' }[cols])}>
    {items.map((it, i) => <div key={i} className="min-w-0"><dt className="data-label">{it.k}</dt><dd className="mt-0.5 truncate text-[13px] font-semibold text-ink-900">{it.v ?? '—'}</dd></div>)}
  </dl>
)

/* ───────── Avatar ───────── */
export const Avatar = ({ name, size = 'md', className, tone = 'soft' }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string; tone?: 'soft' | 'solid' | 'onDark' }) => (
  <span className={cx('grid shrink-0 place-items-center rounded-full font-bold', tone === 'solid' ? 'bg-accent text-white' : tone === 'onDark' ? 'bg-white/15 text-white' : 'bg-accent-soft text-accent-ink', size === 'xs' ? 'size-6 text-[10px]' : size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-11 text-sm' : 'size-8 text-xs', className)}>{initials(name)}</span>
)

/* ───────── Empty ───────── */
export const Empty = ({ icon: Icon, title, desc, action }: { icon?: LucideIcon; title: string; desc?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
    {Icon && <span className="grid size-10 place-items-center rounded-full bg-ink-100 text-ink-500"><Icon className="size-5" /></span>}
    <div className="text-[13px] font-semibold text-ink-800">{title}</div>{desc && <div className="max-w-sm text-[12px] text-ink-500">{desc}</div>}{action && <div className="mt-1">{action}</div>}
  </div>
)

/* ───────── Modal / Drawer ───────── */
export const Modal = ({ open, onClose, title, children, footer, width = 'md', sub }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: 'sm' | 'md' | 'lg' | 'xl'; sub?: string }) => {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); if (open) window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[width]
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink-900/45 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx('flex max-h-[90vh] w-full flex-col rounded-lg bg-ink-0 shadow-pop', w)}>
        <div className="flex items-start justify-between border-b border-ink-200 px-4 py-3"><div><h3 className="text-[15px] font-bold">{title}</h3>{sub && <p className="meta">{sub}</p>}</div><button type="button" onClick={onClose} className="grid size-7 place-items-center rounded-sm text-ink-500 hover:bg-ink-100" aria-label="إغلاق"><X className="size-4" /></button></div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-25 px-4 py-2.5">{footer}</div>}
      </div>
    </div>
  )
}
export const Drawer = ({ open, onClose, title, children, width = 'w-[520px]', sub, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string; sub?: string; footer?: ReactNode }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] bg-ink-900/45" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className={cx('absolute inset-y-0 start-0 flex max-w-full flex-col bg-ink-0 shadow-pop', width)}>
        <div className="flex items-start justify-between border-b border-ink-200 px-4 py-3"><div><h3 className="text-[15px] font-bold">{title}</h3>{sub && <p className="meta">{sub}</p>}</div><button type="button" onClick={onClose} className="grid size-7 place-items-center rounded-sm text-ink-500 hover:bg-ink-100" aria-label="إغلاق"><X className="size-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-25 px-4 py-2.5">{footer}</div>}
      </aside>
    </div>
  )
}

/* ───────── Progress / Stars / Divider ───────── */
export const Progress = ({ value, tone = 'accent', label }: { value: number; tone?: Tone; label?: string }) => (
  <div className="flex items-center gap-2"><div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full rounded-full', DOT[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>{label && <span className="num shrink-0 text-[11px] font-semibold text-ink-600">{label}</span>}</div>
)
export const Stars = ({ value, onChange, size = 'sm' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'lg' }) => (
  <span className={cx('inline-flex', onChange && 'cursor-pointer')} dir="ltr">{[1, 2, 3, 4, 5].map(i => <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i)} className={cx('leading-none', size === 'lg' ? 'text-2xl' : 'text-[13px]', i <= Math.round(value) ? 'text-warn-500' : 'text-ink-300')} aria-label={`${i} نجوم`}>★</button>)}</span>
)
export const Divider = ({ className }: { className?: string }) => <hr className={cx('border-ink-200', className)} />
export const Dot = ({ tone }: { tone: Tone }) => <i className={cx('inline-block size-2 rounded-full', DOT[tone])} />
