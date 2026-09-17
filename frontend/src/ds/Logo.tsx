import { cx } from './primitives'

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p.startsWith('/') ? p : `/${p}`}`

/**
 * معيار — official brand assets (brand/ folder): towers + strata mark, Arabic wordmark, MAIYAR latin.
 * `onDark` swaps to the light recolor for the topbar/sidebar/login panel.
 */
export function MiyarMark({ size = 36, className, onDark = false }: { size?: number; className?: string; onDark?: boolean }) {
  return <img src={asset(onDark ? '/brand/mark-on-dark.png' : '/brand/mark.png')} alt="معيار" width={size} height={size} style={{ width: size, height: size }} className={cx('shrink-0 object-contain', className)} />
}

export function MiyarLogo({ size = 'md', onDark = false, tagline = true, vertical = false }: { size?: 'sm' | 'md' | 'lg'; onDark?: boolean; tagline?: boolean; vertical?: boolean }) {
  const h = vertical ? { sm: 96, md: 140, lg: 200 }[size] : { sm: 30, md: 40, lg: 56 }[size]
  const src = vertical ? (onDark ? '/brand/logo-vertical-on-dark.png' : '/brand/logo-vertical.png') : (onDark ? '/brand/logo-on-dark.png' : '/brand/logo.png')
  return (
    <span className={cx('inline-flex', vertical ? 'flex-col items-center gap-2' : 'flex-col items-start gap-1')}>
      <img src={asset(src)} alt="معيار — MAIYAR" height={h} style={{ height: h }} className="w-auto object-contain" />
      {tagline && <span className={cx('block text-[10.5px] font-medium tracking-wide', onDark ? 'text-white/70' : 'text-ink-500')}>المنصة الوطنية لاختبارات التربة والطرق</span>}
    </span>
  )
}

export const MomrahLogo = ({ className, height = 40 }: { className?: string; height?: number }) => (
  <img src={asset('/brand/momrah.svg')} alt="وزارة البلديات والإسكان" height={height} style={{ height }} className={cx('w-auto', className)} />
)
export const IdoLogo = ({ className, height = 22 }: { className?: string; height?: number }) => (
  <img src={asset('/brand/ido.svg')} alt="i-do" height={height} style={{ height }} className={cx('w-auto', className)} />
)
