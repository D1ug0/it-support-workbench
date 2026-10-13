import { z } from 'zod'
import type { ParsedOutput } from '../../domain/types/outputs'
import { isIPv4, isIPv6, maskToPrefix } from '../../domain/network'
import { createAddressRedactor } from '../../domain/diagnostics/redact'
import { canonicalAddress, targetAddress, type SessionRecord } from './session'
export const ARCHIVE_FILE_BYTES = 2 * 1024 * 1024
export const ARCHIVE_STORAGE_BYTES = 10 * 1024 * 1024
const line = z.number().int().min(1).max(50000)
const count = z.number().int().min(0).max(4294967295)
const ms = z.number().min(0).max(4294967295)
const ip = z
  .string()
  .max(100)
  .refine(
    (v) =>
      /^\[IPv[46] [1-9]\d{0,5}\]$/.test(v) ||
      (isIPv4(v) && /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(v)) ||
      (isIPv6(v) && /^2001:db8:/i.test(v) && !v.includes('%')),
    { message: 'В архиве разрешены только обезличенные или документационные адреса.' },
  )
const mask = z.string().refine((v) => maskToPrefix(v) !== undefined)
const host = z.string().regex(/^hidden-host-[1-9]\d{0,5}\.invalid$/)
const alias = z.string().regex(/^Интерфейс [1-9]\d{0,5}$/)
const values = z.array(ip).max(256)
const addressLine = z.object({ value: ip, line }).strict()
const range = z
  .object({ startLine: line, endLine: line })
  .strict()
  .refine((r) => r.startLine <= r.endLine)
const ipconfig = z
  .object({
    kind: z.literal('ipconfig'),
    adapters: z
      .array(
        z
          .object({
            id: alias,
            displayName: alias,
            mediaState: z.enum(['connected', 'disconnected', 'unknown']),
            dhcpEnabled: z.boolean().optional(),
            ipv4: z
              .array(
                z
                  .object({
                    address: ip,
                    prefixLength: z.number().int().min(0).max(32).optional(),
                    mask: mask.optional(),
                    line,
                    maskLine: line.optional(),
                  })
                  .strict(),
              )
              .max(256),
            ipv6: z.array(z.object({ address: ip, line }).strict()).max(256),
            gateways: z.array(addressLine).max(256),
            dnsServers: z.array(addressLine).max(256),
            invalidMasks: z.tuple([]),
            fieldLines: z.object({}).strict(),
            sourceRange: range,
          })
          .strict(),
      )
      .max(2000),
  })
  .strict()
const ping = z
  .object({
    kind: z.literal('ping'),
    target: ip.optional(),
    sent: count.optional(),
    received: count.optional(),
    lost: count.optional(),
    minimum: ms.optional(),
    maximum: ms.optional(),
    average: ms.optional(),
    statsLine: line.optional(),
    replies: z
      .array(
        z
          .object({
            line,
            outcome: z.enum(['reply', 'timeout', 'unreachable']),
            timeMs: ms.optional(),
            lessThan: z.boolean().optional(),
          })
          .strict(),
      )
      .max(50000),
  })
  .strict()
const nslookup = z
  .object({
    kind: z.literal('nslookup'),
    serverAddress: ip.optional(),
    queryName: host.optional(),
    addresses: z.array(addressLine).max(2000),
    outcome: z.enum(['answer', 'timeout', 'nxdomain', 'servfail', 'unknown']),
    eventLines: z.array(line).max(50000),
  })
  .strict()
