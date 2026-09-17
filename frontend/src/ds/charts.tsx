import { cx } from './primitives'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'

/* Chart palette — validated categorical order (see index.css --color-chart-*) */
export const SERIES = ['#12A39B', '#2A78D6', '#E06A2E', '#8250C8', '#B8860B']
export const STATUS_FILL = { ok: '#069454', warn: '#DC6803', danger: '#D92C20', info: '#156FEE', neutral: '#9DA4AE', accent: '#1E6355' } as const
const FONT = 'IBM Plex Sans Arabic, sans-serif'
const AXIS = { fontSize: 11, fill: '#6C727E', fontFamily: FONT }
const TT = {
  cursor: { fill: 'rgba(2,108,104,0.06)' },
  contentStyle: { fontSize: 11.5, border: '1px solid #E5E7EB', borderRadius: 6, boxShadow: '0 4px 14px -4px rgba(17,25,39,.14)', fontFamily: FONT, direction: 'rtl' as const, padding: '6px 10px' },
  labelStyle: { color: '#111927', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: '#384250', padding: 0 },
}
/** RTL-safe category tick for right-oriented Y axis (Arabic labels extend into the gutter). */
const RtlTick = (p: any) => <text x={p.x} y={p.y} dx={8} dy={4} textAnchor="end" fill="#384250" fontSize={11.5} fontWeight={600} fontFamily={FONT}>{p.payload.value}</text>
const LegendR = (p: any) => <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1 text-[11px] text-ink-600">{p.payload?.map((e: any) => <li key={e.value} className="flex items-center gap-1.5"><i className="size-2 rounded-xs" style={{ background: e.color }} />{e.value}</li>)}</ul>

