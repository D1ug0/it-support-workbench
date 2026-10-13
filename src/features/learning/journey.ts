import { workshopCourses, type WorkshopCourse } from '../workshop/index'
import { trackSkills, type WorkshopProgress, type SkillId } from '../workshop/index'
import { isIndependentAttempt } from '../workshop/index'
import { causeForLab } from '../terminal/labIdentity'

export const foundationSkills: readonly SkillId[] = [
  'addressing',
  'dns',
  'routing',
  'transport',
  'tls',
]

export function journeyCourses(progress: WorkshopProgress): WorkshopCourse[] {
  const selected = progress.track === 'L1' ? foundationSkills : trackSkills[progress.track]
  return selected.flatMap((skill) => {
    const course = workshopCourses.find((value) => value.skill === skill)
    return course ? [course] : []
  })
}

export function lessonJourney(course: WorkshopCourse, progress: WorkshopProgress, now: number) {
  const attempts = progress.attempts.filter(
    (attempt) => attempt.skill === course.skill && Date.parse(attempt.at) <= now,
  )
  const independent = attempts.filter(isIndependentAttempt)
  return {
    read: progress.read.includes(`LESSON-${course.id}`),
    understood: progress.theoryChecks.some(
      (check) => check.taskId === course.id && check.correct && Date.parse(check.at) <= now,
    ),
    guided: attempts.some((attempt) => attempt.complete),
    independent: independent.length > 0,
    causes: new Set(
      independent.flatMap((attempt) =>
        attempt.causeFamily ? [causeForLab(attempt.id, attempt.causeFamily)] : [],
      ),
    ).size,
    reports: progress.events.filter(
      (event) =>
        event.skill === course.skill && event.module === 'stand' && Date.parse(event.at) <= now,
    ).length,
  }
}
