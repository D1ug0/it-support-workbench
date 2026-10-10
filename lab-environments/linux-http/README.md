# Собственный Linux/HTTP-стенд

Это настоящие процессы Linux и HTTP внутри двух контейнеров, отдельно от симулятора Workbench. Предпосылки: Docker Engine/Compose, собственный компьютер, свободный loopback-порт 18880. Python 3.13-slim задаёт ветку версии; сохраните фактический image ID, Python/Linux и дату в отчёте. Это не systemd, AD или TLS-стенд.

Из этой папки выполните вручную:

```sh
docker compose up --build -d
curl -i http://127.0.0.1:18880/ready
docker compose exec app id
docker compose exec app ls -l /state/config.json
docker compose logs --tail 30 app dependency
```

На хост ничего не монтируется. Стенд слушает только loopback, контейнеры без root, сеть internal; рабочие данные и Docker socket не предоставляются. `WORKBENCH_LAB_PORT` позволяет выбрать другой свободный loopback-порт. Не используйте имя Compose-проекта, которое уже занято своим другим окружением.

## Два независимых отказа

Сохраните исходный ответ `/ready` с 12 вымышленными заявками. Затем:

```sh
docker compose exec app python /lab/control.py break-permissions
docker compose exec dependency python /lab/control.py break-dependency
curl -i http://127.0.0.1:18880/ready
docker compose logs --tail 30 app dependency
docker compose exec app ls -l /state/config.json
docker compose exec app python /lab/control.py fix-permissions
curl -i http://127.0.0.1:18880/ready
docker compose exec dependency python /lab/control.py fix-dependency
curl -i http://127.0.0.1:18880/ready
```

После первой правки HTTP остаётся 503; после второй — 200 с ожидаемым содержимым. Не применяйте chmod 777: объясните UID/GID, права файла и каталога. Запишите гипотезы, результаты и откат в отчёте стенда. Git/systemd/журнал описываются вручную, автоматический разбор не обещается.

## Копия и отдельное восстановление

После исправления источника:

```sh
docker compose exec -T app cat /state/config.json > synthetic-config-backup.json
```

Просмотрите JSON и запишите checksum и время копии. Внесите повреждение содержимого **своего** источника, зафиксируйте время отказа; источник оставьте для сравнения. Создайте новое окружение с другим именем проекта и портом (синтаксис ниже — shell Linux/macOS):

```sh
docker compose exec app python /lab/control.py break-content
WORKBENCH_LAB_PORT=18881 docker compose -p workbench-restore-01 up --build -d
cat synthetic-config-backup.json | docker compose -p workbench-restore-01 exec -T app python /lab/control.py restore
curl -i http://127.0.0.1:18881/ready
docker compose -p workbench-restore-01 exec -T app cat /state/config.json
```

`restore` принимает только известный вымышленный JSON v1 с двумя полями, до 4096 байт; чужой код не исполняется. Проверяйте содержимое и checksum **после** restore, затем HTTP-операцию. Запишите время восстановления (RTO) и разницу между копией и отказом (приближение RPO). HTTP 200 с повреждённым содержимым не доказывает восстановление данных. Источник не удаляется. Это учебное файловое хранилище, не транзакционная СУБД.

## Сброс и завершение

```sh
docker compose exec app python /lab/control.py reset
docker compose exec dependency python /lab/control.py reset
curl -i http://127.0.0.1:18880/ready
docker compose -p workbench-restore-01 down
docker compose down
```

Reset меняет только вымышленные файлы в /state, включая восстановление минимальных прав. down удаляет контейнеры выбранного учебного проекта; tmpfs исчезает. Экспортированные отчёты и чужие volumes не затрагиваются. Партнёр может внести один или оба подготовленных отказа для незнакомой итоговой работы. Отчёт остаётся самостоятельной записью о практике.

## Автоматическая проверка из репозитория

```sh
npm run test:lab:linux
```

Скрипт берёт настоящий compose.yaml, создаёт уникальный временный проект без опубликованных портов и host volumes, проверяет UID 10001, исправный ответ, два отказа, сохранение 503 после одной правки, восстановление в отдельном контейнере с checksum, отказ неизвестного backup JSON и reset. Он выводит версии Docker/Linux/Python, image ID и учебные RTO/RPO. В finally удаляет только созданный проект и его локальные образы. Проверка действительно выполнена; фактическая среда и результат находятся в [VALIDATION.md](../../docs/VALIDATION.md).
