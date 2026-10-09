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
  ParsedIpconfig | ParsedPing | ParsedNslookup | ParsedTracert | ParsedRoutes
