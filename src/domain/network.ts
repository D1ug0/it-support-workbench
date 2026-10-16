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

/** Use one identity for compressed, expanded and IPv4-embedded forms of an IPv6 address. */
export function canonicalAddress(value: string): string {
  if (!isIPAddress(value) || isIPv4(value)) return value
  const [base = '', zone] = value.toLowerCase().split('%')
  let address = base
  if (address.includes('.')) {
    const index = address.lastIndexOf(':')
    const embedded = ipv4ToNumber(address.slice(index + 1))
    address = `${address.slice(0, index)}:${(embedded >>> 16).toString(16)}:${(embedded & 0xffff).toString(16)}`
  }
  const halves = address.split('::')
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const groups =
    halves.length === 2
      ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
      : left
  return (
    groups.map((group) => parseInt(group, 16).toString(16)).join(':') + (zone ? `%${zone}` : '')
  )
}

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
