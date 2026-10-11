import type { AcademyCourse } from './catalog'

export interface LabAttempt {
  courseId: string
  answers: Record<string, number>
  hints: string[]
}
export const createLabAttempt = (course: AcademyCourse): LabAttempt => ({
  courseId: course.id,
  answers: {},
  hints: [],
})
function questionFor(course: AcademyCourse, attempt: LabAttempt, id: string) {
  const question = course.lab.questions.find((item) => item.id === id)
  if (course.id !== attempt.courseId || !question)
    throw new Error('Задание не относится к этой лабораторной.')
  return question
}
export function answerLab(
  course: AcademyCourse,
  attempt: LabAttempt,
  id: string,
  index: number,
): LabAttempt {
  const question = questionFor(course, attempt, id)
  if (!Number.isInteger(index) || index < 0 || index >= question.choices.length)
    throw new Error('Выберите существующий вариант ответа.')
  if (Object.hasOwn(attempt.answers, id)) return attempt
  return { ...attempt, answers: { ...attempt.answers, [id]: index } }
}
export function revealLabHint(course: AcademyCourse, attempt: LabAttempt, id: string): LabAttempt {
  questionFor(course, attempt, id)
  return attempt.hints.includes(id) ? attempt : { ...attempt, hints: [...attempt.hints, id] }
}
export function summarizeLab(course: AcademyCourse, attempt: LabAttempt) {
  if (course.id !== attempt.courseId) throw new Error('Не совпадает лабораторная.')
  const correct = course.lab.questions.filter((q) => attempt.answers[q.id] === q.correct).length
  const answered = course.lab.questions.filter((q) => Object.hasOwn(attempt.answers, q.id)).length
  return {
    correct,
    answered,
    total: course.lab.questions.length,
    complete: answered === course.lab.questions.length,
    score: Math.round((correct / course.lab.questions.length) * 100),
    hints: attempt.hints.length,
  }
}
export function exportLab(course: AcademyCourse, attempt: LabAttempt): string {
  const result = summarizeLab(course, attempt)
  return [
    `# Учебная лабораторная: ${course.title}`,
    '',
    'Данные синтетические. Это разбор учебной ситуации, не диагностика устройства.',
    '',
    `Результат: ${result.correct}/${result.total}; ответов ${result.answered}; подсказок ${result.hints}.`,
    '',
    '## Условие',
    course.lab.briefing,
    '',
    '## Свидетельства',
    '```text',
    course.lab.evidence,
    '```',
    '',
    '## Разбор решений',
    ...course.lab.questions.flatMap((q, index) => [
      `### ${index + 1}. ${q.prompt}`,
      `Ответ: ${q.choices[attempt.answers[q.id] ?? -1] ?? 'Не выбран'}`,
      `Верный вариант: ${q.choices[q.correct]}`,
      q.explanation,
      `Подсказка использована: ${attempt.hints.includes(q.id) ? 'да' : 'нет'}.`,
      '',
    ]),
    '## Следующие проверки',
    ...course.checklist.map((step) => `- ${step}`),
    '',
    '## Источники',
    ...course.sources.map((s) => `- [${s.title}](${s.url})`),
    '',
    `Редакционная отметка каталога: ${course.reviewedAt}. Выполнение на реальной ОС не подтверждено. Баллы описывают эту попытку, а не профессиональную квалификацию.`,
  ].join('\n')
}
