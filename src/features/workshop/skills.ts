import { z } from 'zod'
import { learningErrorIds } from './learningErrors'
import { remediationAttemptsSchema } from './remediationSchema'
export const skillIds = [
  'addressing',
  'routing',
  'dns',
  'transport',
  'tls',
  'windows',
  'identity',
  'linux',
  'ipv6',
  'wifi',
  'git',
  'services',
  'recovery',
  'security',
] as const
export type SkillId = (typeof skillIds)[number]
export const skills = [
  { id: 'addressing', title: 'Адресация и DHCP', requires: [] },
  { id: 'routing', title: 'Маршруты и VPN', requires: ['addressing'] },
  { id: 'dns', title: 'DNS и кэш', requires: ['addressing'] },
  { id: 'transport', title: 'ICMP, TCP и HTTP', requires: ['routing', 'dns'] },
  { id: 'tls', title: 'TLS и доверие', requires: ['transport'] },
  { id: 'windows', title: 'Службы и события Windows', requires: ['transport'] },
  { id: 'identity', title: 'Учётные записи, SMB и GPO', requires: ['dns', 'windows'] },
  { id: 'linux', title: 'Linux: службы и права', requires: ['transport'] },
  { id: 'ipv6', title: 'IPv6 и dual stack', requires: ['addressing', 'routing'] },
  { id: 'wifi', title: 'Wi-Fi: подключение и сеть', requires: ['addressing'] },
  { id: 'git', title: 'Git и CI/CD', requires: [] },
  { id: 'services', title: 'Контейнеры и зависимости', requires: ['linux', 'transport'] },
  { id: 'recovery', title: 'Резервирование и восстановление', requires: ['services'] },
  { id: 'security', title: 'Доступ и безопасная эскалация', requires: ['identity'] },
] satisfies Array<{ id: SkillId; title: string; requires: SkillId[] }>
export const attemptSchema = z
  .object({
    id: z.string().regex(/^(TERM-[A-Z0-9-]+|USR-[a-f0-9-]{36})$/),
    skill: z.enum(skillIds),
    mode: z.enum(['guided', 'practice', 'exam']),
    score: z.number().int().min(0).max(100),
    hints: z.number().int().min(0).max(3),
    complete: z.boolean(),
    at: z.iso.datetime(),
    attemptId: z.uuid().optional(),
    causeFamily: z.string().max(80).optional(),
    competencies: z.array(z.string().max(80)).max(10).optional(),
    errors: z.array(z.string().max(180)).max(10).optional(),
    variantKey: z.string().max(200).optional(),
    seed: z.number().int().min(0).max(999999),
  })
  .strict()
export const learningEventSchema = z
  .object({
    attemptId: z.uuid(),
    module: z.enum([
      'question',
      'academy',
      'practice',
      'simulator',
      'graph',
      'terminal',
      'stand',
      'professional',
      'course',
    ]),
    taskId: z.string().min(1).max(80),
    skill: z.enum(skillIds).optional(),
    at: z.iso.datetime(),
    score: z.number().int().min(0).max(100).nullable(),
    outcome: z.enum(['completed', 'failed', 'self-reported', 'limit-reached', 'abandoned']),
    errors: z.array(z.string().max(180)).max(10).default([]),
    errorIds: z.array(z.enum(learningErrorIds)).max(3).optional(),
  })
  .strict()
export type LearningEvent = z.infer<typeof learningEventSchema>
export const theoryCheckSchema = z
  .object({
    taskId: z.string().max(80),
    skill: z.enum(skillIds),
    form: z.enum(['choice', 'calculation', 'contradiction']),
    correct: z.boolean(),
    at: z.iso.datetime(),
  })
  .strict()
export const workshopProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    events: z.array(learningEventSchema).max(500).default([]),
    theoryChecks: z.array(theoryCheckSchema).max(300).default([]),
    remediationAttempts: remediationAttemptsSchema.default([]),
    attempts: z.array(attemptSchema).max(500),
    read: z.array(z.string().regex(/^LESSON-[A-Z0-9-]+$/)).max(100),
    assessment: z.partialRecord(z.enum(skillIds), z.boolean()),
    currentLesson: z
      .string()
      .regex(/^[A-Z0-9-]+$/)
      .max(80)
      .optional(),
    track: z.enum(['L1', 'L2', 'windows', 'network', 'linux']),
  })
  .strict()
