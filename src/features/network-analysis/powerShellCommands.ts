export const powerShellCommands = [
  {
    title: 'Resolve-DnsName · типизированный DNS',
    command:
      'Resolve-DnsName _ldap._tcp.dc._msdcs.lab.example -Type SRV | Select-Object Name,Type,TTL,Section,IPAddress,NameHost,NameExchange,Preference,Strings,NameTarget,Priority,Weight,Port | ConvertTo-Json -Depth 4',
    purpose:
      'JSON DNS-записей. Можно выбрать A, AAAA, CNAME, MX, TXT или SRV; содержимое TXT в отчёт по умолчанию не включается.',
  },
  {
    title: 'Test-NetConnection · TCP',
    command:
      'Test-NetConnection portal.lab.example -Port 443 | Select-Object ComputerName,RemoteAddress,RemotePort,SourceAddress,InterfaceAlias,TcpTestSucceeded | ConvertTo-Json -Depth 4',
    purpose: 'Одна TCP-проверка с JSON boolean. Предупреждения консоли не включайте в JSON.',
  },
  {
    title: 'Get-NetIPConfiguration · выбранные поля',
    command:
      "Get-NetIPConfiguration | Select-Object InterfaceIndex,InterfaceAlias,@{n='IPv4Address';e={@($_.IPv4Address.IPAddress)}},@{n='IPv6Address';e={@($_.IPv6Address.IPAddress)}},@{n='IPv4DefaultGateway';e={@($_.IPv4DefaultGateway.NextHop)}},@{n='DNSServer';e={@($_.DNSServer.ServerAddresses)}} | ConvertTo-Json -Depth 4",
    purpose:
      'Явно выбранные поля с массивами адресов. Имена учебные; для сетевых запросов выбирайте согласованный ресурс.',
  },
]
