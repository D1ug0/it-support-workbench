import { workshopCourses } from './courses'
import { recommendSkill, skillStatus, skills, type WorkshopProgress } from './skills'
import { extendedLabs } from '../terminal/labDefinitions'
import { packageForSkill, packageFinals } from './packages'
import { standTasks } from './stand'
import { nextRemediation, remediationRecommendations, eventErrorIds } from './remediation'
import { describeLearningEvent } from './learningHistory'
export function todayTask(progress: WorkshopProgress, now = Date.now()) {
  const errorPractice = nextRemediation(progress, now)
  if (errorPractice)
    return {
      title: errorPractice.lesson.title,
      reason: `Назначено после ошибки в задании «${describeLearningEvent(errorPractice.source).title}». ${errorPractice.state === 'review' ? 'Подошёл срок проверки после перерыва.' : 'Проверим это затруднение на другой ситуации.'}`,
      prerequisite: 'Основы DNS; краткий разбор включён в занятие',
      minutes: '5–10',
      outcome: 'Различить наблюдение и вывод, выбрать проверку конкретной гипотезы',
      url: `/learning?view=workshop&workshop=error-practice&error=${errorPractice.lesson.id}`,
      repeat: true,
      resume: progress.currentLesson
        ? `/learning?view=workshop&lesson=${progress.currentLesson}`
        : undefined,
    }
  const closedSources = remediationRecommendations(progress, now)
    .filter((r) => r.state === 'waiting' || r.state === 'verified')
    .map((r) => r.source.attemptId)
  const recommendation = recommendSkill(progress, now),
    skill = recommendation.skill
  const course = workshopCourses.find((c) => c.skill === skill.id)!
  const status = skillStatus(progress, skill.id, now)
  const failed = [...progress.events]
    .reverse()
    .find(
      (e) =>
        e.skill === skill.id &&
        e.outcome === 'failed' &&
        !(eventErrorIds(e).length && closedSources.includes(e.attemptId)) &&
        (!status.last || Date.parse(e.at) >= Date.parse(status.last.at)),
    )
  const read = progress.read.includes(`LESSON-${course.id}`)
  const lab =
    (status.needsReview && status.readyToAdvance
      ? extendedLabs.find((l) => l.skill === skill.id && !status.reviewedCauses.includes(l.fault))
      : undefined) ??
    extendedLabs.find(
      (l) =>
        l.skill === skill.id &&
        !progress.attempts.some(
          (a) =>
            a.id === l.id && a.complete && a.score >= 85 && a.hints === 0 && a.mode !== 'guided',
        ),
    ) ??
    extendedLabs.find((l) => l.skill === skill.id)
  const theory = status.theoryForms < 2
  const packet = packageForSkill(skill.id)
  const stand = standTasks.find((t) => t.skill === skill.id)
  const standUrl = `/learning?view=workshop&workshop=stand&task=${stand?.id ?? (progress.track === 'linux' || progress.track === 'L2' ? 'linux' : 'routes')}`
  return {
    title: recommendation.skill.title,
    reason: failed?.errors.join('; ') || recommendation.reason,
    prerequisite: skill.requires.length
      ? skill.requires.map((id) => skills.find((s) => s.id === id)!.title).join(', ')
      : 'Не требуется',
    minutes: !read || theory ? '10–15' : '20–40',
    outcome: recommendation.stand
      ? 'Проверить знания в собственном окружении и оформить самостоятельный отчёт'
      : !read
        ? 'Объяснить основные проверки и границы модели'
        : theory
          ? 'Проверить теорию разными формами'
          : status.needsReview && !status.retention && status.readyToAdvance
            ? 'После перерыва решить две разные причины в течение суток; варианты только с другими адресами не засчитываются'
            : 'Подтвердить исправление свежими доказательствами и оформить отчёт',
    url: recommendation.stand
      ? standUrl
      : !read
        ? `/learning?view=workshop&lesson=${course.id}`
        : theory
          ? `/learning?view=workshop&workshop=packages&package=${packet.id}&skill=${skill.id}`
          : lab
            ? `/terminal?lab=${lab.id}`
            : stand
              ? standUrl
              : skill.id === 'services'
                ? '/learning?view=workshop&workshop=professional&incident=api&variant=2&new=1'
                : packageFinals[packet.id]!.url,
    repeat: status.needsReview,
    resume: progress.currentLesson
      ? `/learning?view=workshop&lesson=${progress.currentLesson}`
      : undefined,
  }
}
