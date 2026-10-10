export const labIds = ['TERM-DNS-SERVER', 'TERM-DNS-CACHE', 'TERM-ICMP-TCP'] as const
export type LabId = (typeof labIds)[number]
export const terminalLabs = [
  {
    id: labIds[0],
    title: 'Неверный DNS-сервер',
    brief:
      'На учебном ПК не открывается portal.lab.example. По IP сервис доступен. Найдите причину и восстановите подключение по имени.',
    topic: 'DNS',
    hints: [
      'Сравните настройки адаптера и ответы DNS. В заявке указан рабочий DNS: 192.0.2.53.',
      'nslookup portal.lab.example 192.0.2.53 опрашивает указанный сервер, не меняя настройки ПК.',
      'После изменения DNS повторите Test-NetConnection portal.lab.example -Port 443. Очистка кэша сама по себе сервер не меняет.',
    ],
    causes: [
      'На адаптере выбран DNS-сервер без записи портала',
      'HTTPS-служба остановлена',
      'Исчерпаны адреса DHCP',
    ],
    correctCause: 0,
    explanation:
      'Сервер 192.0.2.54 не знает запись портала, а 192.0.2.53 возвращает 192.0.2.20. Запрос к серверу вручную не меняет настройку адаптера. Укажите рабочий DNS и подтвердите TCP-подключение по имени после изменения.',
  },
  {
    id: labIds[1],
    title: 'Устаревший DNS-кэш',
    brief:
      'Портал переехал на 192.0.2.20. DNS уже обновлён, но учебный ПК продолжает обращаться к старому адресу. Найдите расхождение и проверьте исправление.',
    topic: 'DNS-кэш',
    hints: [
      'Посмотрите ipconfig /displaydns и сравните с nslookup portal.lab.example.',
      'nslookup опрашивает DNS-сервер напрямую. Test-NetConnection по имени использует клиентское разрешение с кэшем.',
      'ipconfig /flushdns очищает виртуальный кэш. Затем повторите TCP-проверку по имени, чтобы получить актуальный адрес.',
    ],
    causes: [
      'Неверная маска подсети',
      'В клиентском DNS-кэше остался старый адрес',
      'Необходимо отключить сетевой адаптер',
    ],
    correctCause: 1,
    explanation:
      'Сервер возвращает новый адрес, а клиентский кэш содержит 198.51.100.99. nslookup не доказывает, что другие приложения уже используют этот ответ. Очистка кэша и повторная проверка по имени подтверждают изменение.',
  },
  {
    id: labIds[2],
    title: 'Ping молчит, TCP отвечает',
    brief:
      'Мониторинг показывает тайм-ауты ping для portal.lab.example. Нужно выяснить, доступен ли TCP-порт 443 и обоснован ли вывод о недоступности сервиса.',
    topic: 'ICMP и TCP',
    hints: [
      'Проверьте отдельно ICMP и TCP 443. Не меняйте настройки без необходимости.',
      'Test-NetConnection portal.lab.example -Port 443 проверяет TCP. Успешный результат не подтверждает HTTP, TLS или вход пользователя.',
      'В этой среде сервер не отвечает на ICMP Echo, но принимает TCP 443. Исправление конфигурации не требуется.',
    ],
    causes: [
      'Сайт полностью исправен, включая TLS и вход',
      'DNS не работает',
      'ICMP Echo не отвечает, но TCP 443 доступен',
    ],
    correctCause: 2,
    explanation:
      'В виртуальной среде ICMP Echo заблокирован независимо от TCP. Успешное соединение с портом подтверждает транспортную доступность, но для HTTP/TLS/авторизации нужны отдельные проверки. Изменять DNS или перезапускать сеть здесь не требуется.',
  },
] as const
export const commandExamples = [
  ['ipconfig /all', 'Настройки виртуального адаптера'],
  ['ipconfig /displaydns', 'Локальный DNS-кэш'],
  ['ipconfig /flushdns', 'Очистить виртуальный DNS-кэш'],
  ['nslookup portal.lab.example', 'Опросить настроенный DNS напрямую'],
  ['nslookup portal.lab.example 192.0.2.53', 'Опросить выбранный DNS'],
  ['ping portal.lab.example', 'Проверить ICMP Echo'],
  ['tracert portal.lab.example', 'Посмотреть учебный маршрут'],
  ['route print', 'Таблица маршрутов'],
  ['Resolve-DnsName portal.lab.example', 'Клиентское разрешение имени; учебный JSON'],
  ['Test-NetConnection portal.lab.example -Port 443', 'Проверить TCP; учебный JSON'],
  ['Get-NetIPConfiguration', 'Параметры адаптера; учебный JSON'],
  [
    'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.53',
    'Изменить DNS виртуального адаптера',
  ],
] as const
