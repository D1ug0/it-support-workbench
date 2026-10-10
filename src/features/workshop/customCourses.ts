import { z } from 'zod'
import { skillIds } from './skills'
export const customCourseSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^COURSE-[A-F0-9]{32}$/),
    title: z.string().trim().min(3).max(160),
    skill: z.enum(skillIds),
    tracks: z
      .array(z.enum(['L1', 'L2', 'windows', 'network', 'linux']))
      .min(1)
      .max(5),
    paragraphs: z.array(z.string().trim().min(20).max(4000)).min(1).max(12),
    steps: z.array(z.string().trim().min(10).max(1000)).min(2).max(10),
    question: z.string().trim().min(10).max(500),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(5),
    correct: z.number().int().min(0).max(4),
    why: z.string().trim().min(20).max(2000),
    labs: z.array(z.string().regex(/^(TERM-[A-Z0-9-]+|USR-[a-f0-9-]{36})$/)).max(8),
    source: z
      .url()
      .max(500)
      .refine((s) => {
        const url = new URL(s)
        return url.protocol === 'https:' && !url.username && !url.password
      }, 'Источник должен быть HTTPS URL без credentials.'),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.correct >= c.options.length)
      ctx.addIssue({ code: 'custom', message: 'Правильный ответ отсутствует.' })
    if (new Set(c.options).size !== c.options.length)
      ctx.addIssue({ code: 'custom', message: 'Варианты ответа должны различаться.' })
    if (new Set(c.tracks).size !== c.tracks.length || new Set(c.labs).size !== c.labs.length)
      ctx.addIssue({ code: 'custom', message: 'Повторяющиеся направления или лаборатории.' })
  })
export type CustomCourse = z.infer<typeof customCourseSchema>
const packageSchema = z
  .object({ schemaVersion: z.literal(1), courses: z.array(customCourseSchema).min(1).max(20) })
  .strict()
  .superRefine((p, ctx) => {
    if (new Set(p.courses.map((c) => c.id)).size !== p.courses.length)
      ctx.addIssue({ code: 'custom', message: 'Повторяющиеся ID курсов.' })
  })
export function parseCustomCourses(text: string) {
  if (new TextEncoder().encode(text).length > 131072)
    throw new Error('Лимит пакета курсов: 128 KiB.')
  return packageSchema.parse(JSON.parse(text)).courses
}
export function validateCourseLinks(courses: readonly CustomCourse[], labIds: readonly string[]) {
  const missing = courses.flatMap((c) => c.labs.filter((id) => !labIds.includes(id)))
  if (missing.length)
    throw new Error(
      `Недоступные лаборатории: ${[...new Set(missing)].join(', ')}. Сначала импортируйте лаборатории.`,
    )
}
