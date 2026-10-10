import type { LearningProgress } from './progress'
export function learningSummary(progress: LearningProgress, now: number) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const week = progress.journal.filter(
    (e) =>
      Date.parse(e.at) >= start.getTime() &&
      Date.parse(e.at) < end.getTime() &&
      Date.parse(e.at) <= now,
  )
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    const count = week.filter(
      (e) => Date.parse(e.at) >= date.getTime() && Date.parse(e.at) < next.getTime(),
    ).length
    return { date: date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }), count }
  })
  return {
    week,
    days,
    goal: progress.weeklyGoal,
    completed: week.length,
    success: week.length
      ? Math.round((week.filter((e) => e.score >= 70).length / week.length) * 100)
      : 0,
    start: start.toLocaleDateString('ru-RU'),
  }
}
