import {
  learningErrorIds,
  taskErrorIds,
  remediationReviewDelay,
  type LearningErrorId,
} from './learningErrors'
import { remediationChecks, remediationLesson, remediationPassed } from './remediationCatalog'
import { remediationAttemptSchema } from './remediationSchema'
import type { WorkshopProgress, LearningEvent } from './skills'

export { remediationReviewDelay } from './learningErrors'
export function eventErrorIds(event: LearningEvent) {
  return event.outcome === 'failed'
    ? (event.errorIds ?? taskErrorIds(event.module, event.taskId))
    : []
}
export function remediationRecommendations(progress: WorkshopProgress, now = Date.now()) {
  const events = [...progress.events]
    .reverse()
    .filter((e) => Date.parse(e.at) <= now)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return learningErrorIds.flatMap((errorId) => {
    const source = events.find((e) => eventErrorIds(e).includes(errorId))
    if (!source) return []
    const latest = [...progress.remediationAttempts]
      .filter(
        (a) =>
          a.errorId === errorId &&
          a.sourceAttemptId === source.attemptId &&
          Date.parse(a.startedAt) <= now &&
          (!a.completedAt || Date.parse(a.completedAt) <= now),
      )
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
      .at(-1)
    const dueAt =
      latest?.completedAt && latest.phase === 'practice' && remediationPassed(latest)
        ? Date.parse(latest.completedAt) + remediationReviewDelay
        : undefined
    const state =
      !latest?.completedAt && latest
        ? 'active'
        : dueAt !== undefined
          ? now >= dueAt
            ? 'review'
            : 'waiting'
          : latest?.phase === 'review' && remediationPassed(latest)
            ? 'verified'
            : 'practice'
    return [{ lesson: remediationLesson(errorId), source, latest, dueAt, state }]
  })
}
export function nextRemediation(progress: WorkshopProgress, now = Date.now()) {
  const recommendations = remediationRecommendations(progress, now)
  return (
    recommendations.find((r) => r.state === 'active') ??
    recommendations.find((r) => r.state === 'review') ??
    recommendations.find((r) => r.state === 'practice')
  )
}
export function beginRemediation(
  progress: WorkshopProgress,
  errorId: LearningErrorId,
  now = Date.now(),
) {
  const recommendation = remediationRecommendations(progress, now).find(
    (r) => r.lesson.id === errorId,
  )
  if (!recommendation || recommendation.state === 'waiting' || recommendation.state === 'verified')
    throw new Error('Для этой ошибки сейчас нет доступного занятия.')
  if (recommendation.state === 'active') return { progress, attempt: recommendation.latest! }
  if (progress.remediationAttempts.length >= 100)
    throw new Error(
      'Лимит: 100 коротких занятий. Экспортируйте прогресс перед его удалением в разделе обмена.',
    )
  const phase = recommendation.state === 'review' ? 'review' : 'practice'
  const variant =
    progress.remediationAttempts.filter((a) => a.errorId === errorId && a.phase === phase).length %
    2
  const attempt = remediationAttemptSchema.parse({
    id: crypto.randomUUID(),
    errorId,
    sourceAttemptId: recommendation.source.attemptId,
    phase,
    contentVersion: 1,
    variant,
    startedAt: new Date(now).toISOString(),
    answers: [],
  })
  return {
    progress: { ...progress, remediationAttempts: [...progress.remediationAttempts, attempt] },
    attempt,
  }
}
export function answerRemediation(
  progress: WorkshopProgress,
  id: string,
  step: number,
  choice: number,
  now = Date.now(),
) {
  const attempt = progress.remediationAttempts.find((a) => a.id === id)
  if (!attempt || attempt.completedAt || attempt.answers.length !== step)
    throw new Error('Этот первый ответ уже зафиксирован или попытка недоступна.')
  const at = new Date(now).toISOString()
  const answers = [...attempt.answers, { choice, at }]
  const updated = remediationAttemptSchema.parse({
    ...attempt,
    answers,
    completedAt: answers.length === 2 ? at : undefined,
  })
  const event: LearningEvent | undefined = updated.completedAt
    ? {
        attemptId: updated.id,
        module: 'course',
        taskId: `FIX-v1-${updated.errorId}-${updated.phase}`,
        skill: 'dns',
        at,
        score:
          updated.answers.filter((a, i) => a.choice === remediationChecks(updated)[i]!.correct)
            .length * 50,
        outcome: remediationPassed(updated) ? 'completed' : 'failed',
        errors: remediationPassed(updated)
          ? []
          : ['Повторите разбор и решите другую ситуацию; первый ответ остаётся в истории.'],
        errorIds: [],
      }
    : undefined
  return {
    attempt: updated,
    progress: {
      ...progress,
      remediationAttempts: progress.remediationAttempts.map((a) => (a.id === id ? updated : a)),
      events: event ? [...progress.events, event].slice(-500) : progress.events,
    },
  }
}
