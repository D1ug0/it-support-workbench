# Поддержка форматов — 0.6.0

Все примеры в `src/fixtures` синтетические. Матрица отражает проверенную логику подготовленных форматов, не утверждает совместимость со всеми версиями Windows. Настоящие captures пока не добавлены.

| Ввод                   | Синтетическая поддержка                                     | Минимальный пример                             | Проблемный пример / partial parse                                                          |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ipconfig /all          | CMD RU/EN, несколько адаптеров, IPv4/IPv6, DNS continuation | ipconfig-en-normal.txt, ipconfig-ru-normal.txt | ipconfig-partial.txt; невалидные поля пропускаются с предупреждением                       |
| ping                   | CMD RU/EN, Echo Reply, timeout, unreachable, RTT            | ping-en.txt, ping-ru.txt                       | outputParsers.test.ts: Received не превращает unreachable в Echo Reply                     |
| tracert                | CMD RU/EN, хопы, RTT/звёздочки, адрес цели                  | tracert-en.txt, tracert-ru.txt                 | outputParsers.test.ts: завершение без совпадения цели не доказывает успех                  |
| route print            | IPv4/IPv6 активные таблицы и persistent section             | route-en.txt, route-ru.txt                     | outputParsers.test.ts: ошибочные маски/метрики и неполные строки исключаются               |
| nslookup               | Ответы A/AAAA RU/EN, отделение секции сервера               | nslookup-en.txt, nslookup-ru.txt               | outputParsers.test.ts: ответ после первого timeout не теряется                             |
| dns-records            | Подготовленные MX/TXT/SRV RU/EN                             | dns-mx-en.txt, dns-srv-ru.txt, dns-txt-ru.txt  | extendedParsers.test.ts: неполные SRV/TXT не становятся полной записью                     |
| Resolve-DnsName        | Выбранный UTF-8 JSON A/AAAA/CNAME/MX/TXT/SRV                | powershell-dns.json                            | extendedParsers.test.ts: несовместимый тип/адрес или обязательное null — warning/partial   |
| Test-NetConnection     | Выбранный UTF-8 JSON, TCP boolean, порт 1–65535             | powershell-tcp.json                            | extendedParsers.test.ts: строка True вместо boolean отклоняется                            |
| Get-NetIPConfiguration | 1–2000 выбранных UTF-8 JSON объектов интерфейсов            | powershell-ip.json                             | extendedParsers.test.ts: повреждённый интерфейс пропускается с partial, остальные доступны |
| Учебные события/трассы | Bounded JSON практикума                                     | trainingTraces в traces.ts                     | workshop.test.ts: неизвестные поля/схема/превышение лимита отклоняются                     |

Общий вход анализатора ограничен 2 MiB и 50 000 строками. Один ввод — одна команда. Текстовые таблицы PowerShell, произвольный CIM JSON, другие локали, PCAP/EVTX, Git/systemd logs и фотографии автоматически не разбираются. Ручные заметки стенда доступны отдельно.

При добавлении настоящего capture используйте собственное разрешённое окружение: ОС/build, версия команды/PowerShell, локаль, дата/время, ожидаемый результат, обезличивание и ручной предпросмотр. Минимальный и проблемный примеры должны иметь проверяемые критерии ok/partial/unsupported/invalid и регрессию. Дата проверки содержания кода в карточке не означает выполненную проверку на ОС.

Первичные источники и точные модели перечислены в [PARSERS.md](PARSERS.md); подготовка окружения — в [REAL_LAB.md](REAL_LAB.md). Карточки материала в приложении отдельно отмечают теорию для внешнего стенда, формы симулятора и отсутствие реального fixture.
