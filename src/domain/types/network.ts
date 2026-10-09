import type { EvidenceRange } from './diagnostic'

export interface Adapter {
  id: string
  displayName: string
  mediaState: 'connected' | 'disconnected' | 'unknown'
  description?: string
  dnsSuffix?: string
  ipv4: Array<{
    address: string
    prefixLength?: number
    mask?: string
    line: number
    maskLine?: number
  }>
  ipv6: Array<{ address: string; line: number }>
  gateways: Array<{ value: string; line: number }>
  dnsServers: Array<{ value: string; line: number }>
  dhcpEnabled?: boolean
  dhcpServer?: string
  macAddress?: string
  invalidMasks: Array<{ value: string; line: number }>
  fieldLines: Record<string, number[]>
  sourceRange: EvidenceRange
}
export interface ParsedIpconfig {
  kind: 'ipconfig'
  computerName?: string
  adapters: Adapter[]
}
