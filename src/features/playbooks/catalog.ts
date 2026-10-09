import { knowledgeEntries } from '../knowledge/catalog'
export const playbooks = [
  {
    id: 'dns',
    title: 'Ресурс не открывается по имени',
    brief: 'Отделите DNS от транспорта и приложения.',
    entries: ['ipconfig', 'dns', 'tcp'],
  },
  {
    id: 'vpn',
    title: 'Доступ до и после VPN',
    brief: 'Сравните конфигурацию, DNS и маршрут к согласованному ресурсу.',
    entries: ['ipconfig', 'vpn', 'tracert', 'tcp'],
  },
  {
    id: 'dhcp',
    title: 'Адресация и DHCP',
    brief: 'Выберите нужный интерфейс и проверьте назначение адреса.',
    entries: ['apipa', 'ipconfig', 'ping'],
  },
  {
    id: 'printer',
    title: 'Печать и очередь',
    brief: 'Определите масштаб сбоя до изменения spooler.',
    entries: ['printer', 'ipconfig', 'tcp'],
  },
  {
    id: 'update',
    title: 'Windows Update',
    brief: 'Соберите код ошибки, состояние служб и контекст сети.',
    entries: ['update', 'dns', 'tcp'],
  },
  {
    id: 'network',
    title: 'Сеть и целевой сервис',
    brief: 'Сопоставьте конфигурацию, ICMP, трассировку и TCP.',
    entries: ['ipconfig', 'ping', 'tracert', 'tcp'],
  },
].map((playbook) => ({
  ...playbook,
  steps: playbook.entries.flatMap((id) => {
    const entry = knowledgeEntries.find((e) => e.id === id)!
    return entry.checks.map((label, index) => ({
      id: `${id}-${index}`,
      label,
      command: index === 0 ? entry.command : undefined,
      limitation: entry.limitation,
      source: entry.source,
    }))
  }),
}))
export function exportChecklist(id: string, done: string[]): string {
  const playbook = playbooks.find((p) => p.id === id)
  if (!playbook) throw new Error('Неизвестный чек-лист.')
  return [
    `# ${playbook.title}`,
    playbook.brief,
    'Это журнал выполнения пунктов, а не подтверждение исправности системы.',
    ...playbook.steps.map(
      (step) =>
        `- [${done.includes(step.id) ? 'x' : ' '}] ${step.label}${step.command ? `\n  Команда: ${step.command}` : ''}\n  Ограничение: ${step.limitation}\n  Источник: ${step.source.url}`,
    ),
  ].join('\n\n')
}
