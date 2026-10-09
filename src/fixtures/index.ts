import normal from './ipconfig-en-normal.txt?raw'
import russian from './ipconfig-ru-normal.txt?raw'
import apipa from './ipconfig-apipa.txt?raw'
import virtual from './ipconfig-multi-adapter.txt?raw'
import partial from './ipconfig-partial.txt?raw'
import disconnected from './ipconfig-disconnected.txt?raw'

export const examples = [
  {
    id: 'normal',
    name: 'Обычная конфигурация',
    tag: 'EN · 2 адаптера',
    description: 'Ethernet с DHCP и двумя DNS. Wi-Fi отключён.',
    text: normal,
  },
  {
    id: 'russian',
    name: 'Вывод на русском',
    tag: 'RU · 2 адаптера',
    description: 'Русские поля Windows и IPv6 DNS.',
    text: russian,
  },
  {
    id: 'apipa',
    name: 'Адрес APIPA',
    tag: 'DHCP · наблюдения',
    description: '169.254/16: что известно и что проверить дальше.',
    text: apipa,
  },
  {
    id: 'virtual',
    name: 'Несколько интерфейсов',
    tag: 'VPN · IPv4 + IPv6',
    description: 'Ethernet, виртуальный интерфейс и IPv6-туннель.',
    text: virtual,
  },
  {
    id: 'partial',
    name: 'Повреждённый вывод',
    tag: 'Частичный разбор',
    description: 'Невалидные адреса и маска без потери остальных полей.',
    text: partial,
  },
  {
    id: 'disconnected',
    name: 'Отключённые адаптеры',
    tag: 'Информационный статус',
    description: 'Отсутствие подключения не равно неисправности.',
    text: disconnected,
  },
]

import ping from './ping-en.txt?raw'
import lookup from './nslookup-en.txt?raw'
import trace from './tracert-en.txt?raw'
import routes from './route-en.txt?raw'
export const outputExamples = [
  ...examples,
  {
    id: 'ping',
    name: 'Ping: потери ICMP',
    tag: 'ICMP',
    description: 'Ответы, RTT и потери',
    text: ping,
  },
  {
    id: 'lookup',
    name: 'Nslookup: DNS-ответ',
    tag: 'DNS',
    description: 'Два адреса в ответе',
    text: lookup,
  },
  {
    id: 'trace',
    name: 'Tracert: пропуск хопа',
    tag: 'ROUTE',
    description: 'Промежуточный тайм-аут',
    text: trace,
  },
  {
    id: 'routes',
    name: 'Route print: IPv4 / IPv6',
    tag: 'TABLE',
    description: 'Активные маршруты',
    text: routes,
  },
]