const tracert = z
  .object({
    kind: z.literal('tracert'),
    target: host.optional(),
    targetAddress: ip.optional(),
    completed: z.boolean(),
    hops: z
      .array(
        z
          .object({
            hop: count,
            line,
            times: z.array(ms.nullable()).max(16),
            lessThan: z.array(z.boolean()).max(16),
            address: ip.optional(),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict()
const gateway = z.union([ip, z.literal('on-link')])
const route = z
  .object({
    kind: z.literal('route'),
    ipv4Routes: z
      .array(
        z
          .object({
            destination: ip,
            mask,
            prefix: z.number().int().min(0).max(32),
            gateway,
            interface: ip,
            metric: count,
            line,
          })
          .strict(),
      )
      .max(20000),
    ipv6Routes: z
      .array(
        z
          .object({
            destination: ip,
            prefix: z.number().int().min(0).max(128),
            gateway,
            interfaceIndex: count,
            metric: count,
            line,
          })
          .strict(),
      )
      .max(20000),
  })
  .strict()
const port = z.number().int().min(0).max(65535)
const dns = z
  .object({
    kind: z.literal('dns-records'),
    format: z.enum(['nslookup', 'powershell-json']),
    records: z
      .array(
        z
          .object({
            type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV']),
            name: host,
            line,
            address: ip.optional(),
            target: z.union([host, z.literal('.')]).optional(),
            text: z
              .array(z.string().regex(/^\[Текст [1-9]\d{0,5} скрыт\]$/))
              .min(1)
              .max(64)
              .optional(),
            preference: port.optional(),
            priority: port.optional(),
            weight: port.optional(),
            port: port.optional(),
            ttl: count.optional(),
            section: z.enum(['answer', 'authority', 'additional']).optional(),
          })
          .strict()
          .superRefine((r, ctx) => {
            const valid =
              r.type === 'A' || r.type === 'AAAA'
                ? Boolean(r.address)
                : r.type === 'TXT'
                  ? Boolean(r.text)
                  : r.type === 'MX'
                    ? Boolean(r.target) && r.preference !== undefined
                    : r.type === 'SRV'
                      ? Boolean(r.target) &&
                        r.priority !== undefined &&
                        r.weight !== undefined &&
                        r.port !== undefined
                      : Boolean(r.target)
            if (!valid) ctx.addIssue({ code: 'custom', message: 'Неполная DNS-запись.' })
          }),
      )
      .max(2000),
  })
  .strict()
const powershell = z.discriminatedUnion('cmdlet', [
  z
    .object({
      kind: z.literal('powershell'),
      cmdlet: z.literal('Test-NetConnection'),
      connection: z
        .object({
          remoteAddress: ip,
          remotePort: port.refine((p) => p > 0),
          tcpSucceeded: z.boolean(),
          sourceAddress: ip.optional(),
          computerName: host.optional(),
          interfaceAlias: alias.optional(),
          line,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('powershell'),
      cmdlet: z.literal('Get-NetIPConfiguration'),
      interfaces: z
        .array(
          z
            .object({
              index: count,
              alias,
              ipv4: values,
              ipv6: values,
              gateways: values,
              dns: values,
              line,
            })
            .strict(),
        )
        .max(2000),
    })
    .strict(),
])
const model = z.union([ipconfig, ping, nslookup, tracert, route, dns, powershell])
export const archiveSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    savedAt: z.iso.datetime(),
    records: z
      .array(z.object({ id: z.uuid(), observedAt: z.iso.datetime(), model }).strict())
      .min(1)
      .max(20),
  })
  .strict()
  .refine((a) => new Set(a.records.map((r) => r.id)).size === a.records.length, {
    message: 'Повторяются ID проверок.',
  })
export type SessionArchive = z.infer<typeof archiveSchema>
export function parseArchive(text: string): SessionArchive {
  if (new TextEncoder().encode(text).length > ARCHIVE_FILE_BYTES)
    throw new Error('Архив превышает 2 MiB.')
  return archiveSchema.parse(JSON.parse(text))
}
export function archiveJson(value: SessionArchive) {
  const text = JSON.stringify(archiveSchema.parse(value), null, 2)
  if (new TextEncoder().encode(text).length > ARCHIVE_FILE_BYTES)
    throw new Error('Архив превышает 2 MiB.')
  return text
}
export function createArchive(records: SessionRecord[], now = Date.now()): SessionArchive {
  const redact = createAddressRedactor(),
    names = new Map<string, string>(),
    aliases = new Map<string, string>()
  const texts = new Map<string, string>()
  const hiddenText = (v: string) => {
    if (!texts.has(v)) texts.set(v, `[Текст ${texts.size + 1} скрыт]`)
    return texts.get(v)!
  }
  const address = (v: string) => redact(canonicalAddress(v))
  const hostname = (v: string) => {
    const key = v.toLowerCase().replace(/\.$/, '')
    if (!names.has(key)) names.set(key, `hidden-host-${names.size + 1}.invalid`)
    return names.get(key)!
  }
  const interfaceName = (v: string) => {
    if (!aliases.has(v)) aliases.set(v, `Интерфейс ${aliases.size + 1}`)
    return aliases.get(v)!
  }
  function safeModel(o: ParsedOutput): ParsedOutput {
    if (o.kind === 'ipconfig')
      return {
        kind: o.kind,
        adapters: o.adapters.map((a) => ({
          id: interfaceName(a.displayName),
          displayName: interfaceName(a.displayName),
          mediaState: a.mediaState,
          dhcpEnabled: a.dhcpEnabled,
          ipv4: a.ipv4.map((v) => ({
            address: address(v.address),
            prefixLength: v.prefixLength,
            mask: v.mask,
            line: v.line,
            maskLine: v.maskLine,
          })),
          ipv6: a.ipv6.map((v) => ({ address: address(v.address), line: v.line })),
          gateways: a.gateways.map((v) => ({ value: address(v.value), line: v.line })),
          dnsServers: a.dnsServers.map((v) => ({ value: address(v.value), line: v.line })),
          invalidMasks: [],
          fieldLines: {},
          sourceRange: { ...a.sourceRange },
        })),
      }
    if (o.kind === 'ping') {
      const target = targetAddress(o.target)
      return {
        kind: o.kind,
        target: target ? address(target) : undefined,
        sent: o.sent,
        received: o.received,
        lost: o.lost,
        minimum: o.minimum,
        maximum: o.maximum,
        average: o.average,
        statsLine: o.statsLine,
        replies: o.replies.map((v) => ({
          line: v.line,
          outcome: v.outcome,
          timeMs: v.timeMs,
          lessThan: v.lessThan,
        })),
      }
    }
    if (o.kind === 'nslookup')
      return {
        kind: o.kind,
        serverAddress: o.serverAddress ? address(o.serverAddress) : undefined,
        queryName: o.queryName ? hostname(o.queryName) : undefined,
        addresses: o.addresses.map((v) => ({ value: address(v.value), line: v.line })),
        outcome: o.outcome,
        eventLines: [...o.eventLines],
      }
    if (o.kind === 'tracert')
      return {
        kind: o.kind,
        target: o.target ? hostname(o.target) : undefined,
        targetAddress: o.targetAddress ? address(o.targetAddress) : undefined,
        completed: o.completed,
        hops: o.hops.map((v) => ({
          hop: v.hop,
          line: v.line,
          times: [...v.times],
          lessThan: [...v.lessThan],
          address: v.address ? address(v.address) : undefined,
        })),
      }
    if (o.kind === 'route')
      return {
        kind: o.kind,
        ipv4Routes: o.ipv4Routes.map((v) => ({
          destination: address(v.destination),
          mask: v.mask,
          prefix: v.prefix,
          gateway: v.gateway === 'on-link' ? 'on-link' : address(v.gateway),
          interface: address(v.interface),
          metric: v.metric,
          line: v.line,
        })),
        ipv6Routes: o.ipv6Routes.map((v) => ({
          destination: address(v.destination),
          prefix: v.prefix,
          gateway: v.gateway === 'on-link' ? 'on-link' : address(v.gateway),
          interfaceIndex: v.interfaceIndex,
          metric: v.metric,
          line: v.line,
        })),
      }
    if (o.kind === 'dns-records')
      return {
        kind: o.kind,
        format: o.format,
        records: o.records.map((v) => ({
          type: v.type,
          name: hostname(v.name),
          line: v.line,
          address: v.address ? address(v.address) : undefined,
          target: v.target ? (v.target === '.' ? '.' : hostname(v.target)) : undefined,
          text: v.text?.map(hiddenText),
          preference: v.preference,
          priority: v.priority,
          weight: v.weight,
          port: v.port,
          ttl: v.ttl,
          section: v.section,
        })),
      }
    if (o.cmdlet === 'Test-NetConnection') {
      const v = o.connection
      return {
        kind: o.kind,
        cmdlet: o.cmdlet,
        connection: {
          remoteAddress: address(v.remoteAddress),
          remotePort: v.remotePort,
          tcpSucceeded: v.tcpSucceeded,
          sourceAddress: v.sourceAddress ? address(v.sourceAddress) : undefined,
          computerName: v.computerName ? hostname(v.computerName) : undefined,
          interfaceAlias: v.interfaceAlias ? interfaceName(v.interfaceAlias) : undefined,
          line: v.line,
        },
      }
    }
    return {
      kind: o.kind,
      cmdlet: o.cmdlet,
      interfaces: o.interfaces.map((v) => ({
        index: v.index,
        alias: interfaceName(v.alias),
        ipv4: v.ipv4.map(address),
        ipv6: v.ipv6.map(address),
        gateways: v.gateways.map(address),
        dns: v.dns.map(address),
        line: v.line,
      })),
    }
  }
  return parseArchive(
    JSON.stringify({
      schemaVersion: 1,
      id: crypto.randomUUID(),
      savedAt: new Date(now).toISOString(),
      records: records.map((r) => {
        if (!r.analysis.parse.value) throw new Error('Проверка не содержит результата.')
        return { id: r.id, observedAt: r.observedAt, model: safeModel(r.analysis.parse.value) }
      }),
    }),
  )
}
export function restoreArchive(value: SessionArchive): SessionRecord[] {
  const archive = archiveSchema.parse(value)
  return archive.records.map((r, index) => ({
    id: r.id,
    label: `Проверка ${index + 1}`,
    observedAt: r.observedAt,
    source: '',
    analysis: {
      schemaVersion: 1,
      parserVersion: 'archive/1',
      createdAt: r.observedAt,
      parse: {
        kind: r.model.kind,
        status: 'partial',
        value: r.model,
        warnings: [
          {
            code: 'ARCHIVE_REDACTED',
            message: 'Восстановлена обезличенная модель. Исходный текст и имена не сохранены.',
          },
        ],
      },
      findings: [],
    },
  }))
}
export function mergeArchives(current: SessionArchive[], incoming: SessionArchive) {
  const valid = archiveSchema.parse(incoming)
  archiveJson(valid)
  const values = [...current.filter((a) => a.id !== valid.id), valid]
  if (
    values.length > 20 ||
    new TextEncoder().encode(JSON.stringify(values)).length > ARCHIVE_STORAGE_BYTES
  )
    throw new Error('Лимит: 20 архивов и 10 MiB. Удалите ненужные архивы.')
  return values
}
