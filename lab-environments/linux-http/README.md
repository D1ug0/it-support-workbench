# Собственный Linux/HTTP-стенд

Это настоящие процессы Linux и HTTP внутри двух контейнеров, отдельно от симулятора Workbench. Предпосылки: Docker Engine/Compose, разрешённый собственный компьютер, свободный loopback-порт 18880. Образ Python 3.13-slim задаёт ветку версии; сохраните фактический image digest, версию Linux и дату в отчёте. Это не systemd, AD или TLS-стенд.

Из этой папки выполните вручную:

```sh
docker compose up --build -d
curl -i http://127.0.0.1:18880/ready
docker compose exec app id
docker compose exec app ls -l /state/config.json
docker compose logs --tail 30 app dependency
```

Снимок исходного состояния — содержимое config.json и успешная операция, сохранённые в отдельные учебные файлы. На хост ничего не монтируется. Стенд слушает только loopback, контейнеры без root, сеть internal; доступ к рабочим данным и Docker socket не предоставляется.

## Неисправность и диагностика

```sh
docker compose exec app python /lab/control.py break-permissions
curl -i http://127.0.0.1:18880/ready
docker compose logs --tail 30 app
docker compose exec app ls -l /state/config.json
docker compose exec app python /lab/control.py fix-permissions
curl -i http://127.0.0.1:18880/ready
```

Для второго независимого отказа:

```sh
docker compose exec dependency python /lab/control.py break-dependency
curl -i http://127.0.0.1:18880/ready
docker compose logs --tail 30 app dependency
docker compose exec dependency python /lab/control.py fix-dependency
```

Исправление одного отказа не делает ready=true, пока остаётся второй. Не применяйте chmod 777; объясните пользователя процесса и минимальное разрешение. Сравните TCP, HTTP 503 и успешную операцию. Запишите гипотезы, результаты, ревизию окружения и откат в «Настоящем стенде», сохраните отчёт вручную. Git/systemd/журнал описываются в заметках, парсер не обещает их автоматический разбор.

## Копия и восстановление

```sh
docker compose exec -T app cat /state/config.json > synthetic-config-backup.json
```

Просмотрите файл, зафиксируйте checksum и время. Для восстановления передайте проверенный JSON вручную в новое учебное окружение; Python/HTTP конфигурация читается без исполнения JSON. Измерьте длительность и разницу между временем копии и отказа (RTO/RPO). Исходник сохраняйте до подтверждения восстановления. Пакеты с чужим кодом не выполняйте.

## Сброс

```sh
docker compose exec app python /lab/control.py reset
docker compose exec dependency python /lab/control.py reset
curl -i http://127.0.0.1:18880/ready
docker compose down
```

Reset меняет только два вымышленных файла в /state. down удаляет эти контейнеры; tmpfs исчезает. Экспортированные отчёты и чужие volumes не затрагиваются. Для незнакомой итоговой работы попросите партнёра внести одну или обе подготовленные неисправности, затем самостоятельно определите причины. Результат стенда остаётся самостоятельным отчётом, а не автоматической аттестацией.
