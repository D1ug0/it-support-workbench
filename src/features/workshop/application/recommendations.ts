import { workshopCourses } from '../domain/courses'
import { recommendSkill, buildSkillStatuses, skills, type WorkshopProgress } from '../domain/skills'
import { terminalLabs } from '../../terminal/catalog'
import { causeForLab, skillForLab } from '../../terminal/labIdentity'
import { packageForSkill, packageFinals } from '../domain/packages'
import { standTasks } from '../domain/stand'
import { nextRemediation, remediationRecommendations, eventErrorIds } from '../domain/remediation'
import { describeLearningEvent } from './learningHistory'
import { isIndependentAttempt } from '../domain/learningPolicy'
const labCause = (lab: (typeof terminalLabs)[number]) =>
  causeForLab(lab.id, 'fault' in lab ? lab.fault : undefined)
export function recommendNextTask(
  progress: WorkshopProgress,
  now = Date.now(),
  statuses = buildSkillStatuses(progress, now),
) {
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
      resume: progress.currentLesson ? `/learning?lesson=${progress.currentLesson}` : undefined,
    }
  const closedSources = remediationRecommendations(progress, now)
    .filter((r) => r.state === 'waiting' || r.state === 'verified')
    .map((r) => r.source.attemptId)
  const recommendation = recommendSkill(progress, now, statuses),
    skill = recommendation.skill
  const course = workshopCourses.find((c) => c.skill === skill.id)!
  const status = statuses[skill.id]
  const failed = [...progress.events]
    .reverse()
    .find(
      (e) =>
        e.skill === skill.id &&
        e.outcome === 'failed' &&
        Date.parse(e.at) <= now &&
        !(eventErrorIds(e).length && closedSources.includes(e.attemptId)) &&
        (!status.last || Date.parse(e.at) >= Date.parse(status.last.at)),
    )
  const read = progress.read.includes(`LESSON-${course.id}`)
  const choices = terminalLabs.filter(
    (lab) => skillForLab(lab.id, 'skill' in lab ? lab.skill : undefined) === skill.id,
  )
  const independent = progress.attempts.filter(
    (a) => a.skill === skill.id && isIndependentAttempt(a) && Date.parse(a.at) <= now,
  )
  const knownCauses = new Set(
    independent.flatMap((a) => (a.causeFamily ? [causeForLab(a.id, a.causeFamily)] : [])),
  )
  const lab =
    (status.needsReview && status.readyToAdvance
      ? choices.find(
          (l) => !status.reviewedCauses.map((c) => causeForLab('', c)).includes(labCause(l)),
        )
      : undefined) ??
    choices.find((l) => !knownCauses.has(labCause(l))) ??
    choices[0]
  const retry =
    status.last && !isIndependentAttempt(status.last) && status.last.complete
      ? choices.find((value) => value.id === status.last!.id)
      : undefined
  const practiceLab = retry ?? lab
  const questionPassed = progress.theoryChecks.some(
    (check) => check.taskId === course.id && check.correct && Date.parse(check.at) <= now,
  )
  const material = !read || !questionPassed
  const theory =
    status.theoryForms < 2 &&
    (knownCauses.size >= 2 ||
      (independent.length > 0 && choices.every((l) => knownCauses.has(labCause(l)))) ||
      !choices.length)
  const mode = status.attempts === 0 ? 'guided' : 'practice'
  const packet = packageForSkill(skill.id)
  const stand = standTasks.find((t) => t.skill === skill.id)
  const standUrl = `/learning?view=workshop&workshop=stand&task=${stand?.id ?? (progress.track === 'linux' || progress.track === 'L2' ? 'linux' : 'routes')}`
  return {
    title: recommendation.skill.title,
    reason:
      failed?.errors.join('; ') ||
      (recommendation.stand
        ? recommendation.reason
        : material
          ? `Начните с материала «${course.title}» и проверки понимания.`
          : theory
            ? 'Самостоятельная практика уже есть. Проверьте принцип в другой форме задания.'
            : retry
              ? 'Решение с помощью записано. Теперь повторите эту ситуацию без подсказок.'
              : status.needsReview
                ? recommendation.reason
                : independent.length > 0
                  ? 'Есть самостоятельное решение. Следующая лаборатория проверяет другую причину.'
                  : mode === 'guided'
                    ? 'Материал разобран. Первая лаборатория поможет понять последовательность проверок.'
                    : recommendation.reason),
    prerequisite: skill.requires.length
      ? skill.requires.map((id) => skills.find((s) => s.id === id)!.title).join(', ')
      : 'Не требуется',
    minutes: material || theory ? '10–15' : '20–40',
    outcome: recommendation.stand
      ? 'Проверить знания в собственном окружении и оформить самостоятельный отчёт'
      : material
        ? 'Объяснить основные проверки и границы модели'
        : theory
          ? 'Проверить теорию разными формами'
          : status.needsReview && !status.retention && status.readyToAdvance
            ? 'После перерыва решить две разные причины в течение суток; варианты только с другими адресами не засчитываются'
            : mode === 'guided'
              ? 'Пройти первую лабораторию с подсказками и понять смысл проверок'
              : 'Самостоятельно подтвердить исправление свежими доказательствами и оформить отчёт',
    url: recommendation.stand
      ? standUrl
      : material
        ? `/learning?lesson=${course.id}`
        : theory
          ? `/learning?view=workshop&workshop=packages&package=${packet.id}&skill=${skill.id}`
          : practiceLab
            ? `/terminal?lab=${practiceLab.id}&mode=${mode}`
            : stand
              ? standUrl
              : skill.id === 'services'
                ? '/learning?view=workshop&workshop=professional&incident=api&variant=2&new=1'
                : packageFinals[packet.id]!.url,
    skill: skill.id,
    lessonId: course.id,
    repeat: status.needsReview,
    resume: progress.currentLesson ? `/learning?lesson=${progress.currentLesson}` : undefined,
  }
}
