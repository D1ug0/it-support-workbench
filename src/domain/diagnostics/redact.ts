import { canonicalAddress, isIPv4, isIPv6 } from '../network'

export function createAddressRedactor() {
  const replacements = new Map<string, string>()
  return (value: string) => {
    if (/^\[IPv[46] [1-9]\d{0,5}\]$/.test(value)) return value
    const ipv4 = isIPv4(value)
    const key = canonicalAddress(value)
    if (
      (ipv4 && /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(value)) ||
      (isIPv6(value) && key.startsWith('2001:db8:') && !value.includes('%'))
    )
      return value
    if (!replacements.has(key))
      replacements.set(key, `[${ipv4 ? 'IPv4' : 'IPv6'} ${replacements.size + 1}]`)
    return replacements.get(key)!
  }
}
export const displayAddress = (value: string, revealed: boolean) =>
  revealed ? value : createAddressRedactor()(value)
