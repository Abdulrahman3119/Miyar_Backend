/* Real file upload / download / print helpers against Frappe. */

import { getBackend, getCsrf, BackendError } from './backend'

export type UploadedFile = {
  name: string
  size: string
  /** Frappe file_url e.g. /private/files/x.pdf */
  file: string
  fileName?: string
}

export const formatBytes = (n: number): string => {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Absolute URL for a Frappe file path (private/public). */
export const fileUrl = (path?: string | null): string => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const { url } = getBackend()
  const base = url || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export const openFile = (path?: string | null) => {
  const href = fileUrl(path)
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
}

export const downloadUrl = (path: string, filename?: string) => {
  const a = document.createElement('a')
  a.href = fileUrl(path)
  a.target = '_blank'
  a.rel = 'noopener'
  if (filename) a.download = filename
  a.click()
}

export const downloadBlob = (blob: Blob, filename: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1500)
}

export const downloadCsv = (filename: string, headers: string[], rows: (string | number | null | undefined)[][]) => {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  downloadBlob(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

/** Print a self-contained Arabic HTML document (opens print dialog). */
export const printHtml = (title: string, bodyHtml: string) => {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!w) return
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:"IBM Plex Sans Arabic",Tahoma,Arial,sans-serif;color:#111927;margin:24px;font-size:13px;line-height:1.55}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:18px 0 8px}
  .meta{color:#6C727E;font-size:12px} table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #E5E7EB;padding:6px 8px;text-align:start} th{background:#F4F1E4;font-size:11.5px}
  .num{font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:embed}
  .brand{color:#1E6355;font-weight:700} .row{display:flex;justify-content:space-between;gap:12px;margin:4px 0}
  .total{font-size:16px;font-weight:800;color:#1E6355} @media print{button{display:none}}
</style></head><body>
<header><div class="brand">معيار · Miyar</div><h1>${title}</h1><div class="meta">${new Date().toLocaleString('ar-SA')}</div></header>
${bodyHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
</body></html>`)
  w.document.close()
}

const firstMessage = (body: any): string | undefined => {
  const parse = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined
    try { const p = JSON.parse(v); return Array.isArray(p) ? parse(p[0]) : (p?.message ?? undefined) } catch { return v }
  }
  if (Array.isArray(body?._server_messages)) return parse(body._server_messages[0])
  if (typeof body?._server_messages === 'string') { try { const arr = JSON.parse(body._server_messages); return parse(arr[0]) } catch {} }
  return body?.exception || body?.message || body?._error_message
}

export type UploadOpts = {
  doctype?: string
  docname?: string
  fieldname?: string
  isPrivate?: boolean
  maxMb?: number
  accept?: string
}

/** Upload via Frappe `/api/method/upload_file` — returns stored file_url. */
export async function uploadFile(file: File, opts: UploadOpts = {}): Promise<UploadedFile> {
  const { url, site, token } = getBackend()
  const base = url || (typeof window !== 'undefined' ? window.location.origin : '')
  if (!base) throw new BackendError('لم يُضبط عنوان الخادم — أضِفه من الإعدادات.', 0)

  const maxMb = opts.maxMb ?? 100
  if (file.size > maxMb * 1024 * 1024) {
    throw new BackendError(`حجم الملف يتجاوز ${maxMb}MB.`, 400)
  }

  const fd = new FormData()
  fd.append('file', file, file.name)
  fd.append('is_private', opts.isPrivate === false ? '0' : '1')
  if (opts.doctype) fd.append('doctype', opts.doctype)
  if (opts.docname) fd.append('docname', opts.docname)
  if (opts.fieldname) fd.append('fieldname', opts.fieldname)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (site) headers['X-Frappe-Site-Name'] = site
  if (token) headers.Authorization = `token ${token}`
  const csrf = getCsrf()
  if (csrf) headers['X-Frappe-CSRF-Token'] = csrf

  let res: Response
  try {
    res = await fetch(`${base}/api/method/upload_file`, { method: 'POST', headers, body: fd, credentials: 'include', mode: 'cors' })
  } catch {
    throw new BackendError('تعذّر رفع الملف — تحقق من الاتصال.', 0)
  }

  const text = await res.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = { message: text } }
  if (!res.ok) {
    if (res.status === 413 || /413|Request Entity Too Large|Content Too Large/i.test(text)) {
      throw new BackendError('حجم الملف أكبر من الحد المسموح على الخادم.', 413, body)
    }
    throw new BackendError(firstMessage(body) || `فشل رفع الملف (${res.status})`, res.status, body)
  }

  const msg = body?.message ?? body
  const filePath = msg?.file_url || msg?.file_name || ''
  if (!filePath) throw new BackendError('لم يُرجع الخادم مسار الملف.', 500, body)

  return {
    name: msg?.file_name || file.name,
    size: formatBytes(file.size),
    file: filePath,
    fileName: msg?.name,
  }
}

export const pickAndUpload = (opts: UploadOpts & { multiple?: boolean } = {}): Promise<UploadedFile[]> =>
  new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = opts.accept || '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx'
    input.multiple = !!opts.multiple
    input.onchange = async () => {
      const list = Array.from(input.files || [])
      if (!list.length) { resolve([]); return }
      try {
        const out: UploadedFile[] = []
        for (const f of list) out.push(await uploadFile(f, opts))
        resolve(out)
      } catch (e) { reject(e) }
    }
    input.click()
  })
