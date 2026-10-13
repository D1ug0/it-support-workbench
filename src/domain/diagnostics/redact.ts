import { isIPv4 } from '../network'

export function createAddressRedactor() {
  const replacements = new Map<string, string>()
  return (value: string) => {
    if (/^\[IPv[46] [1-9]\d{0,5}\]$/.test(value)) return value
    if (
      /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(value) ||
      (/^2001:db8:/i.test(value) && !value.includes('%'))
    )
      return value
    if (!replacements.has(value))
      replacements.set(value, `[${isIPv4(value) ? 'IPv4' : 'IPv6'} ${replacements.size + 1}]`)
    return replacements.get(value)!
  }
}
export const displayAddress = (value: string, revealed: boolean) =>
  revealed ? value : createAddressRedactor()(value)
