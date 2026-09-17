import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Check, Clock, Upload, Loader2 } from 'lucide-react'
import { cx, Badge } from './primitives'
import type { AuditEntry } from '@/lib/types'
import { ROLE_LABEL } from '@/lib/roles'
import { fmtDateTime, hoursLeft } from '@/lib/format'
import { STUDY_PHASES } from '@/lib/statuses'
import { uploadFile, type UploadedFile, type UploadOpts } from '@/lib/files'
import { useStore } from '@/lib/store'

/* ───────── Page header (house pattern: 23/800 + brand bar) ───────── */
export const PageHeader = ({ title, sub, crumbs, actions, meta }: { title: ReactNode; sub?: ReactNode; crumbs?: { label: string; to?: string }[]; actions?: ReactNode; meta?: ReactNode }) => (
  <div className="mb-3">
    {crumbs && (
      <nav className="mb-1 flex items-center gap-1 text-[11.5px] text-ink-500" aria-label="مسار التنقل">
        {crumbs.map((c, i) => <span key={i} className="flex items-center gap-1">{c.to ? <Link to={c.to} className="hover:text-brand-700">{c.label}</Link> : <span className="font-medium text-ink-700">{c.label}</span>}{i < crumbs.length - 1 && <ChevronLeft className="size-3" />}</span>)}
      </nav>
    )}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="relative min-w-0 ps-3">
        <span className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-brand-600" />
        <h1 className="text-[21px] font-extrabold leading-tight text-ink-900">{title}</h1>
        {sub && <p className="mt-0.5 text-[12.5px] text-ink-500">{sub}</p>}
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </div>
)

/* ───────── SLA countdown ───────── */
export const Countdown = ({ until, label = 'متبقٍ', warnBelow = 12, autoLabel }: { until?: string; label?: string; warnBelow?: number; autoLabel?: string }) => {
  const h = hoursLeft(until)
  if (h == null) return null
  const tone = h === 0 ? 'danger' : h <= warnBelow ? 'warn' : 'info'
  const text = h === 0 ? 'انتهت المهلة' : h < 48 ? `${label ? label + ': ' : ''}${h} ساعة` : `${label ? label + ': ' : ''}${Math.ceil(h / 24)} أيام`
  return <span className="inline-flex items-center gap-1.5"><Badge tone={tone} size="xs"><Clock className="size-3" />{text}</Badge>{autoLabel && <span className="meta">{autoLabel}</span>}</span>
}

