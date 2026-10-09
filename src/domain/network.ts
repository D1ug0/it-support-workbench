export function isIPv4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p === '0' || !p.startsWith('0')))
  )
}

export function isIPv6(value: string): boolean {
  const pieces = value.split('%')
  if (pieces.length > 2 || (pieces.length === 2 && !/^[a-z\d_.-]+$/i.test(pieces[1] ?? '')))
    return false
  let address = pieces[0] ?? ''
  if (address.includes('.')) {
    const index = address.lastIndexOf(':')
    if (index < 0 || !isIPv4(address.slice(index + 1))) return false
    address = `${address.slice(0, index)}:0:0`
  }
  if (!/^[a-f\d:]+$/i.test(address) || address.includes(':::')) return false
  const halves = address.split('::')
  if (halves.length > 2) return false
  const groups = halves.flatMap((half) => (half ? half.split(':') : []))
  if (!groups.every((group) => /^[a-f\d]{1,4}$/i.test(group))) return false
  return halves.length === 2 ? groups.length < 8 : groups.length === 8
}

export const isIPAddress = (value: string) => isIPv4(value) || isIPv6(value)
export const cleanAddress = (value: string) => value.replace(/\s*\([^)]*\)\s*$/, '').trim()

export function maskToPrefix(mask: string): number | undefined {
  if (!isIPv4(mask)) return undefined
  const bits = mask
    .split('.')
    .map((octet) => Number(octet).toString(2).padStart(8, '0'))
    .join('')
  return /^1*0*$/.test(bits) ? (bits.indexOf('0') === -1 ? 32 : bits.indexOf('0')) : undefined
}
export function prefixToMask(prefix: number): string {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32)
    throw new RangeError('Invalid IPv4 prefix')
  return Array.from({ length: 4 }, (_, index) => {
    const bits = Math.min(8, Math.max(0, prefix - index * 8))
    return 256 - 2 ** (8 - bits)
  }).join('.')
}
export const ipv4ToNumber = (address: string) =>
  address.split('.').reduce((acc, part) => acc * 256 + Number(part), 0)
export const numberToIPv4 = (value: number) =>
  [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.')

export function calculateSubnet(address: string, prefix: number) {
  if (!isIPv4(address)) throw new Error('Введите корректный IPv4-адрес.')
  const mask = prefixToMask(prefix)
  const size = 2 ** (32 - prefix)
  const network = Math.floor(ipv4ToNumber(address) / size) * size
  const broadcast = network + size - 1
  const hosts = prefix >= 31 ? size : size - 2
  return {
    address,
    prefix,
    mask,
    wildcard: numberToIPv4(0xffffffff - ipv4ToNumber(mask)),
    network: numberToIPv4(network),
    broadcast: numberToIPv4(broadcast),
    firstHost: numberToIPv4(network + (prefix < 31 ? 1 : 0)),
    lastHost: numberToIPv4(broadcast - (prefix < 31 ? 1 : 0)),
    hosts,
    size,
  }
}