/* ── Area / line over time ── */
export function TimeArea({ data, series, height = 200, xKey = 'm', stacked, unit = '' }: { data: any[]; series: { key: string; label: string; color?: string }[]; height?: number; xKey?: string; stacked?: boolean; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={[...data].reverse()} margin={{ top: 8, right: 4, bottom: 0, left: 6 }}>
        <defs>{series.map((s, i) => <linearGradient key={s.key} id={`ga-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color ?? SERIES[i]} stopOpacity={0.22} /><stop offset="1" stopColor={s.color ?? SERIES[i]} stopOpacity={0} /></linearGradient>)}</defs>
        <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval={data.length > 8 ? 1 : 0} minTickGap={4} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} orientation="right" width={40} />
        <Tooltip {...TT} formatter={(v: any, n: any) => [`${v}${unit}`, n]} />
        {series.length > 1 && <Legend content={LegendR} />}
        {series.map((s, i) => <Area isAnimationActive={false} key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId={stacked ? 'a' : undefined} stroke={s.color ?? SERIES[i]} strokeWidth={2} fill={`url(#ga-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />)}
      </AreaChart>
    </ResponsiveContainer>
  )
}
export function TimeLine({ data, series, height = 200, xKey = 'm', unit = '', refY, refLabel }: { data: any[]; series: { key: string; label: string; color?: string }[]; height?: number; xKey?: string; unit?: string; refY?: number; refLabel?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={[...data].reverse()} margin={{ top: 8, right: 4, bottom: 0, left: 6 }}>
        <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval={data.length > 8 ? 1 : 0} minTickGap={4} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} orientation="right" width={40} domain={['auto', 'auto']} />
        <Tooltip {...TT} formatter={(v: any, n: any) => [`${v}${unit}`, n]} />
        {series.length > 1 && <Legend content={LegendR} />}
        {refY != null && <ReferenceLine y={refY} stroke="#B8860B" strokeDasharray="4 4" label={{ value: refLabel, fontSize: 10.5, fill: '#93370D', position: 'insideBottomLeft', fontFamily: FONT, textAnchor: 'end' } as any} />}
        {series.map((s, i) => <Line isAnimationActive={false} key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}
/* ── Vertical bars (categories over x) ── */
export function Bars({ data, series, height = 200, xKey = 'm', stacked, unit = '' }: { data: any[]; series: { key: string; label: string; color?: string }[]; height?: number; xKey?: string; stacked?: boolean; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={[...data].reverse()} margin={{ top: 8, right: 4, bottom: 0, left: 6 }} barCategoryGap="30%" barGap={2}>
        <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval={data.length > 8 ? 1 : 0} minTickGap={4} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} orientation="right" width={40} />
        <Tooltip {...TT} formatter={(v: any, n: any) => [`${v}${unit}`, n]} />
        {series.length > 1 && <Legend content={LegendR} />}
        {series.map((s, i) => <Bar isAnimationActive={false} key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? 'a' : undefined} fill={s.color ?? SERIES[i]} radius={stacked && i < series.length - 1 ? 0 : [3, 3, 0, 0]} maxBarSize={28} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
/* ── Ranked horizontal bars (RTL-safe labels) ── */
export function RankBars({ data, height = 220, labelWidth = 150, benchmark, unit = '', color }: { data: { name: string; value: number; color?: string }[]; height?: number; labelWidth?: number; benchmark?: number; unit?: string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke="#E5E7EB" strokeDasharray="3 3" />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} reversed />
        <YAxis type="category" dataKey="name" tick={RtlTick} axisLine={false} tickLine={false} width={labelWidth} orientation="right" interval={0} />
        <Tooltip {...TT} formatter={(v: any) => [`${v}${unit}`, '']} />
        {benchmark != null && <ReferenceLine x={benchmark} stroke="#B8860B" strokeDasharray="4 4" label={{ value: `المستهدف ${benchmark}${unit}`, fontSize: 10.5, fill: '#93370D', position: 'top', fontFamily: FONT }} />}
        <Bar isAnimationActive={false} dataKey="value" radius={[3, 3, 3, 3]} barSize={12}>{data.map((d, i) => <Cell key={i} fill={d.color ?? color ?? SERIES[0]} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
/* ── Donut with center figure ── */
export function Donut({ data, height = 190, center, centerLabel, stack }: { data: { name: string; value: number; color: string }[]; height?: number; center?: string | number; centerLabel?: string; stack?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className={cx('flex items-center gap-3', stack && 'flex-col')}>
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie isAnimationActive={false} data={data} dataKey="value" innerRadius="66%" outerRadius="92%" paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270}>{data.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip {...TT} formatter={(v: any, n: any) => [`${v} (${Math.round((v / total) * 100)}%)`, n]} /></PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="num text-xl font-bold text-ink-900">{center ?? total}</span>{centerLabel && <span className="data-label">{centerLabel}</span>}</div>
      </div>
      <ul className={cx('grid min-w-0 gap-1.5', stack ? 'w-full grid-cols-2 gap-x-4' : 'flex-1')}>{data.map(d => <li key={d.name} className="flex min-w-0 items-center gap-2 text-[12px]"><i className="size-2 shrink-0 rounded-xs" style={{ background: d.color }} /><span className="truncate text-ink-700">{d.name}</span><span className="num ms-auto shrink-0 font-semibold text-ink-900">{d.value} <span className="text-ink-400">· {Math.round((d.value / total) * 100)}%</span></span></li>)}</ul>
    </div>
  )
}
/* ── Heat cells (e.g., weekday × hour or city × category) ── */
export function Heat({ rows, cols, get, max }: { rows: string[]; cols: string[]; get: (r: string, c: string) => number; max: number }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr><th className="p-1" />{cols.map(c => <th key={c} className="p-1 text-center font-medium text-ink-500">{c}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r}><td className="whitespace-nowrap p-1 pe-2 font-semibold text-ink-700">{r}</td>{cols.map(c => { const v = get(r, c); const a = max ? v / max : 0; return <td key={c} className="p-0.5"><div title={`${r} · ${c}: ${v}`} className="num grid h-7 place-items-center rounded-xs text-[10.5px] font-semibold" style={{ background: `rgba(2,108,104,${0.08 + a * 0.82})`, color: a > 0.55 ? '#fff' : '#104840' }}>{v}</div></td> })}</tr>)}</tbody></table></div>
  )
}
