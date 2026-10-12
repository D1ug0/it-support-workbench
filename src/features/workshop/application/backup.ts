import { customScenarioSchema } from '../../simulator/custom'
import { professionalAttemptSchema } from '../domain/professional/index'
import { draftSchema } from '../domain/drafts'
import { z } from 'zod'
import { topologySchema } from '../../terminal/networkModel'
import { graphSchema } from '../domain/graph'
import { customCourseSchema, validateCourseLinks } from '../domain/customCourses'
import { reportSchema } from '../domain/portfolio'
import { workshopProgressSchema } from '../domain/skills'
import { progressSchema } from '../../learning/progress'
import { standAttemptSchema } from '../domain/stand'
import { labIds } from '../../terminal/catalog'
export const backupSchema = z
  .object({
    format: z.literal('it-workbench-learning-backup'),
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    createdAt: z.iso.datetime(),
    professionalAttempts: z.array(professionalAttemptSchema).max(50).optional(),
    scenarios: z.array(customScenarioSchema).max(20).optional(),
    drafts: z.array(draftSchema).max(50).optional(),
    learning: progressSchema,
    workshop: workshopProgressSchema,
    labs: z.array(topologySchema).max(20),
    courses: z.array(customCourseSchema).max(20),
    graphs: z.array(graphSchema).max(20),
    portfolio: z.array(reportSchema).max(50),
    standAttempts: z.array(standAttemptSchema).max(50),
  })
  .strict()
  .superRefine((b, ctx) => {
    for (const key of [
      'labs',
      'courses',
      'graphs',
      'portfolio',
      'standAttempts',
      'scenarios',
      'drafts',
      'professionalAttempts',
    ] as const)
      if (new Set((b[key] ?? []).map((v) => v.id)).size !== (b[key] ?? []).length)
        ctx.addIssue({ code: 'custom', message: `Повторяющиеся ID: ${key}.` })
    if (b.labs.some((l) => !l.id.startsWith('USR-')))
      ctx.addIssue({ code: 'custom', message: 'Встроенные лаборатории не перезаписываются.' })
    if (b.schemaVersion === 2 && (!b.scenarios || !b.drafts || !b.professionalAttempts))
      ctx.addIssue({ code: 'custom', message: 'Копия v2 должна включать сценарии и черновики.' })
    try {
      validateCourseLinks(b.courses, [...labIds, ...b.labs.map((l) => l.id)])
    } catch (e) {
      ctx.addIssue({
        code: 'custom',
        message: e instanceof Error ? e.message : 'Неверные ссылки курсов.',
      })
    }
  })
export type LearningBackup = z.infer<typeof backupSchema>
export const backupLimit = 16 * 1024 * 1024
export function parseBackup(text: string): LearningBackup {
  if (new TextEncoder().encode(text).length > backupLimit)
    throw new Error('Резервная копия превышает 16 MiB.')
  return backupSchema.parse(JSON.parse(text))
}
