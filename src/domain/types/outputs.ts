import type { ParsedIpconfig } from './network'

export interface ParsedPing {
  kind: 'ping'
  target?: string
  sent?: number
  received?: number
  lost?: number
  minimum?: number
  maximum?: number
  average?: number
  statsLine?: number
  replies: Array<{
    line: number
    outcome: 'reply' | 'timeout' | 'unreachable'
    timeMs?: number
    lessThan?: boolean
  }>
}
export interface ParsedNslookup {
  kind: 'nslookup'
  serverName?: string
  serverAddress?: string
  queryName?: string
  addresses: Array<{ value: string; line: number }>
  outcome: 'answer' | 'timeout' | 'nxdomain' | 'servfail' | 'unknown'
  eventLines: number[]
}
export interface ParsedTracert {
  kind: 'tracert'
  target?: string
  targetAddress?: string
  hops: Array<{
    hop: number
    line: number
    times: Array<number | null>
    lessThan: boolean[]
    address?: string
    host?: string
  }>
  completed: boolean
}
export interface ParsedRoutes {
  kind: 'route'
  ipv4Routes: Array<{
    destination: string
    mask: string
    prefix: number
    gateway: string
    interface: string
    metric: number
    line: number
  }>
  ipv6Routes: Array<{
    destination: string
    prefix: number
    gateway: string
    interfaceIndex: number
    metric: number
    line: number
  }>
}
export type ParsedOutput =
  | ParsedIpconfig
  | ParsedPing
  | ParsedNslookup
  | ParsedTracert
  | ParsedRoutes
  | ParsedDnsRecords
  | ParsedPowerShell

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV'
  name: string
  line: number
  address?: string
  target?: string
  text?: string[]
  preference?: number
  priority?: number
  weight?: number
  port?: number
  ttl?: number
  section?: 'answer' | 'authority' | 'additional'
}
export interface ParsedDnsRecords {
  kind: 'dns-records'
  format: 'nslookup' | 'powershell-json'
  records: DnsRecord[]
}
export type ParsedPowerShell =
  | {
      kind: 'powershell'
      cmdlet: 'Test-NetConnection'
      connection: {
        remoteAddress: string
        remotePort: number
        tcpSucceeded: boolean
        sourceAddress?: string
        computerName?: string
        interfaceAlias?: string
        line: number
      }
    }
  | {
      kind: 'powershell'
      cmdlet: 'Get-NetIPConfiguration'
      interfaces: Array<{
        index: number
        alias: string
        ipv4: string[]
        ipv6: string[]
        gateways: string[]
        dns: string[]
        line: number
      }>
    }
