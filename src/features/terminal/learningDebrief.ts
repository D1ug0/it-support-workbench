import type { TerminalAssessment, TerminalCheckId } from './assessment'
import type { LabState } from './engine'
import type { TerminalMode } from './checkpoint'
import { terminalLabs } from './catalog'
import { workshopCourses } from '../workshop/courses'
import { skills } from '../workshop/skills'

export type ProcessDrillId =
  'evidence' | 'baseline' | 'verification' | 'diagnosis' | 'minimal-change'
export interface ProcessDrill {
  id: ProcessDrillId
  title: string
  prompt: string
  options: [string, string, string]
  correct: number
  explanation: string
}

/** New situations about the process, independent of the current lab's hidden cause. */
export const processDrills: Record<ProcessDrillId, ProcessDrill> = {
  evidence: {
    id: 'evidence',
    title: 'Наблюдение и гипотеза',
    prompt:
      'В учебном инциденте приложение не открывается. Коллега предполагает проблему DNS, но результатов команд ещё нет. Как оформить это в отчёте?',
    options: [
      'Записать DNS как установленную причину',
      'Оставить DNS гипотезой и получить проверку, которая её различает с другими причинами',
      'Заменить адрес DNS и считать изменение доказательством',
    ],
    correct: 1,
    explanation:
      'Симптом допускает несколько причин. Гипотезе нужны наблюдение, источник результата и граница вывода. Само изменение настройки не подтверждает исходную причину.',
  },
  baseline: {
    id: 'baseline',
    title: 'С чем сравнивать исправление',
    prompt:
      'До изменения настройки ученик видел только сообщение пользователя. После изменения учебная проверка успешна. Что ещё нельзя установить из этих данных?',
    options: [
      'Как именно исходный отказ отличался от результата после изменения',
      'Что последняя учебная проверка завершилась успешно',
      'Что пользователь сообщил о проблеме',
    ],
    correct: 0,
    explanation:
      'Сообщение пользователя и исходная техническая проверка — разные источники. Повторяемая проверка до изменения даёт основу для сравнения. Если среда уже исправлена, в новой попытке сначала снимите исходный результат.',
  },
  verification: {
    id: 'verification',
    title: 'Актуальность результата',
    prompt:
      'В состоянии 2 подключение по имени было успешным. Затем в состоянии 3 изменили ещё одну настройку. Какой результат подтвердит текущее состояние?',
    options: [
      'Прежняя успешная проверка состояния 2',
      'Сообщение об успешном применении настройки',
      'Повторная проверка того же имени и сервиса в состоянии 3',
    ],
    correct: 2,
    explanation:
      'Успех относится к состоянию, в котором он получен. После следующего изменения повторите целевой сценарий. Применение настройки показывает выполнение действия, а не работоспособность сервиса.',
  },
  diagnosis: {
    id: 'diagnosis',
    title: 'Граница технического вывода',
    prompt:
      'Учебная TCP-проверка порта 443 успешна. Проверок TLS, HTTP и входа пользователя нет. Какой вывод обоснован?',
    options: [
      'Подтверждено TCP-подключение; остальные уровни требуют своих проверок',
      'Подтверждены TLS, HTTP и доступ пользователя',
      'Любой отказ приложения теперь исключён',
    ],
    correct: 0,
    explanation:
      'Каждая проверка подтверждает свой уровень и контекст. Даже успешный транспорт не устанавливает исправность протокола приложения или авторизации. В объяснении укажите, что проверено и что осталось неизвестным.',
  },
  'minimal-change': {
    id: 'minimal-change',
    title: 'Когда изменение не нужно',
    prompt:
      'В модели ping не получает ответа, но целевая TCP-проверка успешна. Конфигурация соответствует заявке. Как действовать?',
    options: [
      'Поменять DNS наугад',
      'Объяснить различие проверок и продолжить диагностику нужного уровня без изменения сети',
      'Удалить маршрут ради повторной проверки',
    ],
    correct: 1,
    explanation:
      'Отсутствие ответа на ICMP само по себе не доказывает отказ TCP. Изменение должно отвечать проверенной гипотезе. При работоспособной конфигурации лишнее действие добавляет риск и усложняет объяснение.',
  },
}

