import { z } from 'zod'

export const explanationCriteria = [
  {
    id: 'scope',
    title: 'Симптом и масштаб',
    question: 'Понятно, кто затронут, какое действие не работает и где проходит граница проблемы?',
    example: 'Один клиент или все? По имени или по IP? Какое действие пользователя не проходит?',
  },
  {
    id: 'hypothesis',
    title: 'Обоснование гипотезы',
    question: 'Факты отделены от предположений, есть проверка гипотезы и рассмотрена альтернатива?',
    example:
      'Укажите команду и наблюдение, объясните, какую другую причину они исключают и какую ещё нет.',
  },
  {
    id: 'minimalChange',
    title: 'Минимальность изменения',
    question: 'Изменение следует из доказательств и ограничено нужным узлом или параметром?',
    example:
      'Запишите, что изменили и почему. Если изменение не нужно, обоснуйте сохранение конфигурации.',
  },
  {
    id: 'verification',
    title: 'Актуальность проверки',
    question:
      'После последнего изменения повторён целевой сценарий, а вывод соответствует уровню проверки?',
    example:
      'Приведите результат после изменения. TCP-подключение, HTTP-ответ и вход пользователя доказывают разные вещи.',
  },
  {
    id: 'limits',
    title: 'Ограничения, откат и эскалация',
    question:
      'Названы непроверенные условия, следующий шаг и повод для отката или передачи задачи?',
    example:
      'Что ещё неизвестно? При каком результате вернётесь к прежней настройке или передадите задачу специалисту?',
  },
] as const
export type ExplanationCriterion = (typeof explanationCriteria)[number]['id']
const criterionSchema = z
  .object({
    verdict: z.enum(['not-reviewed', 'needs-work', 'supported']),
    note: z.string().max(600),
  })
  .strict()
export const explanationReviewSchema = z
  .object({
    rubricVersion: z.literal(1),
    source: z.enum(['self', 'mentor']),
    at: z.iso.datetime(),
    contentKey: z.string().regex(/^[0-9a-f]{16}$/),
    criteria: z
      .object({
        scope: criterionSchema,
        hypothesis: criterionSchema,
        minimalChange: criterionSchema,
        verification: criterionSchema,
        limits: criterionSchema,
      })
      .strict(),
    comment: z.string().max(1200),
  })
  .strict()
export type ExplanationReview = z.infer<typeof explanationReviewSchema>
export interface ExplanationReport {
  symptom: string
  hypothesis: string
  evidence: string
  change: string
  verification: string
  limits: string
  evidenceRefs: Array<{
    commandId: number
    recordId?: string
    revision: number
    command: string
    summary: string
  }>
}
export function explanationContentKey(report: ExplanationReport) {
  const content = JSON.stringify([
    report.symptom,
    report.hypothesis,
    report.evidence,
    report.change,
    report.verification,
    report.limits,
    report.evidenceRefs.map((reference) => [
      reference.recordId ?? null,
      reference.commandId,
      reference.revision,
      reference.command,
      reference.summary,
    ]),
  ])
  // A local change detector, not a signature or proof of authorship.
  let left = 2166136261,
    right = 5381
  for (let i = 0; i < content.length; i++) {
    left = Math.imul(left ^ content.charCodeAt(i), 16777619)
    right = Math.imul(right, 33) ^ content.charCodeAt(i)
  }
  return [left, right].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('')
}
export function createExplanationReview(
  contentKey: string,
  source: ExplanationReview['source'] = 'self',
): ExplanationReview {
  const empty = () => ({ verdict: 'not-reviewed' as const, note: '' })
  return {
    rubricVersion: 1,
    source,
    at: new Date().toISOString(),
    contentKey,
    criteria: {
      scope: empty(),
      hypothesis: empty(),
      minimalChange: empty(),
      verification: empty(),
      limits: empty(),
    },
    comment: '',
  }
}
export function explanationReviewMarkdown(review: ExplanationReview | null, contentKey: string) {
  if (!review) return 'Ручной разбор ещё не выполнен.'
  const labels = {
    'not-reviewed': 'Не разобрано',
    'needs-work': 'Нужно доработать',
    supported: 'Обосновано по мнению проверяющего',
  }
  return [
    `Источник: ${review.source === 'self' ? 'самооценка' : 'локальная отметка наставника'} · ${review.at}`,
    'Ручные отметки по рубрике. Они не меняют баллы модели и не подтверждают квалификацию или авторство наставника.',
    review.contentKey === contentKey
      ? 'Разбор относится к текущему тексту и ссылкам отчёта.'
      : 'Отчёт изменён после разбора. Отметки требуют повторного просмотра.',
    ...explanationCriteria.map(
      (criterion) =>
        `### ${criterion.title}\n${labels[review.criteria[criterion.id].verdict]}\n${review.criteria[criterion.id].note}`,
    ),
    `### Комментарий\n${review.comment || 'Не добавлен.'}`,
  ].join('\n\n')
}
