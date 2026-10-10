# Парсеры

## ipconfig /all

Поддерживается текст CMD на RU/EN, несколько секций adapter/Адаптер, DHCP, физический адрес, описание, DNS suffix, IPv4/IPv6, маски, основной шлюз, DHCP server, DNS с продолжениями. IPv4 проверяет каждый октет; IPv6 проверяет группы, сжатие `::`, embedded IPv4 и zone index. Маска должна быть непрерывной.

Статусы `ok`, `partial`, `unsupported`, `invalid` разделены. Невалидное поле исключается; остальные сохраняются. Дополнительные известные стандартные поля Windows пропускаются, неизвестные отмечаются предупреждением. Само наличие IP не доказывает активный физический линк: UI пишет «Адрес назначен».

IPv4-маска относится к предшествующему адресу. Урезанный вывод может потерять эту связь и даёт предупреждение. Отсутствие шлюза у VPN-подобного интерфейса не вызывает NET-003. Unknown media state с адресами допускает анализ конфигурации; явное отключение отменяет гипотезы APIPA и отсутствующих DNS.

Каждый адрес сохраняет свою строку. Скалярные поля доступны через `fieldLines`; `sourceRange` охватывает секцию. Парсер не хранит DOM или исходные excerpts в экспортируемой модели.

## Дополнительные команды

`ping` читает цель, sent/received/lost, RTT, отдельные Echo Reply, timeout и Destination unreachable. `time<1ms` сохраняется. Received из Windows не подменяет число Echo Reply: unreachable может учитываться как полученный ответ. PING-001…003 описывают потери, успешные ответы и сообщения недоступности. Успешный ICMP не доказывает исправность приложения/TCP.

`nslookup` отделяет выбранный DNS-сервер от адресов ответа, читает продолжения и ошибки timeout/NXDOMAIN/SERVFAIL на RU/EN. Успешный ответ после начального тайм-аута сохраняется: ошибка обратного разрешения имени сервера не должна скрыть успешное разрешение запроса. DNS-001 описывает результат запроса; произвольные MX/TXT и интерактивный режим пока не поддерживаются.

`tracert` читает цель, номер хопа, три RTT/`*`, адрес/hostname и завершение. `<1 ms` сохраняется в модели, UI и отчёте. TRACE-001…003 различают отсутствующие ответы, наблюдаемое достижение известного адреса цели и недостаток подтверждения. Маркер завершения без совпадения адреса не доказывает достижение цели; молчащий промежуточный хоп не доказывает разрыв маршрута.

`route print` читает активные IPv4/IPv6-таблицы, network/prefix, gateway/on-link, интерфейс и метрику. Поддерживает IPv6 gateway на следующей строке, отделяет Persistent Routes. Невалидные маски/адреса/метрики исключаются. ROUTE-001…002 описывают default routes; выбор пути, interface metric и VPN policy требуют дополнительного контекста.

Новый формат получает отдельную модель `ParsedOutput`, parser, rules, синтетические RU/EN fixtures, тесты и UI. Один ввод — одна команда; сильные сигнатуры разных команд вызывают предупреждение о смешанном вводе.

## Правила ipconfig

NET-001 APIPA + DHCP; NET-002 отключение; NET-003 отсутствующий шлюз; NET-004 отсутствующий DNS; NET-005 невалидная маска; NET-006 несколько DNS; NET-007 возможный виртуальный интерфейс; NET-008 частичный разбор. Все имеют evidence и безопасные следующие проверки. Ни одно правило не подтверждает недоступность интернета или сервиса.

## Ограничения

Произвольные PowerShell objects, фотографии, другие локали и неизвестные форматы не поддерживаются. При слабом обнаружении можно вручную выбрать формат. Смешанный вывод нескольких команд нельзя считать единым ipconfig.

Источники: [Microsoft ipconfig](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig), [ping](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ping), [nslookup](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/nslookup), [tracert](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tracert), [route](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/route_ws2008), [RFC 5737](https://www.rfc-editor.org/rfc/rfc5737), [RFC 4291](https://www.rfc-editor.org/rfc/rfc4291). Проверены при реализации 09.10.2026.

## Типизированный DNS и PowerShell — parserVersion 1.2.0

Добавлены два отдельных формата; старый nslookup A/AAAA сохраняет прежнюю модель.

- `dns-records`: nslookup MX (`MX preference`, `mail exchanger` и русские варианты), SRV (`priority`, `weight`, `port`, `svr hostname` / русские поля), TXT (один или несколько сегментов в кавычках). Неполный SRV/TXT не становится полноценной записью. Общий лимит — 2000 записей.
- JSON `Resolve-DnsName`: A/AAAA, CNAME, MX, TXT, SRV. Type принимается как DNS-число или название. TTL и Section (`Answer/Authority/Additional` либо 1/2/3) сохраняются. Для A/AAAA проверяется семейство IP, MX требует Preference/NameExchange, SRV — Priority/Weight/Port/NameTarget, TXT — Strings. Поля с JSON null не заменяют обязательные значения.
- `powershell`: один JSON-объект `Test-NetConnection` с RemoteAddress, RemotePort 1–65535 и boolean TcpTestSucceeded. SourceAddress может быть строкой или вложенным объектом IPAddressToString/IPAddress. Строки True/False не принимаются вместо boolean.
- `Get-NetIPConfiguration`: 1–2000 объектов с InterfaceIndex, InterfaceAlias, IPv4Address; IPv6Address, IPv4DefaultGateway и DNSServer поддерживают выбранные массивы адресов и описанные вложенные поля. Неверный адрес не удаляется молча: интерфейс пропускается с предупреждением и статусом partial.

Локальные `.json` принимаются в UTF-8; UTF-16LE не поддерживается. Готовые read-only команды `Select-Object | ConvertTo-Json -Depth 4` находятся в анализаторе. Текстовые таблицы PowerShell/Format-List, произвольные CIM JSON, DNS error objects и нестандартные DNS debug dumps не поддерживаются. Общие лимиты 2 MiB/50 000 строк действуют до автоопределения. Смешение разных команд не распознаётся как одна.

Физические номера строк JSON-объектов сохраняются даже при вложенных адресах и строках с кавычками/скобками. Имена/TXT скрыты в UI по умолчанию и исключены из обычного отчёта. Успешный TCP не означает успешный TLS/HTTP/аутентификацию. SRV не означает доступность target.

Новые fixtures строго синтетические: четыре текстовых DNS-вывода и три JSON-вывода. Реальный экспорт из разных Windows/PowerShell ещё требует отдельной проверки.

Первичные описания: [nslookup](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/nslookup), [типы DNS](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/nslookup-set-type), [Resolve-DnsName](https://learn.microsoft.com/en-us/powershell/module/dnsclient/resolve-dnsname?view=windowsserver2025-ps), [Test-NetConnection](https://learn.microsoft.com/powershell/module/nettcpip/test-netconnection).