const guidance: Record<TerminalCheckId, { action: string; drill: ProcessDrillId }> = {
  configuration: {
    action:
      'Снимите параметры адаптера и сопоставьте их с условиями заявки. Запишите обнаруженное расхождение как факт.',
    drill: 'evidence',
  },
  authority: {
    action:
      'Получите прямой ответ указанного в заявке DNS-сервера. Сравните его с клиентским разрешением; прямой запрос сам по себе не меняет настройки клиента.',
    drill: 'evidence',
  },
  cache: {
    action:
      'Посмотрите клиентский кэш и сравните запись с прямым ответом сервера. Отметьте источник каждого наблюдения.',
    drill: 'evidence',
  },
  subsystem: {
    action:
      'Соберите данные подсистемы, связанной с симптомом: конфигурацию, маршрут, журнал, права или сертификат. Обоснуйте выбор проверки, прежде чем менять среду.',
    drill: 'evidence',
  },
  baseline: {
    action:
      'Воспроизведите отказ целевого подключения и сохраните наблюдение. Для сравнения до и после лучше начать новую попытку и выполнить эту проверку перед изменениями.',
    drill: 'baseline',
  },
  icmp: {
    action:
      'Проверьте ICMP отдельно от целевого TCP-порта. Запишите результаты раздельно, чтобы не переносить вывод одного протокола на другой.',
    drill: 'diagnosis',
  },
  verification: {
    action:
      'После последнего изменения повторите целевой сценарий по нужному имени и протоколу. Если он всё ещё неуспешен, вернитесь к наблюдениям и гипотезе.',
    drill: 'verification',
  },
  preserve: {
    action:
      'В этой лаборатории изменение конфигурации не требуется. Начните новую попытку, сравните ICMP и TCP и сохраните исходные настройки.',
    drill: 'minimal-change',
  },
  diagnosis: {
    action:
      'Сопоставьте выбранный вывод с результатами команд. Для каждой гипотезы укажите подтверждение, противоречие и то, чего полученные проверки не устанавливают.',
    drill: 'diagnosis',
  },
}

function skillFor(state: LabState) {
  return state.network?.definition.skill ?? (state.labId === 'TERM-ICMP-TCP' ? 'transport' : 'dns')
}
function causeFor(id: string) {
  if (id === 'TERM-DNS-SERVER') return 'dns'
  if (id === 'TERM-DNS-CACHE') return 'client-cache'
  const lab = terminalLabs.find((value) => value.id === id)
  return lab && 'fault' in lab ? lab.fault : id
}

export function terminalLearningDebrief(
  assessment: TerminalAssessment,
  state: LabState,
  mode: TerminalMode,
  hints: number,
) {
  const skill = skillFor(state)
  const course = workshopCourses.find((value) => value.skill === skill)
  const gaps = assessment.checks
    .filter((check) => !check.met)
    .map((check) => ({
      ...check,
      ...guidance[check.id],
      restartRecommended:
        check.id === 'preserve' || (check.id === 'baseline' && state.revision > 0),
    }))
  const audit = state.network?.changeAudit
  const needsIndependentPractice = mode === 'guided' || hints > 0 || assessment.score < 85
  const currentCause = state.network?.definition.fault ?? causeFor(state.labId)
  const otherLab = terminalLabs.find(
    (lab) =>
      lab.id !== state.labId &&
      (('skill' in lab && lab.skill === skill) ||
        (skill === 'dns' && lab.id.startsWith('TERM-DNS-'))) &&
      causeFor(lab.id) !== currentCause,
  )
  const nextSkill = skills.find((value) => value.requires.some((id) => id === skill))
  const nextCourse = workshopCourses.find((value) => value.skill === nextSkill?.id)
  return {
    gaps,
    drill:
      processDrills[
        gaps[0]?.drill ??
          (audit && (audit.regressions || audit.unnecessary) ? 'minimal-change' : 'diagnosis')
      ],
    course: course
      ? { title: course.title, url: `/learning?view=workshop&lesson=${course.id}` }
      : undefined,
    processCost: audit
      ? {
          regressions: audit.regressions,
          unnecessary: audit.unnecessary,
          rollbacks: audit.rollbacks,
        }
      : undefined,
    next: !assessment.complete
      ? undefined
      : needsIndependentPractice
        ? {
            type: 'retry' as const,
            title: 'Повторить эту лабораторию без подсказок',
            reason:
              'Закрепите ход решения без подсказок и лишних изменений. Повтор той же причины помогает тренироваться, но не добавляет новое семейство причин.',
          }
        : otherLab
          ? {
              type: 'link' as const,
              title: otherLab.title,
              reason:
                'Следующая лаборатория по этому навыку использует другую причину. Сначала соберите новые доказательства.',
              url: `/terminal?lab=${otherLab.id}&mode=practice`,
            }
          : nextCourse
            ? {
                type: 'link' as const,
                title: nextCourse.title,
                reason: 'Перейдите к следующей связанной теме и изучите её проверки и ограничения.',
                url: `/learning?view=workshop&lesson=${nextCourse.id}`,
              }
            : {
                type: 'link' as const,
                title: 'Расследование с неизвестной причиной',
                reason: 'Потренируйте выбор гипотез и доказательств в профессиональном инциденте.',
                url: '/learning?view=workshop&workshop=professional&incident=unknown',
              },
  }
}
