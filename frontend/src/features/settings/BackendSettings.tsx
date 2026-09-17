import { useState } from 'react'
import { Server, PlugZap, RefreshCw, Trash2 } from 'lucide-react'
import { useStore, useSel } from '@/lib/store'
import { getBackend, ping, setBackendUrl, clearToken } from '@/lib/backend'
import { Section, Field, Input, Button, Badge, Callout, KV } from '@/ds/primitives'
import { ago } from '@/lib/format'

/** عنوان خادم معيار (تطبيق Frappe اسمه miyar) — يُحفظ في هذا المتصفح فقط. */
export default function BackendSettings({ className }: { className?: string }) {
  const saved = getBackend()
  const { live, syncing, syncError, syncedAt, hydrate, pull } = useSel(s => ({ live: s.live, syncing: s.syncing, syncError: s.syncError, syncedAt: s.syncedAt, hydrate: s.hydrate, pull: s.pull }))
  const toast = useStore(s => s.toast)
  const [url, setUrl] = useState(saved.url)
  const [site, setSite] = useState(saved.site)
  const [checking, setChecking] = useState(false)
  const [info, setInfo] = useState<{ version: string; site: string; developer_mode: boolean } | null>(null)
  const [err, setErr] = useState('')

  const check = async () => {
    setErr(''); setInfo(null); setChecking(true)
    try {
      const res = await ping(url, site)
      setInfo({ version: res.version, site: res.site, developer_mode: res.developer_mode })
      toast({ title: 'الخادم متصل', body: `معيار ${res.version} على الموقع ${res.site}`, tone: 'ok' })
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الاتصال') } finally { setChecking(false) }
  }

  const save = async () => {
    setErr('')
    setBackendUrl(url, site)
    useStore.setState({ live: !!url.trim() })
    await hydrate()
    toast({ title: url.trim() ? 'حُفظ عنوان الخادم' : 'أُلغي الربط', body: url.trim() ? 'يتم الآن جلب الدليل والاختبارات المرجعية من الخادم — سجّل الدخول برقم الجوال المسجَّل.' : 'أضِف العنوان لتشغيل الربط.', tone: 'ok' })
  }

  const disconnect = async () => {
    clearToken(); setBackendUrl('', ''); setUrl(''); setSite(''); setInfo(null)
    useStore.setState({ live: false, syncError: null, syncedAt: null, user: null })
    toast({ title: 'أُلغي الربط بالخادم', body: 'أضِف عنواناً جديداً للمتابعة.', tone: 'info' })
  }

  return (
    <Section
      title="الاتصال بالخادم (Frappe / ERPNext)"
      icon={Server}
      className={className}
      bodyClass="p-3"
      desc={live ? 'مربوط' : 'غير مربوط'}
      actions={live
        ? <Badge tone={syncError ? 'danger' : 'ok'} dot size="xs">{syncError ? 'خطأ في المزامنة' : 'مباشر'}</Badge>
        : <Badge tone="warn" dot size="xs">غير مربوط</Badge>}
    >
      <div className="grid gap-3">
        <Field label="عنوان الخادم (URL)" hint="مثال: http://localhost:8002 أو https://miyar.example.sa — بدون /api" error={err}>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:8002" inputMode="url" className="ltr text-start" />
        </Field>
        <Field label="اسم الموقع (Site)" hint="اتركه فارغاً إن كان الموقع الافتراضي — على bench محلي غالباً site1">
          <Input value={site} onChange={e => setSite(e.target.value)} placeholder="site1" className="ltr text-start" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={PlugZap} loading={checking} onClick={check} disabled={!url.trim()}>فحص الاتصال</Button>
          <Button size="sm" onClick={save} disabled={!url.trim() || checking}>حفظ وربط</Button>
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={syncing} onClick={() => pull()} disabled={!live}>إعادة المزامنة</Button>
          {live && <Button size="sm" variant="ghost" icon={Trash2} onClick={disconnect} className="text-danger-600">إلغاء الربط</Button>}
        </div>
        {info && <KV cols={2} dense items={[{ k: 'إصدار التطبيق', v: <span className="ltr">{info.version}</span> }, { k: 'الموقع', v: <span className="ltr">{info.site}</span> }, { k: 'وضع المطور', v: info.developer_mode ? 'مُفعّل' : 'مُعطّل' }, { k: 'آخر مزامنة', v: syncedAt ? ago(syncedAt) : '—' }]} />}
        {syncError && <Callout tone="danger" compact>{syncError}</Callout>}
        <Callout tone="info" compact>
          {live
            ? 'الدليل والاختبارات المرجعية والكتالوج والطلبات تُقرأ من الخادم. الدخول يتم برقم جوال مسجَّل في المنصة عبر OTP.'
            : 'أضِف عنوان خادم معيار لجلب البيانات والدخول عبر OTP.'}
        </Callout>
      </div>
    </Section>
  )
}
