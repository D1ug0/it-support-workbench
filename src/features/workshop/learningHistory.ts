import { allLearningQuestions } from '../learning/catalog'
import { academyCourses } from '../academy/catalog'
import { practiceTasks } from '../practice/catalog'
import { scenarios } from '../simulator/scenarios'
import { terminalLabs } from '../terminal/catalog'
import { workshopCourses } from './courses'
import { incidentPresets } from './incidentPresets'
import { learningPackages, packageChecks } from './packages'
import { professionalCases } from './professional'
import { standTasks } from './stand'
import { skills, type LearningEvent } from './skills'

type TitledTask = { id: string; title: string }
export type HistoryMaterials = {
  labs?: readonly TitledTask[]
  graphs?: readonly TitledTask[]
  courses?: readonly TitledTask[]
}
const moduleLabels: Record<LearningEvent['module'], string> = {
  question: 'Базовый вопрос',
  academy: 'Продвинутый курс',
  practice: 'Самостоятельная практика',
  simulator: 'Учебный инцидент',
  graph: 'Расследование с развилками',
  terminal: 'Терминальная лаборатория',
  stand: 'Настоящий стенд',
  professional: 'Профессиональный инцидент',
  course: 'Практикум развития',
}
const outcomeLabels: Record<LearningEvent['outcome'], string> = {
  completed: 'Выполнено',
  failed: 'Нужна повторная попытка',
  'self-reported': 'Самостоятельный отчёт',
  'limit-reached': 'Достигнут предел шагов',
  abandoned: 'Попытка прервана',
}
const packageTitles = new Map<string, string>(
  learningPackages.flatMap((packet) =>
    packageChecks(packet.id).flatMap(
      (check) =>
        [
          [`PACK-${packet.id}-v2-${check.id}`, check.prompt],
          [`PACK-${packet.id}-${check.id}`, `${packet.title} — задание прежней версии`],
        ] as const,
    ),
  ),
)
function taskTitle(event: LearningEvent, materials: HistoryMaterials) {
  const id = event.taskId
  switch (event.module) {
    case 'question':
      return allLearningQuestions.find((q) => q.id === id)?.prompt
    case 'academy':
      return (
        allLearningQuestions.find((q) => q.id === id)?.prompt ??
        academyCourses.find((c) => `LAB-${c.id}` === id)?.title
      )
    case 'practice':
      return practiceTasks.find((t) => `PRACTICE-${t.id}` === id)?.title
    case 'simulator':
      return (
        scenarios.find((s) => s.id === id)?.title ??
        (id.startsWith('USR-') ? 'Собственный учебный инцидент' : undefined)
      )
    case 'terminal':
      return (
        materials.labs?.find((l) => l.id === id)?.title ??
        terminalLabs.find((l) => l.id === id)?.title ??
        (id.startsWith('USR-') ? 'Авторская терминальная лаборатория' : undefined)
      )
    case 'graph':
      return (
        materials.graphs?.find((g) => g.id === id)?.title ??
        incidentPresets.find((p) => p.graph.id === id)?.graph.title ??
        (id.startsWith('GRAPH-') ? 'Авторское расследование' : undefined)
      )
    case 'course':
      return (
        materials.courses?.find((c) => c.id === id)?.title ??
        workshopCourses.find((c) => c.id === id)?.title ??
        packageTitles.get(id) ??
        (id.startsWith('COURSE-') ? 'Авторский курс' : undefined)
      )
    case 'professional':
      return professionalCases.find((c) => c.id === id)?.title
    case 'stand':
      return standTasks.find((t) => t.id === id)?.title
  }
}
export function describeLearningEvent(event: LearningEvent, materials: HistoryMaterials = {}) {
  return {
    title: taskTitle(event, materials) ?? 'Задание из прежнего или недоступного материала',
    module: moduleLabels[event.module],
    outcome: outcomeLabels[event.outcome],
    skill: skills.find((s) => s.id === event.skill)?.title,
  }
}
export function recentLearningEvents(events: readonly LearningEvent[]) {
  return [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 30)
}
