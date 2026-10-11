import { prefixToMask, isIPv4, calculateSubnet } from '../../domain/network'
import type { CommandKind } from '../../domain/types/diagnostic'
import { parseCommandTokens } from './commandSyntax'
import { commandMetadata, commandHelp, unsupportedCommand } from './commandRegistry'
import { fleetProbe, fleetMatrix } from './fleet'
import {
  evidence,
  mutate,
  auditNetworkChange,
  networkGoal,
  resolveNetwork,
  routeTo,
  trace,
  type NetworkState,
} from './networkModel'

export function executeNetwork(
  original: NetworkState,
  tokens: string[],
): { state: NetworkState; output: string; kind?: CommandKind; ok: boolean; clear?: boolean } {
  const s = structuredClone(original),
    d = s.definition
  const { cmd, args, matches } = parseCommandTokens(tokens)
  const metadata = commandMetadata(cmd, args)
  const out = (output: string, kind?: CommandKind) => ({ state: s, output, kind, ok: true })
  const fail = () => ({
    state: original,
    output: unsupportedCommand(tokens, original) + '\nИзменений нет.',
    ok: false,
  })
  const json = (value: unknown, kind?: CommandKind) => out(JSON.stringify(value, null, 2), kind)
  const read = (id: NetworkState['evidence'][number], message: string) => {
    evidence(s, id)
    trace(s, 'inspect', message)
  }
  const verify = (success: boolean, message: string, kind = 'observe') => {
    if (success || s.revision === 0) evidence(s, success ? 'success' : 'failure')
    const fault = d.fault
    const expected = s.hosts.length
      ? 'fleet'
      : fault === 'smb'
        ? 'smb'
        : fault === 'gpo'
          ? 'gpo'
          : fault === 'linux-permission'
            ? 'linux'
            : fault === 'ipv6'
              ? 'ipv6'
              : ['tls-clock', 'tls-trust', 'http', 'service', 'mtu'].includes(fault)
                ? 'https'
                : 'network'
    if (
      success &&
      networkGoal(s) &&
      (kind === expected || (expected === 'network' && kind === 'https'))
    )
      s.verifiedRevision = s.revision
    trace(s, 'verify', message)
  }
  const change = (message: string) => {
    if (metadata?.effect !== 'change')
      throw new Error('Command contract does not allow configuration changes.')
    mutate(s, message)
    auditNetworkChange(original, s)
  }
  if (s.revision >= 1000)
    return { state: original, output: 'Лимит изменений: перезапустите лабораторию.', ok: false }
  if (cmd === 'help' && !args.length)
    return out(
      `Учебная модель: ${d.title}\nСинтаксис ограничен; ОС не запускается. Windows PowerShell, PowerShell 7 и Linux показаны раздельно. curl в Windows PowerShell может быть alias; здесь моделируется форма curl из PowerShell 7/Linux.\n\n${commandHelp(s)}`,
    )
  if (cmd === 'help' && args.length === 1) {
    const text = commandHelp(s, args[0])
    return text
      ? out(
          `Учебные формы команды ${args[0]}:\n${text}\nСправка показывает синтаксис модели, а не выбранное исправление.`,
        )
      : {
          state: original,
          output: `Для «${tokens[1]}» нет учебной справки. Введите help для списка команд.\nИзменений нет.`,
          ok: false,
        }
  }
  if (matches('lab hosts') && s.hosts.length) {
    read('config', 'План дополнительных узлов')
    read('service', 'Состояние распределённого приложения')
    return out(
      `Основные узлы: client ${d.client}; server ${d.server}.\n${(d.additionalHosts ?? []).map((h) => `${h.id} · ${h.role} · ${h.address} · ${h.name}`).join('\n')}\nУчебные формы: lab inspect ID; lab probe CLIENT SERVER; lab repair ID dns|service|http|online; lab verify-fleet. Это операции модели, не команды ОС.`,
    )
  }
  if (cmd === 'lab' && args[0] === 'inspect' && args.length === 2) {
    const host = s.hosts.find((h) => h.id === args[1])
    if (!host) return fail()
    read('config', 'Параметры дополнительного узла')
    read('service', 'Служба дополнительного узла')
    read('dns', 'DNS дополнительного узла')
    return json(host)
  }
  if (cmd === 'lab' && args[0] === 'probe' && args.length === 3 && s.hosts.length) {
    try {
      const p = fleetProbe(s, args[1]!, args[2]!)
      verify(p.https, `${p.source} → ${p.target}: ${p.result}`)
      return json(p)
    } catch {
      return fail()
    }
  }
  if (cmd === 'lab' && args[0] === 'repair' && args.length === 3) {
    const host = s.hosts.find((h) => h.id === args[1]),
      definition = d.additionalHosts?.find((h) => h.id === args[1]),
      key = args[2]
    if (
      !host ||
      !definition ||
      !['dns', 'service', 'http', 'online'].includes(key ?? '') ||
      (key === 'dns' && definition.role !== 'client') ||
      (['service', 'http'].includes(key ?? '') && definition.role !== 'server')
    )
      return fail()
    if (key === 'dns') host.dnsCorrect = true
    else if (key === 'service') host.service = true
    else if (key === 'http') host.httpHealthy = true
    else host.online = true
    change(`Учебное исправление ${host.id}: ${key}`)
    return out(
      `Изменён только узел ${host.id}. Повторите проверки затронутых клиентов и lab verify-fleet.`,
    )
  }
  if (matches('lab verify-fleet') && s.hosts.length) {
    const rows = fleetMatrix(s),
      success = rows.every((p) => p.https)
    verify(
      success,
      `Матрица сервисов: ${rows.filter((p) => p.https).length}/${rows.length}`,
      'fleet',
    )
    return out(rows.map((p) => `${p.source} → ${p.target}: ${p.result}`).join('\n'))
  }
  if (cmd === 'cls' && !args.length)
    return { ...out('Экран очищен; среда сохранена.'), clear: true }
  if (
    cmd === 'wait' &&
    args.length === 1 &&
    /^\d+$/.test(args[0]!) &&
    Number(args[0]) >= 1 &&
    Number(args[0]) <= 3600
  ) {
    s.clock = Math.min(86400, s.clock + Number(args[0]))
    if (s.cache && s.cache.expires <= s.clock) s.cache = null
    trace(s, 'inspect', `Время +${args[0]} с`)
    return out(`Время лаборатории: ${s.clock} с. Кэш с истёкшим TTL удалён.`)
  }
  if (cmd === 'ipconfig' && (!args.length || matches('ipconfig /all'))) {
    read('config', 'Конфигурация интерфейса')
    return out(
      `Windows IP Configuration\n\n   Host Name . . . . . . . . . . . : TRAINING-PC\n\nEthernet adapter Ethernet:\n\n   DHCP Enabled . . . . . . . . . : ${s.dhcp ? 'Yes' : 'No'}\n   IPv4 Address . . . . . . . . . : ${s.client}(${s.addressConflict ? 'Duplicate' : 'Preferred'})\n   Subnet Mask . . . . . . . . . : ${prefixToMask(s.prefix)}\n   Default Gateway . . . . . . . : ${s.gateway}\n   DNS Servers . . . . . . . . . : ${s.dns}\n`,
      'ipconfig',
    )
  }
  if (matches('get-netipconfiguration')) {
    read('config', 'Настройки адаптера')
    return json(
      [
        {
          InterfaceIndex: 12,
          InterfaceAlias: 'Ethernet',
          IPv4Address: [s.client],
          IPv6Address: s.ipv6 ? ['2001:db8:1::10'] : [],
          IPv4DefaultGateway: [s.gateway],
          DNSServer: [s.dns],
        },
      ],
      'powershell',
    )
  }
  if (matches('ipconfig /displaydns')) {
    read('dns', 'Клиентский DNS-кэш')
    const cache = s.cache && s.cache.expires > s.clock ? s.cache : null
    return out(
      cache
        ? `${cache.name ?? d.target}\nTime To Live: ${cache.expires - s.clock}\n${cache.negative ? 'Negative cache: NXDOMAIN' : `A (Host) Record: ${cache.address}`}`
        : 'DNS Resolver Cache is empty.',
    )
  }
  if (matches('ipconfig /flushdns')) {
    s.cache = null
    change('Очищен DNS-кэш')
    return out('Successfully flushed the DNS Resolver Cache.')
  }
  if (matches('ipconfig /release')) {
    s.lease = false
    s.client = '0.0.0.0'
    change('Аренда освобождена')
    return out('Учебная DHCP-аренда освобождена.')
  }
  if (matches('ipconfig /renew')) {
    s.lease = true
    s.client = d.client
    s.prefix = d.prefix
    s.gateway = d.gateway
    s.addressConflict = false
    s.dns = d.dns
    change('Получена DHCP-аренда')
    return out(
      `DHCP: ${s.client}/${s.prefix}; шлюз ${s.gateway}; DNS ${s.dns}. DHCP-сервер в этой модели доступен.`,
    )
  }
  if (
    cmd === 'set-dnsclientserveraddress' &&
    args.length === 4 &&
    args[0] === '-interfaceindex' &&
    args[1] === '12' &&
    args[2] === '-serveraddresses' &&
    [d.dns, '192.0.2.54'].includes(args[3]!)
  ) {
    s.dns = args[3]!
    change('Изменён DNS-сервер')
    return out(`DNS: ${s.dns}; клиентский кэш сохранён.`)
  }
  if (
    cmd === 'set-netipaddress' &&
    args.length === 4 &&
    args[0] === '-interfaceindex' &&
    args[1] === '12' &&
    args[2] === '-prefixlength' &&
    /^\d+$/.test(args[3]!) &&
    Number(args[3]) >= 8 &&
    Number(args[3]) <= 32
  ) {
    s.prefix = Number(args[3])
    change('Изменён префикс')
    return out(`Префикс: /${s.prefix}.`)
  }
  if (
    cmd === 'lab' &&
    args.length === 2 &&
    args[0] === 'set-gateway' &&
    [d.gateway, '192.0.2.254'].includes(args[1]!)
  ) {
    s.gateway = args[1]!
    change('Изменён шлюз')
    return out(
      `Шлюз: ${s.gateway}. Учебная операция; реальный шлюз изменяют через настройки интерфейса или маршруты.`,
    )
  }
  if (matches('route print')) {
    read('routes', 'Таблица маршрутов')
    return out(
      `IPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n${s.routes
        .filter((r) => r.interface !== 'VPN' || s.vpn)
        .map(
          (r) =>
            `${r.network.padStart(17)} ${prefixToMask(r.prefix).padStart(16)} ${(r.prefix === 0 ? s.gateway : r.gateway).padStart(16)} ${s.client.padStart(16)} ${r.metric}`,
        )
        .join(
          '\n',
        )}\n${calculateSubnet(s.client, s.prefix).network.padStart(17)} ${prefixToMask(s.prefix).padStart(16)}          On-link ${s.client.padStart(16)} 281\n===========================================================================\nPersistent Routes:\n  None`,
      'route',
    )
  }
  if (cmd === 'route' && args[0] === 'delete' && args.length === 2 && isIPv4(args[1]!)) {
    const previous = s.routes.length
    s.routes = s.routes.filter((r) => r.network !== args[1])
    if (previous === s.routes.length) return out('Маршрут не найден; изменений нет.')
    change('Удалён маршрут')
    return out('OK! Маршрут удалён в учебной среде.')
  }
  if (
    cmd === 'set-netroute' &&
    args.length === 4 &&
    args[0] === '-destinationprefix' &&
    args[2] === '-routemetric' &&
    /^\d+$/.test(args[3]!) &&
    Number(args[3]) >= 1 &&
    Number(args[3]) <= 999
  ) {
    const match = s.routes.find((r) => `${r.network}/${r.prefix}` === args[1])
    if (!match) return fail()
    match.metric = Number(args[3])
    change('Изменена метрика')
    return out(`Метрика: ${match.metric}.`)
  }
  if (matches('rasdial vpn /disconnect')) {
    s.vpn = false
    change('VPN отключён')
    return out('Виртуальный VPN отключён; его маршруты не участвуют в выборе.')
  }
  if (cmd === 'nslookup' && args.length >= 1 && args.length <= 2) {
    const target = args[0]!.toLowerCase().replace(/\.$/, ''),
      server = args[1] ?? s.dns
    if (![d.dns, '192.0.2.54'].includes(server)) return fail()
    read('dns', 'Прямой запрос DNS')
    const address = resolveNetwork(s, target, server),
      reachable = routeTo(s, server).reachable
    return out(
      `Server: dns.lab.example\nAddress: ${server}\n\n${!reachable ? 'DNS request timed out.' : address ? `Non-authoritative answer:\nName: ${target}\nAddress: ${address}` : `*** dns.lab.example can't find ${target}: Non-existent domain`}`,
      'nslookup',
    )
  }
  if (cmd === 'resolve-dnsname' && args[0]) {
    const target = args[0].toLowerCase().replace(/\.$/, ''),
      typeIndex = args.indexOf('-type'),
      serverIndex = args.indexOf('-server')
    if (args.length !== 1 + (typeIndex >= 0 ? 2 : 0) + (serverIndex >= 0 ? 2 : 0)) return fail()
    const type = (typeIndex >= 0 ? args[typeIndex + 1] : 'a')?.toUpperCase(),
      server = serverIndex >= 0 ? args[serverIndex + 1] : undefined
    if (
      !['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'].includes(type ?? '') ||
      (server && ![d.dns, '192.0.2.54'].includes(server))
    )
      return fail()
    read('dns', 'Разрешение DNS')
    const address = resolveNetwork(s, target, server)
    if (!address)
      return out(
        'DNS name does not exist или сервер недоступен: сравните прямой запрос и клиентский кэш.',
      )
    const base = {
      Name: target,
      Type: type,
      TTL: s.cache && !server ? Math.max(0, s.cache.expires - s.clock) : 300,
      Section: 'Answer',
    }
    const record =
      type === 'A'
        ? { ...base, IPAddress: address }
        : type === 'AAAA'
          ? { ...base, IPAddress: '2001:db8:2::20' }
          : type === 'CNAME'
            ? { ...base, NameHost: 'backend.lab.example' }
            : type === 'MX'
              ? { ...base, NameExchange: 'mail.lab.example', Preference: 10 }
              : type === 'TXT'
                ? { ...base, Strings: ['lab=synthetic'] }
                : { ...base, NameTarget: 'dc.lab.example', Priority: 0, Weight: 100, Port: 389 }
    return json([record], 'dns-records')
  }
  if (
    cmd === 'test-netconnection' &&
    args.length === 3 &&
    args[1] === '-port' &&
    /^\d+$/.test(args[2]!) &&
    Number(args[2]) >= 1 &&
    Number(args[2]) <= 65535
  ) {
    const target = args[0]!,
      address = resolveNetwork(s, target),
      port = Number(args[2])
    const success =
      !!address &&
      routeTo(s, address).reachable &&
      (address === d.server
        ? s.service
        : !!d.additionalHosts?.some(
            (h) =>
              h.role === 'server' &&
              h.address === address &&
              s.hosts.find((state) => state.id === h.id)?.service,
          )) &&
      (port === 443 || port === 445)
    verify(
      success,
      `TCP ${port}: ${success ? 'доступен' : 'отказ'}`,
      target.toLowerCase().replace(/\.$/, '') === d.target && port === 443 ? 'network' : 'observe',
    )
    if (!address)
      return out(`WARNING: Name resolution of ${target} failed\nTcpTestSucceeded: False`)
    return json(
      {
        ComputerName: target,
        RemoteAddress: address,
        RemotePort: port,
        SourceAddress: s.client,
        InterfaceAlias: 'Ethernet',
        TcpTestSucceeded: success,
      },
      'powershell',
    )
  }
  if (matches('get-netipinterface')) {
    read('config', 'MTU виртуального интерфейса')
    return out(
      `InterfaceIndex 12 · Ethernet · NlMtuBytes ${s.mtu} · учебный предел пути ${s.pathMtu}`,
    )
  }
  if (
    cmd === 'set-netipinterface' &&
    args.length === 4 &&
    args[0] === '-interfaceindex' &&
    args[1] === '12' &&
    args[2] === '-nlmtubytes' &&
    /^\d+$/.test(args[3]!) &&
    Number(args[3]) >= 576 &&
    Number(args[3]) <= 1500
  ) {
    s.mtu = Number(args[3])
    change('Изменён MTU интерфейса')
    return out(`MTU: ${s.mtu}. Ограниченная IPv4-модель; PMTU discovery ОС здесь не исполняется.`)
  }
  if (
    cmd === 'ping' &&
    args.length === 4 &&
    args[0] === '-f' &&
    args[1] === '-l' &&
    /^\d+$/.test(args[2]!) &&
    Number(args[2]) <= 65507
  ) {
    read('config', 'IPv4 DF-проба')
    const address = resolveNetwork(s, args[3]!),
      reachable = !!address && routeTo(s, address).reachable
    const fits = Number(args[2]) + 28 <= Math.min(s.mtu, s.pathMtu)
    verify(reachable && fits, `DF-проба: ${reachable && fits ? 'ответ' : 'отказ'}`)
    return out(
      !reachable
        ? 'Request timed out.'
        : fits
          ? 'Reply received. Учебная DF-проба.'
          : 'Packet needs to be fragmented but DF set. IPv4: payload + 20 + 8 bytes.',
    )
  }
  if (cmd === 'ping' && (args.length === 1 || (args.length === 2 && args[0] === '-6'))) {
    const ipv6 = args[0] === '-6',
      target = args[ipv6 ? 1 : 0]!,
      address = resolveNetwork(s, target)
    const success = !!address && routeTo(s, address).reachable && (!ipv6 || s.ipv6)
    read('config', ipv6 ? 'Состояние IPv6' : 'Проверка ICMP')
    verify(
      success,
      `ICMP${ipv6 ? 'v6' : ''}: ${success ? 'ответ' : 'отказ'}`,
      ipv6 && target.toLowerCase().replace(/\.$/, '') === d.target ? 'ipv6' : 'observe',
    )
    if (ipv6)
      return out(
        success
          ? 'Reply from 2001:db8:2::20: time=1ms (учебный IPv6-компонент)'
          : 'IPv6 component disabled. Учебная модель не реализует ND/SLAAC.',
      )
    if (!address) return out(`Ping request could not find host ${target}.`, 'ping')
    return out(
      `Pinging ${target} [${address}] with 32 bytes of data:\n${Array.from({ length: 4 }, () => (success ? `Reply from ${address}: bytes=32 time=1ms TTL=64` : 'Request timed out.')).join('\n')}\n\nPing statistics for ${address}:\n    Packets: Sent = 4, Received = ${success ? 4 : 0}, Lost = ${success ? 0 : 4} (${success ? 0 : 100}% loss),\n${success ? 'Approximate round trip times in milli-seconds:\n    Minimum = 1ms, Maximum = 1ms, Average = 1ms' : ''}`,
      'ping',
    )
  }
  if (cmd === 'tracert' && args.length === 1) {
    read('routes', 'Трассировка пути')
    const address = resolveNetwork(s, args[0]!)
    if (!address) return out(`Unable to resolve target system name ${args[0]}.`)
    const path = routeTo(s, address)
    return out(
      `Tracing route to ${args[0]} [${address}]\nover a maximum of 30 hops:\n\n${path.hops.length ? path.hops.map((h, i) => `  ${i + 1}    1 ms    1 ms    1 ms  ${h}`).join('\n') : '  1    *        *        *     Request timed out.'}\n\nTrace complete.`,
      'tracert',
    )
  }
  if (
    (cmd === 'curl' || cmd === 'curl.exe') &&
    args.length === 2 &&
    args[0] === '-I' &&
    [
      d.target,
      ...(d.additionalHosts ?? []).filter((h) => h.role === 'server').map((h) => h.name),
    ].some((name) => args[1]?.toLowerCase() === `https://${name}`)
  ) {
    const target = args[1]!.slice(8).toLowerCase(),
      extra = d.additionalHosts?.find((h) => h.name === target),
      host = extra && s.hosts.find((h) => h.id === extra.id)
    const address = resolveNetwork(s, target),
      reachable = !!address && routeTo(s, address).reachable && (host ? host.service : s.service)
    const httpHealthy = host ? host.httpHealthy : s.httpHealthy
    const success = reachable && s.mtu <= s.pathMtu && s.clockCorrect && s.trusted && httpHealthy
    verify(success, success ? 'HTTPS: 200' : 'HTTPS: отказ', 'https')
    return out(
      !reachable
        ? 'curl: (7) Failed to connect'
        : s.mtu > s.pathMtu
          ? 'curl: (28) Transfer timed out: учебный путь отклоняет крупные IPv4-пакеты; сравните DF-пробы.'
          : !s.clockCorrect
            ? 'curl: (60) Certificate is not yet valid: client clock'
            : !s.trusted
              ? 'curl: (60) Unable to get local issuer certificate'
              : `HTTP/1.1 ${httpHealthy ? '200 OK' : '503 Service Unavailable'}\nServer: LabWeb\nX-Lab: synthetic`,
    )
  }
  if (matches('certutil -verify lab.cer')) {
    read('certificate', 'Цепочка учебного сертификата')
    return out(
      `Учебный сертификат\nSAN: ${d.target}\nIssuer: Lab CA\nСрок: действителен по времени лаборатории\nЧасы клиента: ${s.clockCorrect ? 'верны' : 'расходятся'}\nДоверие: ${s.trusted ? 'есть' : 'нет'}\nИмпорт lab-ca.cer — только виртуальное хранилище.`,
    )
  }
  if (matches('w32tm /query /status')) {
    read('certificate', 'Состояние часов')
    return out(`Учебные часы: ${s.clockCorrect ? 'синхронизированы' : 'расхождение +365 дней'}`)
  }
  if (matches('w32tm /resync')) {
    s.clockCorrect = true
    change('Часы синхронизированы')
    return out('Учебное время клиента синхронизировано.')
  }
  if (
    matches('import-certificate -filepath lab-ca.cer -certstorelocation cert:\\localmachine\\root')
  ) {
    s.trusted = true
    change('Доверие учебному CA')
    return out('Lab CA добавлен в виртуальное хранилище. Настройки вашего устройства не изменены.')
  }
  if (
    matches('get-service') ||
    matches('get-service webapp') ||
    matches('systemctl status lab-app')
  ) {
    read('service', 'Состояние службы')
    if (cmd === 'systemctl') read('permission', 'Состояние Linux-службы')
    const good = s.service && s.permission
    verify(
      good,
      `Служба: ${good ? 'работает' : 'отказ'}`,
      cmd === 'systemctl' ? 'linux' : 'observe',
    )
    return out(
      `WebApp / lab-app: ${good ? 'Running / active' : 'Stopped / failed'}${!s.permission ? '\nPermission denied: /etc/lab/app.conf' : ''}`,
    )
  }
  if (matches('start-service webapp') || matches('restart-service webapp')) {
    s.service = true
    s.httpHealthy = true
    change('Служба WebApp запущена')
    return out('Учебная служба WebApp работает; повторите запрос к приложению.')
  }
  if (matches('get-winevent -logname system -maxevents 5') || matches('journalctl -u lab-app')) {
    read('events', 'Журнал событий')
    read(cmd === 'journalctl' ? 'permission' : 'service', 'Причина события')
    return json([
      {
        TimeCreated: `T+${s.clock}s`,
        ProviderName: 'Lab',
        Id: 1001,
        LevelDisplayName: networkGoal(s) ? 'Information' : 'Error',
        Message: !s.permission
          ? 'Permission denied: /etc/lab/app.conf'
          : !s.service
            ? 'WebApp stopped'
            : !s.httpHealthy
              ? 'Backend not ready'
              : 'Состояние лаборатории; вывод синтетический',
      },
    ])
  }
  if (matches('whoami /groups') || matches('get-smbconnection')) {
    read('identity', 'Права и группы')
    verify(
      s.smbAccess,
      'Проверка доступа к учебной папке',
      matches('get-smbconnection') ? 'smb' : 'observe',
    )
    return out(
      `LabUser: ${s.smbAccess ? 'LabReaders / Access granted' : 'Users / Access denied'}\nShare: \\files.lab.example\\training\nПример не моделирует все правила share/NTFS ACL.`,
    )
  }
  if (matches('lab grant-share-access')) {
    s.smbAccess = true
    change('Предоставлен учебный доступ')
    return out('Учебный пользователь добавлен в LabReaders; повторите проверку доступа.')
  }
  if (matches('gpresult /r')) {
    read('identity', 'Результирующая политика')
    verify(s.policy, 'Версия политики', 'gpo')
    return out(
      `LabPolicy: ${s.policy ? 'версия 2, применена' : 'версия 1, устарела'}\nУчебная модель применения политики.`,
    )
  }
  if (matches('gpupdate /force')) {
    s.policy = true
    change('Политика обновлена')
    return out('LabPolicy версия 2 применена в учебной среде.')
  }
  if (matches('ls -l /etc/lab/app.conf')) {
    read('permission', 'Права конфигурации')
    return out(`${s.permission ? '-rw-r-----' : '----------'} labsvc labsvc /etc/lab/app.conf`)
  }
  if (matches('chmod 640 /etc/lab/app.conf')) {
    s.permission = true
    change('Права файла исправлены')
    return out('Учебный файл: 640; владелец labsvc. Проверьте systemctl status lab-app.')
  }
  if (matches('netsh wlan show interfaces')) {
    read('config', 'Состояние Wi-Fi')
    return out(
      `State: ${s.wifi ? 'connected' : 'disconnected'}\nSSID: LabWiFi\nSignal: ${s.wifi ? '80%' : '0%'}\nСигнал и радиосреда не моделируются.`,
    )
  }
  if (
    cmd === 'netsh' &&
    args.length === 3 &&
    args[0]?.toLowerCase() === 'wlan' &&
    args[1]?.toLowerCase() === 'connect' &&
    args[2]?.slice(0, 5).toLowerCase() === 'name=' &&
    args[2].slice(5) === 'LabWiFi'
  ) {
    s.wifi = true
    change('Подключение Wi-Fi')
    return out('Подключено к виртуальной LabWiFi.')
  }
  if (matches('get-netadapterbinding')) {
    read('config', 'Компоненты адаптера')
    return out(`Ethernet ms_tcpip6 Enabled: ${s.ipv6}`)
  }
  if (matches('enable-netadapterbinding -name ethernet -componentid ms_tcpip6')) {
    s.ipv6 = true
    change('IPv6 включён')
    return out('IPv6-компонент включён в учебной модели; ND/SLAAC не реализованы.')
  }
  return fail()
}
