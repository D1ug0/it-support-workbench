import { networkProblems, type NetworkState } from './networkModel'
export interface CommandReview {
  title: string
  consequence: string
  next: string
  exercise: string
  lesson: string
}
const topics: Record<string, { lesson: string; title: string; next: string; exercise: string }> = {
  address: {
    lesson: 'ADDRESS',
    title: 'Адрес и аренда',
    next: 'Сравните ipconfig /all с планом адресации.',
    exercise: 'Объясните, какие значения адреса и аренды позволяют начать проверку маршрута.',
  },
  prefix: {
    lesson: 'ROUTES',
    title: 'Префикс',
    next: 'Сравните route print и префикс клиента с планом.',
    exercise: 'Определите, считает ли клиент шлюз локальным при текущем префиксе.',
  },
  gateway: {
    lesson: 'ROUTES',
    title: 'Шлюз',
    next: 'Проверьте next hop и его принадлежность подсети клиента.',
    exercise: 'Объясните, почему изменение DNS не исправляет недоступный шлюз.',
  },
  route: {
    lesson: 'ROUTES',
    title: 'Маршрут',
    next: 'Сравните длину префикса, метрику и интерфейс в route print.',
    exercise: 'Назовите маршрут, который будет выбран раньше остальных, и причину выбора.',
  },
  dns: {
    lesson: 'DNS',
    title: 'Клиентский DNS',
    next: 'Сравните выбранный DNS и прямой nslookup к DNS из плана.',
    exercise: 'Объясните, почему nslookup с явно указанным сервером не меняет настройки клиента.',
  },
  cache: {
    lesson: 'DNS',
    title: 'DNS-кэш',
    next: 'Сравните ipconfig /displaydns и прямой ответ DNS.',
    exercise: 'Отличите неверный DNS-сервер от устаревшего или отрицательного кэша.',
  },
  service: {
    lesson: 'WINDOWS',
    title: 'Служба',
    next: 'Проверьте Get-Service WebApp и журнал перед изменением.',
    exercise: 'Отдельно подтвердите запуск службы и успешный пользовательский запрос.',
  },
  http: {
    lesson: 'WEB',
    title: 'Готовность приложения',
    next: 'Сравните TCP-подключение и curl -I к целевому имени.',
    exercise: 'Объясните, как открытый порт может сочетаться с HTTP 503.',
  },
  clock: {
    lesson: 'TLS',
    title: 'Время',
    next: 'Сравните часы клиента и срок сертификата.',
    exercise: 'Почему запуск службы не исправит ошибку срока сертификата?',
  },
  trust: {
    lesson: 'TLS',
    title: 'Доверие',
    next: 'Проверьте certutil -verify lab.cer и учебную цепочку.',
    exercise: 'Назовите разницу между верным именем сертификата и доверенной цепочкой.',
  },
  mtu: {
    lesson: 'ROUTES',
    title: 'Размер пакета',
    next: 'Сравните Get-NetIPInterface, DF-пробы и запрос HTTPS.',
    exercise: 'Прибавьте к IPv4 ICMP payload 28 байт и сравните с пределом пути.',
  },
}
export function reviewCommand(
  before: NetworkState,
  after: NetworkState,
  ok: boolean,
): CommandReview | undefined {
  if (!ok)
    return {
      title: 'Команда не выполнена',
      consequence:
        'Состояние модели не изменилось. Неподдерживаемая форма не является измерением состояния ОС.',
      next: 'Откройте help и проверьте параметры поддерживаемой формы.',
      exercise: 'Сформулируйте, какое наблюдение нужна получить до изменения настройки.',
      lesson: 'ADDRESS',
    }
  if (after.revision === before.revision) return undefined
  const previous = networkProblems(before),
    current = networkProblems(after),
    added = current.filter((p) => !previous.includes(p)),
    removed = previous.filter((p) => !current.includes(p))
  const key = (added[0] ?? removed[0] ?? current[0] ?? '').split(':').at(-1) ?? ''
  const topic = topics[key] ?? {
    lesson: 'WEB',
    title: 'Состояние узла',
    next: 'Сравните состояние узла до/после и выполните целевую проверку.',
    exercise: 'Назовите исходное доказательство, изменение и необходимую повторную проверку.',
  }
  return {
    title: added.length
      ? 'Изменение добавило неисправность'
      : removed.length
        ? 'Изменение устранило подтверждённое условие'
        : 'Изменение не улучшило условия модели',
    consequence: `${topic.title}. ${added.length ? 'Затронуты новые условия: ' + added.join(', ') : removed.length ? 'Исправлены условия: ' + removed.join(', ') : 'Число неисправных условий не сократилось.'} Любое изменение отменяет предыдущую итоговую проверку.`,
    next: topic.next,
    exercise: topic.exercise,
    lesson: topic.lesson,
  }
}
