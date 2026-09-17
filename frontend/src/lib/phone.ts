/** Saudi phone / CR helpers for Miyar forms. */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const WESTERN = '0123456789'

/** Convert Eastern Arabic digits and strip non-digits. */
export function onlyDigits(value: string): string {
  let out = ''
  for (const ch of value || '') {
    const ai = ARABIC_DIGITS.indexOf(ch)
    if (ai >= 0) out += WESTERN[ai]
    else if (WESTERN.includes(ch)) out += ch
  }
  return out
}

/**
 * Normalize to `05xxxxxxxx` (10 digits).
 * Accepts: 05…, 5…, 9665…, +9665…, spaces/dashes, Arabic digits.
 */
export function normalizeSaudiMobile(value: string): string {
  let d = onlyDigits(value)
  if (d.startsWith('966') && d.length >= 12) d = d.slice(3)
  if (d.startsWith('00966') && d.length >= 14) d = d.slice(5)
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  return d.slice(0, 10)
}

export function isSaudiMobile(value: string): boolean {
  return /^05\d{8}$/.test(normalizeSaudiMobile(value))
}

export function isCommercialRegistration(value: string): boolean {
  return /^\d{10}$/.test(onlyDigits(value))
}
