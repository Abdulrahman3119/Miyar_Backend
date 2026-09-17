import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Download, Rows3, Search, ChevronRight, ChevronLeft, X, Filter } from 'lucide-react'
import { cx, IconButton, Input, Checkbox, Button, Select } from './primitives'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
  width?: string
  align?: 'start' | 'center' | 'end'
  hideable?: boolean
  defaultHidden?: boolean
  exportValue?: (row: T) => string | number
  className?: string
}
export interface FilterDef<T> { key: string; label: string; options: { value: string; label: string; count?: number }[]; match: (row: T, v: string) => boolean }

interface Props<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (r: T) => string
  searchable?: (r: T) => string
  searchPlaceholder?: string
  filters?: FilterDef<T>[]
  pageSize?: number
  selectable?: boolean
  onSelect?: (keys: string[]) => void
  rowClass?: (r: T) => string
  onRowClick?: (r: T) => void
  toolbar?: ReactNode
  bulkActions?: (keys: string[]) => ReactNode
  exportName?: string
  emptyTitle?: string
  footer?: ReactNode
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  compactDefault?: boolean
}

export function DataTable<T>({ rows, columns, rowKey, searchable, searchPlaceholder = 'بحث…', filters = [], pageSize = 10, selectable, onSelect, rowClass, onRowClick, toolbar, bulkActions, exportName = 'export', emptyTitle = 'لا توجد نتائج للفلاتر الحالية', footer, defaultSort, compactDefault }: Props<T>) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort ?? null)
  const [hidden, setHidden] = useState<Set<string>>(new Set(columns.filter(c => c.defaultHidden).map(c => c.key)))
  const [dense, setDense] = useState(!!compactDefault)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(pageSize)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [fv, setFv] = useState<Record<string, string>>({})
  const [colMenu, setColMenu] = useState(false)

  const filtered = useMemo(() => {
    let r = rows
    if (q && searchable) { const s = q.trim().toLowerCase(); r = r.filter(x => searchable(x).toLowerCase().includes(s)) }
    for (const f of filters) { const v = fv[f.key]; if (v) r = r.filter(x => f.match(x, v)) }
    if (sort) { const c = columns.find(x => x.key === sort.key); if (c?.sortValue) { const sv = c.sortValue; r = [...r].sort((a, b) => { const A = sv(a), B = sv(b); const cmp = typeof A === 'number' && typeof B === 'number' ? A - B : String(A).localeCompare(String(B), 'ar'); return sort.dir === 'asc' ? cmp : -cmp }) } }
    return r
  }, [rows, q, fv, sort, columns, filters, searchable])
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const cur = Math.min(page, pages)
  const view = filtered.slice((cur - 1) * size, cur * size)
  const visible = columns.filter(c => !hidden.has(c.key))
  const toggleSort = (k: string) => setSort(s => !s || s.key !== k ? { key: k, dir: 'asc' } : s.dir === 'asc' ? { key: k, dir: 'desc' } : null)
  const setSelection = (s: Set<string>) => { setSel(s); onSelect?.([...s]) }
  const allOnPage = view.length > 0 && view.every(r => sel.has(rowKey(r)))
  const exportCsv = () => {
    const cols = visible; const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.map(c => esc(c.header)).join(','), ...filtered.map(r => cols.map(c => esc(c.exportValue ? c.exportValue(r) : c.sortValue ? c.sortValue(r) : '')).join(','))]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${exportName}.csv`; a.click()
  }
  const activeFilters = Object.entries(fv).filter(([, v]) => v)

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-ink-25 px-3 py-2">
        {searchable && <div className="w-56 max-w-full"><Input prefixIcon={Search} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder={searchPlaceholder} className="h-8 text-[12.5px]" /></div>}
        {filters.map(f => (
          <Select key={f.key} value={fv[f.key] ?? ''} onChange={e => { setFv({ ...fv, [f.key]: e.target.value }); setPage(1) }} className={cx('h-8 w-auto! min-w-28 max-w-44 text-[12px]', fv[f.key] && 'border-brand-600 bg-brand-50 text-brand-800')}>
            <option value="">{f.label}: الكل</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}{o.count != null ? ` (${o.count})` : ''}</option>)}
          </Select>
        ))}
        {activeFilters.length > 0 && <button type="button" onClick={() => setFv({})} className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-[12px] font-medium text-danger-600 hover:bg-danger-50"><X className="size-3.5" />مسح الفلاتر</button>}
        <span className="meta ms-auto num">{filtered.length.toLocaleString('en-US')} سجل{filtered.length !== rows.length && ` من ${rows.length}`}</span>
        {toolbar}
        <div className="relative">
          <IconButton icon={Columns3} label="الأعمدة" size="sm" active={colMenu} onClick={() => setColMenu(m => !m)} />
          {colMenu && <div className="absolute end-0 top-9 z-20 w-56 rounded-md bg-ink-0 p-2 shadow-pop" onMouseLeave={() => setColMenu(false)}>
            <div className="mb-1 px-1 data-label">إظهار الأعمدة</div>
            {columns.filter(c => c.hideable !== false).map(c => <div key={c.key} className="px-1 py-1"><Checkbox checked={!hidden.has(c.key)} onChange={v => setHidden(h => { const n = new Set(h); v ? n.delete(c.key) : n.add(c.key); return n })} label={c.header} /></div>)}
          </div>}
        </div>
        <IconButton icon={Rows3} label={dense ? 'كثافة عادية' : 'كثافة مضغوطة'} size="sm" active={dense} onClick={() => setDense(d => !d)} />
        <IconButton icon={Download} label="تصدير CSV" size="sm" onClick={exportCsv} />
      </div>
      {sel.size > 0 && bulkActions && <div className="flex items-center gap-3 border-b border-brand-200 bg-brand-50 px-3 py-1.5 text-[12.5px]"><span className="font-semibold text-brand-800">{sel.size} محدد</span>{bulkActions([...sel])}<button type="button" className="ms-auto text-[12px] text-ink-600 hover:underline" onClick={() => setSelection(new Set())}>إلغاء التحديد</button></div>}

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-ink-50">
            {selectable && <th className="w-8 px-3 py-2"><Checkbox checked={allOnPage} indeterminate={!allOnPage && view.some(r => sel.has(rowKey(r)))} onChange={v => { const n = new Set(sel); view.forEach(r => v ? n.add(rowKey(r)) : n.delete(rowKey(r))); setSelection(n) }} /></th>}
            {visible.map(c => (
              <th key={c.key} style={{ width: c.width }} className={cx('px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-600 whitespace-nowrap', c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start')}>
                {c.sortValue ? <button type="button" onClick={() => toggleSort(c.key)} className={cx('inline-flex items-center gap-1 hover:text-ink-900', sort?.key === c.key && 'text-brand-700')}>{c.header}{sort?.key === c.key ? (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}</button> : c.header}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {view.length === 0 && <tr><td colSpan={visible.length + (selectable ? 1 : 0)} className="px-3 py-10 text-center text-[12.5px] text-ink-500"><Filter className="mx-auto mb-1 size-5 text-ink-300" />{emptyTitle}{(q || activeFilters.length > 0) && <div className="mt-2"><Button size="xs" variant="secondary" onClick={() => { setQ(''); setFv({}) }}>إعادة الفلاتر</Button></div>}</td></tr>}
            {view.map(r => { const k = rowKey(r); return (
              <tr key={k} onClick={() => onRowClick?.(r)} className={cx('border-t border-ink-100 transition-colors', onRowClick && 'cursor-pointer', sel.has(k) ? 'bg-brand-50/60' : 'hover:bg-ink-50', rowClass?.(r))}>
                {selectable && <td className="px-3" onClick={e => e.stopPropagation()}><Checkbox checked={sel.has(k)} onChange={v => { const n = new Set(sel); v ? n.add(k) : n.delete(k); setSelection(n) }} /></td>}
                {visible.map(c => <td key={c.key} className={cx('px-3 align-middle', dense ? 'py-1.5' : 'py-2.5', c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start', c.className)}>{c.cell(r)}</td>)}
              </tr>) })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 bg-ink-25 px-3 py-1.5">
        <div className="flex items-center gap-2 meta">
          <span>عرض</span>
          <Select value={size} onChange={e => { setSize(+e.target.value); setPage(1) }} className="h-7 w-auto! text-[12px]">{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</Select>
          <span className="num">من {filtered.length.toLocaleString('en-US')}</span>
          {footer}
        </div>
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronRight} label="السابق" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} />
          {Array.from({ length: Math.min(pages, 7) }, (_, i) => { const n = pages <= 7 ? i + 1 : cur <= 4 ? i + 1 : cur >= pages - 3 ? pages - 6 + i : cur - 3 + i; return <button key={n} type="button" onClick={() => setPage(n)} className={cx('num size-7 rounded-sm text-[12px] font-medium', n === cur ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100')}>{n}</button> })}
          <IconButton icon={ChevronLeft} label="التالي" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} />
        </div>
      </div>
    </div>
  )
}
