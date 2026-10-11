import { z } from 'zod'
import { calculateSubnet, ipv4ToNumber, isIPv4 } from '../../domain/network'
import type { TerminalAssessment, TerminalCheck } from './assessment'

export const labAddress = z
  .string()
  .refine(
    (v) => isIPv4(v) && /^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(v),
    'Используйте документационные IPv4-сети.',
  )
const label = z.string().trim().min(1).max(160)
const hostId = z.string().regex(/^[a-z][a-z0-9-]{0,29}$/)
const additionalHostSchema = z
  .object({
    id: hostId,
    title: label,
    role: z.enum(['client', 'server']),
    address: labAddress,
    name: z
      .string()
      .regex(/^[a-z0-9.-]+\.lab\.example$/)
      .max(120),
    fault: z.enum(['none', 'dns', 'service', 'http', 'offline']),
  })
  .strict()
  .refine(
    (h) => (h.role === 'client' ? ['none', 'dns', 'offline'].includes(h.fault) : h.fault !== 'dns'),
    'Неисправность должна соответствовать роли узла.',
  )
export const faultIds = [
  'dhcp',
  'mask',
  'gateway',
  'route',
  'metric',
  'vpn',
  'dns',
  'negative-cache',
  'tls-clock',
  'tls-trust',
  'http',
  'smb',
  'gpo',
  'service',
  'linux-permission',
  'wifi',
  'ipv6',
  'multi',
  'conflict',
  'mtu',
] as const
export const topologySchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^(TERM-[A-Z0-9-]+|USR-[a-f0-9-]{36})$/),
    title: label,
    brief: z.string().min(20).max(2000),
    topic: label,
    skill: z.enum([
      'addressing',
      'routing',
      'dns',
      'transport',
      'tls',
      'windows',
      'identity',
      'linux',
      'ipv6',
      'wifi',
    ]),
    fault: z.enum(faultIds),
    client: labAddress,
    prefix: z.number().int().min(8).max(30),
    gateway: labAddress,
    server: labAddress,
    dns: labAddress,
    target: z
      .string()
      .regex(/^[a-z0-9.-]+\.lab\.example$/)
      .max(120),
    hints: z.array(z.string().min(1).max(500)).length(3),
    causes: z.array(label).length(3),
    correctCause: z.number().int().min(0).max(2),
    explanation: z.string().min(20).max(2000),
    additionalHosts: z.array(additionalHostSchema).max(6).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const hosts = v.additionalHosts ?? []
    if (
      new Set(hosts.map((h) => h.id)).size !== hosts.length ||
      hosts.some((h) => ['client', 'server', 'dns', 'gateway'].includes(h.id)) ||
      new Set([v.target, 'dns.lab.example', 'backend.lab.example', ...hosts.map((h) => h.name)])
        .size !==
        3 + hosts.length ||
      new Set([
        v.client,
        v.gateway,
        v.server,
        v.dns,
        '192.0.2.54',
        '192.0.2.254',
        ...hosts.map((h) => h.address),
      ]).size !==
        6 + hosts.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Дополнительные узлы должны иметь уникальные ID, имена и адреса.',
      })
    if (
      hosts.some(
        (h) =>
          h.role === 'client' &&
          (!contains(h.address, v.client, v.prefix) ||
            h.address === calculateSubnet(v.client, v.prefix).network ||
            h.address === calculateSubnet(v.client, v.prefix).broadcast),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Дополнительные клиенты должны находиться в учебной подсети клиента.',
      })
    const net = calculateSubnet(v.client, v.prefix)
    if (
      calculateSubnet(v.gateway, v.prefix).network !== net.network ||
      v.gateway === v.client ||
      v.gateway === net.network ||
      v.gateway === net.broadcast ||
      v.client === net.network ||
      v.client === net.broadcast
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Клиент и шлюз должны быть разными хостами одной подсети.',
        path: ['gateway'],
      })
    if (
      ['route', 'metric', 'vpn', 'multi', 'gateway'].includes(v.fault) &&
      contains(v.server, v.client, v.prefix)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Для этой неисправности сервер должен находиться вне подсети клиента.',
        path: ['server'],
      })
    if (v.dns === '192.0.2.54' || v.gateway === '192.0.2.254' || v.client === '192.0.2.254')
      ctx.addIssue({
        code: 'custom',
        message: 'Адреса 192.0.2.54 и 192.0.2.254 зарезервированы для неисправных узлов модели.',
      })
    if (new Set([v.client, v.gateway, v.server, v.dns]).size !== 4)
      ctx.addIssue({
        code: 'custom',
        message: 'Адреса узлов должны быть уникальными.',
        path: ['server'],
      })
  })
