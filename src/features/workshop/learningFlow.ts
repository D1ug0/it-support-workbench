import { workshopCourses } from './courses'
import { recommendSkill, skillStatus, type WorkshopProgress } from './skills'
import { extendedLabs } from '../terminal/labDefinitions'
export function todayTask(progress: WorkshopProgress) {
  const recommendation = recommendSkill(progress),
    skill = recommendation.skill
  const course = workshopCourses.find((c) => c.skill === skill.id)!
  const status = skillStatus(progress, skill.id)
  const failed = [...progress.events]
    .reverse()
    .find((e) => e.skill === skill.id && e.outcome === 'failed')
  const read = progress.read.includes(`LESSON-${course.id}`)
  const lab =
    extendedLabs.find(
      (l) => l.skill === skill.id && !progress.attempts.some((a) => a.id === l.id && a.complete),
    ) ?? extendedLabs.find((l) => l.skill === skill.id)
  const theory = !progress.theoryChecks.some((c) => c.skill === skill.id && c.correct)
  return {
    title: recommendation.skill.title,
    reason: failed?.errors.join('; ') || recommendation.reason,
    prerequisite: skill.requires.length ? skill.requires.join(', ') : 'Не требуется',
    minutes: !read || theory ? '10–15' : '20–40',
    outcome: !read
      ? 'Объяснить основные проверки и границы модели'
      : theory
        ? 'Проверить теорию разными формами'
        : 'Подтвердить исправление свежими доказательствами и оформить отчёт',
    url: !read
      ? `/learning?view=workshop&lesson=${course.id}`
      : theory
        ? '/learning?view=workshop&workshop=packages'
        : lab
          ? `/terminal?lab=${lab.id}`
          : '/learning?view=workshop&workshop=stand',
    repeat: status.needsReview,
    resume: progress.currentLesson
      ? `/learning?view=workshop&lesson=${progress.currentLesson}`
      : undefined,
  }
}