export type WorkshopProgress = z.infer<typeof workshopProgressSchema>
export const emptyWorkshop = (): WorkshopProgress => ({
  schemaVersion: 1,
  attempts: [],
  events: [],
  theoryChecks: [],
  remediationAttempts: [],
  read: [],
  assessment: {},
  track: 'L1',
})
export const trackSkills: Record<WorkshopProgress['track'], readonly SkillId[]> = {
  L1: ['addressing', 'routing', 'dns', 'transport', 'wifi', 'git'],
  L2: [
    'addressing',
    'routing',
    'dns',
    'transport',
    'tls',
    'windows',
    'identity',
    'linux',
    'ipv6',
    'services',
    'recovery',
    'security',
    'git',
  ],
  windows: ['addressing', 'routing', 'dns', 'transport', 'tls', 'windows', 'identity', 'security'],
  network: ['addressing', 'routing', 'dns', 'transport', 'tls', 'ipv6', 'wifi'],
  linux: ['addressing', 'routing', 'dns', 'transport', 'linux', 'services', 'recovery', 'git'],
}
export const standLessonIds: Partial<Record<SkillId, string>> = {
  git: 'GIT',
  services: 'SERVICES',
  recovery: 'RECOVERY',
  security: 'SECURITY',
}
export function skillStatus(progress: WorkshopProgress, id: SkillId, now = Date.now()) {
  const attempts = progress.attempts
    .filter((a) => a.skill === id && Date.parse(a.at) <= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const independent = attempts.filter(
    (a) => a.complete && a.score >= 85 && a.hints === 0 && a.mode !== 'guided',
  )
  const variations = new Set(independent.flatMap((a) => (a.causeFamily ? [a.causeFamily] : [])))
  const confirmed = [...new Set(independent.flatMap((a) => a.competencies ?? []))]
  const last = attempts.at(-1)
  const successful = independent.at(-1)
  const theoryForms = new Set(
    progress.theoryChecks
      .filter((c) => c.skill === id && c.correct && Date.parse(c.at) <= now)
      .map((c) => c.form),
  ).size
  const newCauseRetention = independent.some(
    (a, index) =>
      a.causeFamily &&
      independent
        .slice(0, index)
        .some(
          (before) =>
            before.causeFamily &&
            before.causeFamily !== a.causeFamily &&
            Date.parse(a.at) - Date.parse(before.at) >= 7 * 86400000,
        ) &&
      !independent.slice(0, index).some((before) => before.causeFamily === a.causeFamily),
  )
  // Once all causes have been seen, a delayed session on two distinct causes remains possible.
  // Changing only the seed/address never supplies a second cause.
  const foundation = independent.find(
    (_a, i) =>
      new Set(independent.slice(0, i + 1).flatMap((b) => (b.causeFamily ? [b.causeFamily] : [])))
        .size >= 2,
  )
  const delayed = foundation
    ? independent.filter((a) => Date.parse(a.at) - Date.parse(foundation.at) >= 7 * 86400000)
    : []
  const retention =
    newCauseRetention ||
    delayed.some(
      (a) =>
        new Set(
          delayed
            .filter((b) => Math.abs(Date.parse(b.at) - Date.parse(a.at)) <= 86400000)
            .flatMap((b) => (b.causeFamily ? [b.causeFamily] : [])),
        ).size >= 2,
    )
  const readyToAdvance = variations.size >= 2 && confirmed.length >= 2 && theoryForms >= 2
  const mastered = variations.size >= 2 && confirmed.length >= 2 && theoryForms >= 2 && retention
  const readyForStand =
    !!standLessonIds[id] &&
    progress.assessment[id] === true &&
    progress.read.includes(`LESSON-${standLessonIds[id]}`)
  const needsReview =
    (!!successful && now - Date.parse(successful.at) >= 7 * 86400000) ||
    (readyToAdvance &&
      !retention &&
      !!foundation &&
      now - Date.parse(foundation.at) >= 7 * 86400000) ||
    (!!last && (!last.complete || last.score < 85))
  const level = mastered
    ? 'Самостоятельные решения с отложенной проверкой'
    : readyToAdvance
      ? 'Основа подтверждена; можно изучать следующую тему'
      : independent.length
        ? 'Самостоятельная попытка'
        : attempts.some((a) => a.complete)
          ? 'Пройдено с помощью'
          : readyForStand
            ? 'Основы проверены; практика на стенде'
            : progress.assessment[id]
              ? 'Базовые знания'
              : 'Начать изучение'
  return {
    level,
    causeFamilies: variations.size,
    retention,
    theoryForms,
    confirmed,
    theory:
      theoryForms >= 2
        ? 'Проверены разные формы теории'
        : progress.assessment[id] === true
          ? 'Один вопрос основ; требуется расширенная проверка'
          : 'Ещё не проверена',
    standReports: progress.events.filter((e) => e.skill === id && e.module === 'stand').length,
    reviewErrors: last?.errors ?? [],
    mastered,
    readyToAdvance,
    reviewedCauses: delayed.flatMap((a) => (a.causeFamily ? [a.causeFamily] : [])),
    readyForStand,
    needsReview,
    attempts: attempts.length,
    independent: independent.length,
    last,
  }
}
export function recommendSkill(progress: WorkshopProgress, now = Date.now()) {
  const selected = skills.filter((s) => trackSkills[progress.track].includes(s.id))
  const repeat = selected.find((s) => skillStatus(progress, s.id, now).needsReview)
  if (repeat)
    return {
      skill: repeat,
      reason: 'Последняя попытка показала затруднение или подошёл срок повторения.',
    }
  const remaining = selected.filter((s) => {
    const status = skillStatus(progress, s.id, now)
    return !status.readyToAdvance && !status.readyForStand
  })
  if (!remaining.length)
    return {
      skill: selected[0]!,
      reason:
        'Основы выбранного маршрута пройдены; продолжайте практику и проверки на собственном стенде.',
      stand: true,
    }
  const next =
    remaining.find((s) =>
      s.requires.every(
        (id) =>
          progress.assessment[id] || progress.attempts.some((a) => a.skill === id && a.complete),
      ),
    ) ?? remaining[0]!
  return {
    skill: next,
    reason: next.requires.length
      ? 'Основы изучены; следующий шаг — самостоятельная практика этой темы.'
      : 'Эта тема формирует основу последующих лабораторий.',
  }
}
export function parseWorkshopProgress(text: string) {
  if (new TextEncoder().encode(text).length > 12 * 1024 * 1024)
    throw new Error('Прогресс превышает 12 MiB.')
  return workshopProgressSchema.parse(JSON.parse(text))
}
