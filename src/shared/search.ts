const groups = [
  ['не открывается сайт', 'не открывается портал', 'http', 'https', 'tls', 'портал'],
  ['имя не найдено', 'днс', 'dns', 'nslookup', 'resolve-dnsname'],
  ['нет интернета', 'шлюз', 'gateway', 'маршрут', 'routing', 'dhcp'],
  ['вайфай', 'wi-fi', 'wifi', 'wlan'],
  ['отказ в доступе', 'access denied', 'smb', 'права', 'доступ'],
  ['гит', 'git', 'ci/cd', 'конфликт', 'ветки'],
  ['резервная копия', 'бэкап', 'backup', 'восстановление'],
]
export function matchesSearch(text: string, query: string) {
  const normalized = text.toLocaleLowerCase('ru-RU'),
    value = query.toLocaleLowerCase('ru-RU').trim()
  if (!value || normalized.includes(value)) return true
  return groups.some(
    (group) =>
      group.some((alias) => alias === value) && group.some((alias) => normalized.includes(alias)),
  )
}