/* ───────── Stepper (study phases) ───────── */
export const PhaseStepper = ({ current, onSelect }: { current: number; onSelect?: (n: number) => void }) => (
  <ol className="card flex items-center overflow-x-auto px-3 py-2.5">
    {STUDY_PHASES.map((p, i) => { const done = p.n < current, active = p.n === current; return (
      <li key={p.n} className="flex flex-1 items-center">
        <button type="button" onClick={() => onSelect?.(p.n)} disabled={!onSelect || p.n > current} className={cx('flex min-w-0 items-center gap-2', onSelect && p.n <= current ? 'cursor-pointer' : 'cursor-default')}>
          <span className={cx('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', done ? 'bg-ok-500 text-white' : active ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-ink-100 text-ink-500')}>{done ? <Check className="size-3" /> : p.n}</span>
          <span className={cx('truncate text-[11.5px] font-semibold', active ? 'text-ink-900' : done ? 'text-ink-700' : 'text-ink-400')}>{p.label}</span>
        </button>
        {i < STUDY_PHASES.length - 1 && <span className={cx('mx-2 h-px flex-1', done ? 'bg-ok-500' : 'bg-ink-200')} />}
      </li>) })}
  </ol>
)

/* ───────── Numbered step block ───────── */
/** Generic horizontal flow (request lifecycle etc.). `current` is 0-based index of the active step; -1 = none. */
export const FlowSteps = ({ steps, current, failedAt, className }: { steps: { label: string; hint?: string }[]; current: number; failedAt?: number; className?: string }) => (
  <ol className={cx('card grid px-2 pb-3 pt-4', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
    {steps.map((st, i) => {
      const done = i < current && failedAt !== i, active = i === current && failedAt !== i, failed = failedAt === i
      const status = failed ? 'متوقف' : done ? 'مكتمل' : active ? 'جارٍ الآن' : 'بانتظار'
      return (
        <li key={st.label} className="relative flex min-w-0 flex-col items-center text-center">
          {/* connector to the previous step (start side in RTL) */}
          {i > 0 && <span className={cx('absolute top-4 h-0.5 w-[calc(100%-2.5rem)]', 'end-[calc(50%+1.25rem)]', i <= current ? 'bg-brand-500' : 'border-t-2 border-dashed border-ink-200 bg-transparent')} />}
          <span className={cx('relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold transition',
            failed ? 'bg-danger-500 text-white shadow-[0_0_0_4px_#FDE9E7]'
              : done ? 'bg-brand-600 text-white'
              : active ? 'bg-ink-0 text-brand-700 ring-2 ring-brand-600 shadow-[0_0_0_5px_#D9EAE3]'
              : 'bg-ink-0 text-ink-400 ring-2 ring-ink-200')}>
            {failed ? '!' : done ? <Check className="size-4" strokeWidth={3} /> : String(i + 1).padStart(2, '0')}
          </span>
          <span className={cx('mt-2 block max-w-full truncate px-1 text-[12.5px] font-bold', active ? 'text-brand-800' : done ? 'text-ink-800' : failed ? 'text-danger-700' : 'text-ink-500')}>{st.label}</span>
          {st.hint && <span className="mt-0.5 block max-w-full truncate px-1 text-[11px] text-ink-500">{st.hint}</span>}
          <span className={cx('mt-1 text-[10.5px] font-semibold', failed ? 'text-danger-600' : done ? 'text-ok-600' : active ? 'text-brand-600' : 'text-ink-400')}>{status}</span>
        </li>
      )
    })}
  </ol>
)

export const Step = ({ n, title, state, children, badge }: { n: number; title: string; state: 'done' | 'active' | 'locked'; children?: ReactNode; badge?: ReactNode }) => (
  <div className={cx('card', state === 'locked' && 'opacity-60')}>
    <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-2.5">
      <div className="flex items-center gap-2.5"><span className={cx('grid size-6 place-items-center rounded-full text-[11px] font-bold', state === 'done' ? 'bg-ok-500 text-white' : state === 'active' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>{state === 'done' ? <Check className="size-3" /> : n}</span><h3 className="text-[14px] font-bold">{title}</h3></div>{badge}
    </div>
    {children && state !== 'locked' && <div className="p-4">{children}</div>}
  </div>
)

/* ───────── Audit timeline ───────── */
export const Timeline = ({ entries, limit }: { entries: AuditEntry[]; limit?: number }) => (
  <ol className="relative ms-1.5 border-s border-ink-200 ps-4">
    {[...entries].reverse().slice(0, limit).map(e => (
      <li key={e.id} className="relative mb-3 last:mb-0">
        <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full border-2 border-ink-0 bg-brand-500" />
        <div className="text-[12.5px] font-semibold text-ink-900">{e.action}</div>
        {e.detail && <div className="text-[11.5px] text-ink-600">{e.detail}</div>}
        <div className="meta num">{e.actor} · {ROLE_LABEL[e.actorRole]} · {fmtDateTime(e.at)}</div>
      </li>
    ))}
  </ol>
)

/* ───────── File tile — real Frappe upload ───────── */
export type { UploadedFile }
export const FileTile = ({
  name, size, onChange, onRemove, hint = 'PDF · حد أقصى 10MB',
  accept = '.pdf,.jpg,.jpeg,.png,.webp', maxMb = 10,
  doctype, docname, fieldname, isPrivate = true, disabled,
}: {
  name?: string; size?: string
  onChange?: (file: UploadedFile) => void
  onRemove?: () => void
  hint?: string; accept?: string; maxMb?: number
  doctype?: string; docname?: string; fieldname?: string
  isPrivate?: boolean; disabled?: boolean
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = () => { if (!disabled && !busy && onChange) inputRef.current?.click() }
  const onPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f || !onChange) return
    setBusy(true)
    try {
      const opts: UploadOpts = { doctype, docname, fieldname, isPrivate, maxMb, accept }
      const uploaded = await uploadFile(f, opts)
      onChange(uploaded)
      useStore.getState().toast({ title: 'تم رفع الملف', body: uploaded.name, tone: 'ok' })
    } catch (e: any) {
      useStore.getState().toast({ title: 'تعذّر رفع الملف', body: e?.message || 'حاول مرة أخرى', tone: 'danger' })
    } finally { setBusy(false) }
  }
  const input = <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onPick} />
  if (name) {
    return (
      <div className="flex items-center justify-between rounded-sm border border-ink-200 bg-ink-50 px-3 py-2">
        {input}
        <div className="min-w-0"><div className="truncate text-[12.5px] font-semibold text-brand-700">{name}</div><div className="meta">{busy ? 'جاري الرفع…' : size ? `${size} — تم الرفع ✓` : 'تم الرفع ✓'}</div></div>
        <div className="flex gap-2">
          {onChange && <button type="button" onClick={pick} disabled={busy || disabled} className="text-[11.5px] text-ink-600 hover:underline disabled:opacity-50">تغيير</button>}
          {onRemove && <button type="button" onClick={onRemove} disabled={busy || disabled} className="text-[11.5px] text-danger-600 hover:underline disabled:opacity-50">إزالة</button>}
        </div>
      </div>
    )
  }
  return (
    <button type="button" onClick={pick} disabled={!onChange || busy || disabled} className="flex w-full flex-col items-center justify-center rounded-sm border border-dashed border-ink-300 bg-ink-25 px-3 py-4 text-[12px] text-ink-500 hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60">
      {input}
      {busy ? <Loader2 className="mb-1 size-4 animate-spin text-brand-600" /> : <Upload className="mb-1 size-4" />}
      {busy ? 'جاري رفع الملف…' : 'اسحب الملف هنا أو اضغط للرفع'}
      <span className="mt-0.5 text-[10.5px] text-ink-400">{hint}</span>
    </button>
  )
}

/* ───────── Mini polygon map ───────── */
export type Pin = { code: string; n: number; e: number; status?: 'ready' | 'in-progress' | 'done'; ghost?: boolean }
export const PlotMap = ({ polygon, pins, onDrag, height = 300, selected, onSelect }: { polygon: { n: number; e: number }[]; pins: Pin[]; onDrag?: (code: string, c: { n: number; e: number }) => void; height?: number; selected?: string; onSelect?: (code: string) => void }) => {
  const ns = polygon.map(c => c.n), es = polygon.map(c => c.e)
  const n0 = Math.min(...ns) - 0.0002, n1 = Math.max(...ns) + 0.0002, e0 = Math.min(...es) - 0.0003, e1 = Math.max(...es) + 0.0003
  const W = 600, H = height
  const X = (e: number) => ((e - e0) / (e1 - e0)) * W, Y = (n: number) => H - ((n - n0) / (n1 - n0)) * H
  const path = polygon.map((c, i) => `${i ? 'L' : 'M'}${X(c.e)},${Y(c.n)}`).join(' ') + ' Z'
  const col = (s?: string) => s === 'done' ? '#069454' : s === 'in-progress' ? '#1E6355' : '#6C727E'
  const startDrag = (code: string) => (ev: React.PointerEvent<SVGGElement>) => {
    if (!onDrag) return
    const svg = ev.currentTarget.ownerSVGElement!
    const move = (m: PointerEvent) => { const r = svg.getBoundingClientRect(); const x = ((r.right - m.clientX) / r.width) * W; const y = ((m.clientY - r.top) / r.height) * H; onDrag(code, { e: +(e0 + (x / W) * (e1 - e0)).toFixed(5), n: +(n0 + ((H - y) / H) * (n1 - n0)).toFixed(5) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div className="overflow-hidden rounded-sm border border-ink-200 bg-[#F4F1E4]" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ transform: 'scaleX(-1)' }}>
        <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#E6E1CB" strokeWidth="1" /></pattern></defs>
        <rect width={W} height={H} fill="url(#grid)" />
        <path d={path} fill="#ECE7D0" stroke="#6B6A5A" strokeWidth="2" strokeDasharray="8 5" />
        {pins.map(p => (
          <g key={p.code} transform={`translate(${X(p.e)},${Y(p.n)})`} onPointerDown={startDrag(p.code)} onClick={() => onSelect?.(p.code)} className={cx(onDrag && 'cursor-move', onSelect && 'cursor-pointer')}>
            <circle r="14" fill={p.ghost ? 'none' : col(p.status)} stroke={p.ghost ? '#6B6A5A' : selected === p.code ? '#111927' : 'white'} strokeWidth={selected === p.code ? 3 : 2} strokeDasharray={p.ghost ? '3 3' : undefined} />
            <text y="4" textAnchor="middle" fontSize="9" fontWeight="700" fill={p.ghost ? '#6B6A5A' : 'white'} style={{ transform: 'scaleX(-1)' }} fontFamily="IBM Plex Sans Arabic">{p.code.replace('BH-', '')}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
