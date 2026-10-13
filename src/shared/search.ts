const groups = [
  ['не открывается сайт', 'не открывается портал', 'http', 'https', 'tls', 'портал'],
  ['имя не найдено', 'днс', 'dns', 'nslookup', 'resolve-dnsname'],
  ['нет интернета', 'шлюз', 'gateway', 'маршрут', 'routing', 'dhcp'],
  ['вайфай', 'wi-fi', 'wifi', 'wlan'],
  ['отказ в доступе', 'access denied', 'smb', 'права', 'доступ'],
  ['гит', 'git', 'ci/cd', 'конфликт', 'ветки'],
  ['резервная копия', 'бэкап', 'backup', 'восстановление'],
]
function normalizeSearchValue(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}
export function matchesSearch(text: string, query: string) {
  const normalized = normalizeSearchValue(text),
    value = normalizeSearchValue(query)
  if (!value || normalized.includes(value)) return true
  return groups.some(
    (group) =>
      group.some((alias) => alias === value) && group.some((alias) => normalized.includes(alias)),
  )
}