export type LabDefinition = z.infer<typeof topologySchema>
const routeSchema = z
  .object({
    network: labAddress.or(z.literal('0.0.0.0')),
    prefix: z.number().int().min(0).max(32),
    gateway: labAddress,
    metric: z.number().int().min(1).max(999),
    interface: z.enum(['Ethernet', 'VPN']),
  })
  .strict()
export const networkStateSchema = z
  .object({
    definition: topologySchema,
    clock: z.number().int().min(0).max(86400),
    client: labAddress.or(z.literal('0.0.0.0')).or(z.literal('169.254.10.10')),
    prefix: z.number().int().min(0).max(32),
    gateway: labAddress.or(z.literal('0.0.0.0')),
    dns: labAddress,
    addressConflict: z.boolean().default(false),
    mtu: z.number().int().min(576).max(1500).default(1500),
    pathMtu: z.number().int().min(576).max(1500).default(1500),
    dhcp: z.boolean(),
    lease: z.boolean(),
    vpn: z.boolean(),
    wifi: z.boolean(),
    ipv6: z.boolean(),
    routes: z.array(routeSchema).max(20),
    cache: z
      .object({
        address: labAddress.nullable(),
        name: z
          .string()
          .regex(/^[a-z0-9.-]+\.lab\.example$/)
          .max(120)
          .optional(),
        expires: z.number().int().min(0).max(86700),
        negative: z.boolean(),
      })
      .strict()
      .nullable(),
    service: z.boolean(),
    clockCorrect: z.boolean(),
    trusted: z.boolean(),
    httpHealthy: z.boolean(),
    smbAccess: z.boolean(),
    policy: z.boolean(),
    permission: z.boolean(),
    evidence: z
      .array(
        z.enum([
          'config',
          'dns',
          'routes',
          'failure',
          'success',
          'service',
          'certificate',
          'identity',
          'events',
          'permission',
        ]),
      )
      .max(10),
    verifiedRevision: z.number().int().min(0).max(1000).nullable(),
    revision: z.number().int().min(0).max(1000),
    changeAudit: z
      .object({
        repairs: z.number().int().min(0).max(1000),
        regressions: z.number().int().min(0).max(1000),
        unnecessary: z.number().int().min(0).max(1000),
        rollbacks: z.number().int().min(0).max(1000),
      })
      .strict()
      .default({ repairs: 0, regressions: 0, unnecessary: 0, rollbacks: 0 }),
    hosts: z
      .array(
        z
          .object({
            id: hostId,
            online: z.boolean(),
            dnsCorrect: z.boolean(),
            service: z.boolean(),
            httpHealthy: z.boolean(),
          })
          .strict(),
      )
      .max(6)
      .default([]),
    timeline: z
      .array(
        z
          .object({
            time: z.number().int().min(0).max(86400),
            type: z.enum(['inspect', 'change', 'verify']),
            message: z.string().max(180),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ids = (v.definition.additionalHosts ?? []).map((h) => h.id)
    if (
      ids.length !== v.hosts.length ||
      new Set(v.hosts.map((h) => h.id)).size !== v.hosts.length ||
      v.hosts.some((h) => !ids.includes(h.id))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Состояние дополнительных узлов не соответствует плану.',
      })
    if (
      v.hosts.some((h) =>
        v.definition.additionalHosts?.find((d) => d.id === h.id)?.role === 'server'
          ? !h.dnsCorrect
          : !h.service || !h.httpHealthy,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Состояние неисправности не соответствует роли узла.',
      })
    if (Object.values(v.changeAudit).reduce((a, b) => a + b, 0) > v.revision)
      ctx.addIssue({ code: 'custom', message: 'Аудит изменений превышает число ревизий.' })
    if (
      new Set(v.evidence).size !== v.evidence.length ||
      (v.verifiedRevision !== null &&
        (v.verifiedRevision > v.revision || !v.evidence.includes('success')))
    )
      ctx.addIssue({ code: 'custom', message: 'Некорректные доказательства или ревизия проверки.' })
    if (v.cache && v.cache.negative !== (v.cache.address === null))
      ctx.addIssue({ code: 'custom', message: 'Неверное состояние DNS-кэша.' })
    if (v.timeline.some((e, i) => e.time > v.clock || (i > 0 && e.time < v.timeline[i - 1]!.time)))
      ctx.addIssue({ code: 'custom', message: 'Некорректное время событий.' })
  })
export type NetworkState = z.infer<typeof networkStateSchema>
export function createNetwork(definition: LabDefinition): NetworkState {
  const d = topologySchema.parse(definition),
    fault = d.fault
  const routes: NetworkState['routes'] = [
    { network: '0.0.0.0', prefix: 0, gateway: d.gateway, metric: 25, interface: 'Ethernet' },
  ]
  if (['route', 'metric', 'vpn', 'multi'].includes(fault))
    routes.push({
      network: calculateSubnet(d.server, 24).network,
      prefix: 24,
      gateway: '192.0.2.254',
      metric: 1,
      interface: 'VPN',
    })
  if (fault === 'metric')
    routes.push({
      network: calculateSubnet(d.server, 24).network,
      prefix: 24,
      gateway: d.gateway,
      metric: 25,
      interface: 'Ethernet',
    })
  return {
    definition: d,
    clock: 0,
    client: fault === 'dhcp' ? '169.254.10.10' : d.client,
    prefix: fault === 'mask' ? 32 : d.prefix,
    gateway: fault === 'gateway' ? '192.0.2.254' : d.gateway,
    dns: ['dns', 'multi'].includes(fault) ? '192.0.2.54' : d.dns,
    addressConflict: fault === 'conflict',
    mtu: 1500,
    pathMtu: fault === 'mtu' ? 1400 : 1500,
    dhcp: true,
    lease: fault !== 'dhcp',
    vpn: true,
    wifi: fault !== 'wifi',
    ipv6: fault !== 'ipv6',
    routes,
    cache:
      fault === 'negative-cache'
        ? { address: null, name: d.target, expires: 120, negative: true }
        : null,
    service: fault !== 'service',
    clockCorrect: fault !== 'tls-clock',
    trusted: fault !== 'tls-trust',
    httpHealthy: fault !== 'http',
    smbAccess: fault !== 'smb',
    policy: fault !== 'gpo',
    permission: fault !== 'linux-permission',
    evidence: [],
    verifiedRevision: null,
    revision: 0,
    changeAudit: { repairs: 0, regressions: 0, unnecessary: 0, rollbacks: 0 },
    hosts: (d.additionalHosts ?? []).map((h) => ({
      id: h.id,
      online: h.fault !== 'offline',
      dnsCorrect: h.fault !== 'dns',
      service: h.fault !== 'service',
      httpHealthy: h.fault !== 'http',
    })),
    timeline: [],
  }
}
export function contains(address: string, network: string, prefix: number) {
  const size = 2 ** (32 - prefix)
  return Math.floor(ipv4ToNumber(address) / size) === Math.floor(ipv4ToNumber(network) / size)
}
export function routeTo(
  s: NetworkState,
  address: string,
): { reachable: boolean; hops: string[]; reason: string; route?: NetworkState['routes'][number] } {
  const d = s.definition
  if (!s.wifi || !s.lease || s.addressConflict || s.client === '0.0.0.0')
    return { reachable: false, hops: [], reason: 'Интерфейс или адрес недоступен' }
  if (address === s.client) return { reachable: true, hops: [address], reason: 'Локальный адрес' }
  const known = [
    d.server,
    d.gateway,
    d.dns,
    '192.0.2.54',
    ...(d.additionalHosts ?? [])
      .filter((h) => s.hosts.find((state) => state.id === h.id)?.online)
      .map((h) => h.address),
  ]
  if (contains(address, s.client, s.prefix))
    return {
      reachable: known.includes(address),
      hops: known.includes(address) ? [address] : [],
      reason: 'On-link: доставка в локальной подсети',
    }
  const routes = s.routes
    .filter((r) => (r.interface !== 'VPN' || s.vpn) && contains(address, r.network, r.prefix))
    .sort((a, b) => b.prefix - a.prefix || a.metric - b.metric)
  const route = routes[0]
  if (!route) return { reachable: false, hops: [], reason: 'Подходящий маршрут отсутствует' }
  const nextHop = route.prefix === 0 ? s.gateway : route.gateway
  const reachable =
    nextHop === d.gateway && known.includes(address) && contains(nextHop, s.client, s.prefix)
  return {
    reachable,
    hops: reachable ? [nextHop, address] : [],
    reason: reachable
      ? `/${route.prefix}, метрика ${route.metric}, ${route.interface}`
      : `Следующий узел ${nextHop} недоступен`,
    route,
  }
}
export function evidence(s: NetworkState, kind: NetworkState['evidence'][number]) {
  if (!s.evidence.includes(kind)) s.evidence.push(kind)
}
export function trace(
  s: NetworkState,
  type: NetworkState['timeline'][number]['type'],
  message: string,
) {
  s.timeline = [...s.timeline, { time: s.clock, type, message }].slice(-50)
}
export function mutate(s: NetworkState, message: string) {
  s.revision++
  s.verifiedRevision = null
  trace(s, 'change', message)
}
/** Compare observable model conditions; this is not a general judgment of real OS changes. */
export function networkProblems(s: NetworkState) {
  const d = s.definition
  return Object.entries({
    address: s.client !== d.client || !s.lease || s.addressConflict,
    prefix: s.prefix !== d.prefix,
    gateway: s.gateway !== d.gateway,
    route: !routeTo(s, d.server).reachable,
    dns: s.dns !== d.dns,
    cache:
      !!s.cache &&
      s.cache.expires > s.clock &&
      (s.cache.name ?? d.target) === d.target &&
      s.cache.address !== d.server,
    mtu: s.mtu > s.pathMtu,
    wifi: !s.wifi,
    ipv6: !s.ipv6,
    clock: !s.clockCorrect,
    trust: !s.trusted,
    service: !s.service,
    http: !s.httpHealthy,
    smb: !s.smbAccess,
    policy: !s.policy,
    permission: !s.permission,
  })
    .filter(([, bad]) => bad)
    .map(([id]) => id)
    .concat(
      s.hosts.flatMap((h) =>
        Object.entries({
          online: !h.online,
          dns: !h.dnsCorrect,
          service: !h.service,
          http: !h.httpHealthy,
        })
          .filter(([, bad]) => bad)
          .map(([key]) => `host:${h.id}:${key}`),
      ),
    )
}
export function auditNetworkChange(before: NetworkState, after: NetworkState) {
  const old = networkProblems(before),
    next = networkProblems(after)
  const kind = next.some((id) => !old.includes(id))
    ? 'regressions'
    : old.some((id) => !next.includes(id))
      ? 'repairs'
      : 'unnecessary'
  after.changeAudit[kind]++
  trace(
    after,
    'change',
    kind === 'regressions'
      ? 'Появилась дополнительная неисправность модели'
      : kind === 'repairs'
        ? 'Сократилось число неисправных условий модели'
        : 'Изменение не улучшило условия модели',
  )
}
export function undoNetworkChange(current: NetworkState, previous: NetworkState) {
  if (
    current.revision >= 1000 ||
    JSON.stringify(current.definition) !== JSON.stringify(previous.definition)
  )
    throw new Error('Откат недоступен для этой среды.')
  const restored = structuredClone(previous)
  restored.clock = current.clock
  if (restored.cache && restored.cache.expires <= current.clock) restored.cache = null
  restored.evidence = [...current.evidence]
  restored.timeline = [...current.timeline]
  restored.revision = current.revision
  restored.changeAudit = { ...current.changeAudit, rollbacks: current.changeAudit.rollbacks + 1 }
  mutate(restored, 'Откат последнего изменения; требуется новая проверка сервиса')
  return networkStateSchema.parse(restored)
}
export function resolveNetwork(
  s: NetworkState,
  target: string,
  server?: string,
): string | undefined {
  if (isIPv4(target)) return target
  target = target.toLowerCase().replace(/\.$/, '')
  const extra = s.definition.additionalHosts?.find((h) => h.name === target)
  if (!extra && ![s.definition.target, 'dns.lab.example', 'backend.lab.example'].includes(target))
    return undefined
  if (
    !server &&
    s.cache &&
    (s.cache.name ?? s.definition.target) === target &&
    s.cache.expires > s.clock
  )
    return s.cache.address ?? undefined
  const dns = server ?? s.dns
  if (!routeTo(s, dns).reachable) return undefined
  const address =
    dns === s.definition.dns
      ? target === 'dns.lab.example'
        ? dns
        : (extra?.address ?? s.definition.server)
      : undefined
  if (!server)
    s.cache = {
      address: address ?? null,
      name: target,
      expires: s.clock + (address ? 300 : 120),
      negative: !address,
    }
  return address
}
export function networkGoal(s: NetworkState) {
  const reachable = routeTo(s, s.definition.server).reachable
  const name =
    s.dns === s.definition.dns &&
    (!s.cache ||
      s.cache.expires <= s.clock ||
      (s.cache.name !== undefined && s.cache.name !== s.definition.target) ||
      s.cache.address === s.definition.server)
  return (
    reachable &&
    !s.addressConflict &&
    s.mtu <= s.pathMtu &&
    name &&
    s.client === s.definition.client &&
    s.prefix === s.definition.prefix &&
    s.gateway === s.definition.gateway &&
    s.service &&
    s.clockCorrect &&
    s.trusted &&
    s.httpHealthy &&
    s.smbAccess &&
    s.policy &&
    s.permission &&
    s.ipv6 &&
    s.hosts.every((h) => h.online && h.dnsCorrect && h.service && h.httpHealthy)
  )
}
export function assessNetwork(
  s: NetworkState,
  diagnosis: number | undefined,
  hints: number,
): TerminalAssessment {
  const fault = s.definition.fault
  const relevant = ['dns', 'negative-cache', 'multi'].includes(fault)
    ? 'dns'
    : ['route', 'metric', 'vpn', 'gateway', 'mask'].includes(fault)
      ? 'routes'
      : fault === 'tls-clock' || fault === 'tls-trust'
        ? 'certificate'
        : ['smb', 'gpo'].includes(fault)
          ? 'identity'
          : fault === 'service' || fault === 'http'
            ? 'service'
            : fault === 'linux-permission'
              ? 'permission'
              : 'config'
  const checks: TerminalCheck[] = [
    {
      id: 'subsystem',
      label: 'Собрать данные о затронутой подсистеме',
      met: s.evidence.includes(relevant as NetworkState['evidence'][number]),
    },
    {
      id: 'baseline',
      label: 'Зафиксировать отказ в исходном состоянии среды',
      met: s.evidence.includes('failure'),
    },
    {
      id: 'verification',
      label: 'Устранить причину и проверить целевой сервис после последнего изменения',
      met: networkGoal(s) && s.verifiedRevision === s.revision && s.evidence.includes('success'),
    },
    {
      id: 'diagnosis',
      label: 'Объяснить причину на основании проверок',
      met: diagnosis === s.definition.correctCause,
    },
  ]
  return {
    checks,
    complete: checks.every((c) => c.met),
    score: Math.max(
      0,
      Math.round((100 * checks.filter((c) => c.met).length) / checks.length) -
        hints * 5 -
        Math.min(20, s.changeAudit.regressions * 5 + s.changeAudit.unnecessary * 2),
    ),
  }
}
export function parseLabPackage(text: string): LabDefinition[] {
  if (new TextEncoder().encode(text).length > 262144) throw new Error('Пакет превышает 256 KiB.')
  const value = z
    .object({ schemaVersion: z.literal(1), labs: z.array(topologySchema).min(1).max(20) })
    .strict()
    .parse(JSON.parse(text))
  if (new Set(value.labs.map((l) => l.id)).size !== value.labs.length)
    throw new Error('Повторяющиеся идентификаторы лабораторий.')
  if (value.labs.some((l) => !l.id.startsWith('USR-')))
    throw new Error('Импорт принимает только пользовательские USR-лаборатории.')
  return value.labs
}
