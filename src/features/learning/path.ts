import { questions } from './questions'
import type { LearningProgress } from './progress'

export const learningModules = [
  {
    topic: 'Сеть',
    goal: 'Различать настройки подключения, ICMP и доступность сервиса.',
    reading: 'ping',
    practice: '/guide',
    practiceLabel: 'Составить план проверки',
  },
  {
    topic: 'DNS',
    goal: 'Различать DNS-сервер, адрес ответа и работу сайта.',
    reading: 'dns',
    practice: '/simulator?scenario=INC-DNS-001',
    practiceLabel: 'Разобрать инцидент DNS',
  },
  {
    topic: 'DHCP',
    goal: 'Понимать выдачу адреса и границы выводов по APIPA.',
    reading: 'apipa',
    practice: '/analyzer?demo=apipa',
    practiceLabel: 'Разобрать учебный вывод',
  },
  {
    topic: 'Подсети',
    goal: 'Определять сеть, маску и доступные адреса, включая /31 и /32.',
    reading: 'cidr',
    practice: '/toolkit?practice=subnet',
    practiceLabel: 'Решить задания по подсетям',
  },
  {
    topic: 'Windows',
    goal: 'Собирать сведения о VPN, принтере и обновлении до изменения настроек.',
    reading: 'vpn',
    practice: '/simulator?scenario=INC-VPN-001',
    practiceLabel: 'Разобрать инцидент VPN',
  },
  {
    topic: 'Методика',
    goal: 'Отделять факт от гипотезы и объяснять следующую проверку.',
    reading: 'ping',
    practice: '/playbooks',
    practiceLabel: 'Пройти чек-лист диагностики',
  },
] as const

export function buildLearningPath(progress: LearningProgress) {
  const modules = learningModules.map((module, index) => {
    const items = questions.filter((question) => question.category === module.topic)
    const correct = items.filter((question) => progress.answers[question.id]?.lastCorrect).length
    const mistakes = items.filter(
      (question) => progress.answers[question.id]?.lastCorrect === false,
    ).length
    const attempted = items.filter((question) => progress.answers[question.id]).length
    return {
      ...module,
      index: index + 1,
      total: items.length,
      correct,
      mistakes,
      attempted,
      status: correct === items.length ? 'Повторение' : attempted ? 'В процессе' : 'Начать',
    }
  })
  const recommended =
    modules.find((module) => module.mistakes > 0) ??
    modules.find((module) => module.correct < module.total)
  return {
    modules,
    recommended,
    reason: recommended?.mistakes
      ? 'Сначала разберите последние ошибки, затем продолжайте маршрут.'
      : recommended
        ? 'Следующая тема в маршруте. Любую другую можно выбрать самостоятельно.'
        : 'Все последние ответы верны. Закрепите знания практикой: это не оценка готовности к реальной работе.',
  }
}
