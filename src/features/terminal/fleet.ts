import { resolveNetwork, routeTo, type NetworkState } from './networkModel'
export function fleetProbe(original: NetworkState, sourceId: string, targetId: string) {
  const s = structuredClone(original),
    d = s.definition
  const source = d.additionalHosts?.find((h) => h.id === sourceId && h.role === 'client')
  const target = d.additionalHosts?.find((h) => h.id === targetId && h.role === 'server')
  if ((sourceId !== 'client' && !source) || (targetId !== 'server' && !target))
    throw new Error('Выберите клиент и сервер из lab hosts.')
  const sourceState = source && s.hosts.find((h) => h.id === source.id)!,
    targetState = target && s.hosts.find((h) => h.id === target.id)!
  if (source && sourceState) {
    s.client = source.address
    s.prefix = d.prefix
    s.gateway = d.gateway
    s.dns = sourceState.dnsCorrect ? d.dns : '192.0.2.54'
    s.cache = null
    s.lease = sourceState.online
    s.addressConflict = false
  }
  const name = target?.name ?? d.target,
    address = resolveNetwork(s, name)
  const dns = !!address,
    route = !!address && routeTo(s, address).reachable
  const tcp = route && (targetState ? targetState.service : s.service)
  const https =
    tcp &&
    s.clockCorrect &&
    s.trusted &&
    s.mtu <= s.pathMtu &&
    (targetState ? targetState.httpHealthy : s.httpHealthy)
  return {
    source: sourceId,
    target: targetId,
    dns,
    route,
    tcp,
    https,
    result: !dns
      ? 'DNS: имя не разрешено'
      : !route
        ? 'Сетевой путь недоступен'
        : !tcp
          ? 'TCP: служба недоступна'
          : !https
            ? 'HTTPS: приложение или TLS недоступны'
            : 'HTTPS: 200 OK',
  }
}
export function fleetMatrix(s: NetworkState) {
  const clients = [
      'client',
      ...(s.definition.additionalHosts ?? []).filter((h) => h.role === 'client').map((h) => h.id),
    ],
    servers = [
      'server',
      ...(s.definition.additionalHosts ?? []).filter((h) => h.role === 'server').map((h) => h.id),
    ]
  return clients.flatMap((c) => servers.map((server) => fleetProbe(s, c, server)))
}
