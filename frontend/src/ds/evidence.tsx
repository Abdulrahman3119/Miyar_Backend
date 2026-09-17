import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Camera, MapPin, Clock, Smartphone, Fingerprint, X, ChevronRight, ChevronLeft, Ruler, Gauge, Thermometer, ClipboardList } from 'lucide-react'
import { Badge, Code, KV, cx } from './primitives'
import type { Photo, MethodSheet, Equipment } from '@/lib/evidence'
import { fmtDateTime } from '@/lib/format'

/* ───────── GeoMap — real basemap (OpenStreetMap) with polygon / pins / geofence ───────── */
export interface MapPin { lat: number; lng: number; label: string; tone?: 'brand' | 'ok' | 'warn' | 'danger' | 'neutral'; sub?: string }
const PIN_COLOR = { brand: '#1E6355', ok: '#067647', warn: '#B54707', danger: '#B42318', neutral: '#6C727E' }
export function GeoMap({ center, zoom = 17, polygon, pins = [], geofenceM, height = 260, className }: { center?: [number, number]; zoom?: number; polygon?: [number, number][]; pins?: MapPin[]; geofenceM?: number; height?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const c = center ?? (polygon?.[0] ? [polygon.reduce((a, p) => a + p[0], 0) / polygon.length, polygon.reduce((a, p) => a + p[1], 0) / polygon.length] as [number, number] : pins[0] ? [pins[0].lat, pins[0].lng] as [number, number] : [24.8390, 46.6540])
    const map = L.map(ref.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(c, zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    if (polygon?.length) L.polygon(polygon, { color: '#104840', weight: 2, dashArray: '6 4', fillColor: '#88B925', fillOpacity: 0.12 }).addTo(map)
    pins.forEach(p => {
      const color = PIN_COLOR[p.tone ?? 'brand']
      const icon = L.divIcon({ className: '', html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%)"><div style="background:${color};color:#fff;font:700 10.5px IBM Plex Sans Arabic,sans-serif;padding:2px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">${p.label}</div><div style="width:10px;height:10px;background:${color};border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div></div>`, iconSize: [0, 0] })
      const m = L.marker([p.lat, p.lng], { icon }).addTo(map)
      if (p.sub) m.bindTooltip(p.sub, { direction: 'top', offset: [0, -28] })
      if (geofenceM) L.circle([p.lat, p.lng], { radius: geofenceM, color, weight: 1, fillOpacity: 0.08, dashArray: '3 3' }).addTo(map)
    })
    if (polygon?.length && pins.length === 0) map.fitBounds(L.polygon(polygon).getBounds(), { padding: [16, 16] })
    setTimeout(() => map.invalidateSize(), 50)
    return () => { map.remove() }
  }, [JSON.stringify(center), JSON.stringify(polygon), JSON.stringify(pins), zoom, geofenceM])
  return <div className={cx('relative isolate overflow-hidden rounded-sm border border-ink-200', className)} style={{ height, zIndex: 0 }}><div ref={ref} className="h-full w-full" style={{ direction: 'ltr' }} /><span className="pointer-events-none absolute end-2 top-2 z-[400] rounded-xs bg-white/90 px-1.5 py-0.5 text-[10px] text-ink-600">WGS-84 · خريطة أساس OSM</span></div>
}

/* ───────── Photo grid + lightbox with capture metadata (EXIF-like) ───────── */
export function PhotoGrid({ photos, cols = 4, size = 'md', emptyText = 'لا صور مرفقة بعد — تُلتقط من التطبيق الميداني مع الوقت والإحداثيات' }: { photos: Photo[]; cols?: 2 | 3 | 4 | 5 | 6; size?: 'sm' | 'md'; emptyText?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!photos.length) return <p className="meta">{emptyText}</p>
  const p = open != null ? photos[open] : null
  return (
    <>
      <div className={cx('grid gap-1.5', { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' }[cols])}>
        {photos.map((ph, i) => <button key={ph.id} type="button" onClick={() => setOpen(i)} className={cx('group relative overflow-hidden rounded-sm border border-ink-200 bg-ink-100', size === 'sm' ? 'aspect-square' : 'aspect-4/3')}>
          <img src={ph.file} alt={ph.caption} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-start text-[10.5px] text-white">{ph.caption}</span>
          <span className="absolute start-1 top-1 rounded-xs bg-white/90 px-1 text-[9.5px] font-semibold text-ink-700">{{ sample: 'عينة', specimen: 'أبعاد', measurement: 'قياس', equipment: 'معدات', site: 'موقع', instrument: 'جهاز' }[ph.kind]}</span>
        </button>)}
      </div>
      {p && <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}>
        <div className="grid max-h-full w-full max-w-5xl grid-cols-1 overflow-hidden rounded-md bg-ink-0 md:grid-cols-[1fr_300px]" onClick={e => e.stopPropagation()}>
          <div className="relative bg-black"><img src={p.file} alt={p.caption} className="mx-auto max-h-[78vh] w-auto object-contain" />
            <button type="button" onClick={() => setOpen((open! - 1 + photos.length) % photos.length)} className="absolute start-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink-800"><ChevronRight className="size-5" /></button>
            <button type="button" onClick={() => setOpen((open! + 1) % photos.length)} className="absolute end-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink-800"><ChevronLeft className="size-5" /></button>
          </div>
          <div className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="text-[14px] font-bold leading-snug">{p.caption}</h3><button type="button" onClick={() => setOpen(null)} className="grid size-7 shrink-0 place-items-center rounded-sm hover:bg-ink-100"><X className="size-4" /></button></div>
            <div className="data-label mt-3 mb-1">بيانات الالتقاط (لا تُعدَّل)</div>
            <ul className="grid gap-1.5 text-[12px]">
              <li className="flex items-center gap-2"><Clock className="size-3.5 text-ink-400" />{fmtDateTime(p.takenAt)}</li>
              {p.lat != null && <li className="flex items-center gap-2"><MapPin className="size-3.5 text-ink-400" /><span className="ltr num">{p.lat.toFixed(5)}, {p.lng!.toFixed(5)}</span><span className="meta">±{p.accuracyM} م</span></li>}
              <li className="flex items-center gap-2"><Smartphone className="size-3.5 text-ink-400" />{p.device}</li>
              <li className="flex items-center gap-2"><Fingerprint className="size-3.5 text-ink-400" /><span className="ltr num text-[11px]">{p.hash}</span></li>
              <li className="flex flex-wrap items-center gap-1.5 pt-1">{p.requestId && <Badge tone="neutral" size="xs">{p.requestId}</Badge>}{p.sampleId && <Badge tone="info" size="xs">عينة {p.sampleId}</Badge>}{p.boreholeCode && <Badge tone="accent" size="xs">{p.boreholeCode}</Badge>}</li>
            </ul>
            {p.lat != null && <div className="mt-3"><GeoMap center={[p.lat, p.lng!]} zoom={17} pins={[{ lat: p.lat, lng: p.lng!, label: 'موقع الالتقاط', tone: 'brand' }]} height={150} /></div>}
            <p className="meta mt-auto pt-3"><Camera className="me-1 inline size-3" />الصورة مربوطة تلقائياً بالسجل من التطبيق الميداني ولا يمكن استبدالها بعد رفع المخرج.</p>
          </div>
        </div>
      </div>}
    </>
  )
}

/* ───────── Method sheet — how the number was measured ───────── */
export function MethodCard({ m, equipment, compact }: { m: MethodSheet; equipment: Equipment[]; compact?: boolean }) {
  const eq = m.equipment.map(id => equipment.find(e => e.id === id)).filter(Boolean) as Equipment[]
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2"><Code>{m.standard}</Code><span className="text-[13px] font-bold">{m.title}</span><Badge tone="neutral" size="xs">نموذج {m.form}</Badge></div>
      {!compact && <div><div className="data-label mb-1"><ClipboardList className="me-1 inline size-3" />خطوات القياس</div><ol className="grid gap-1 text-[12px] text-ink-700">{m.procedure.map((s, i) => <li key={i} className="flex gap-2"><span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">{i + 1}</span>{s}</li>)}</ol></div>}
      <KV cols={compact ? 2 : 4} dense items={[{ k: 'العينة المطلوبة', v: m.specimen }, { k: 'الظروف البيئية', v: <span className="flex items-center gap-1"><Thermometer className="size-3 text-ink-400" />{m.environment}</span> }, { k: 'عدم اليقين في القياس', v: <span className="flex items-center gap-1"><Gauge className="size-3 text-ink-400" />{m.uncertainty}</span> }, { k: 'حد القبول', v: m.acceptance }]} />
      <div><div className="data-label mb-1"><Ruler className="me-1 inline size-3" />المعدات المستخدمة وحالة المعايرة</div><ul className="grid gap-1 sm:grid-cols-2">{eq.map(e => <li key={e.id} className="flex items-center justify-between gap-2 rounded-xs bg-ink-50 px-2 py-1 text-[11.5px]"><span className="truncate"><b>{e.name}</b> <span className="meta ltr">{e.serial}</span></span><span className="flex shrink-0 items-center gap-1"><span className="meta">حتى {e.calibrationDue}</span><Badge tone={e.status === 'صالح' ? 'ok' : e.status === 'قارب الانتهاء' ? 'warn' : 'danger'} size="xs">{e.status}</Badge></span></li>)}</ul></div>
    </div>
  )
}
