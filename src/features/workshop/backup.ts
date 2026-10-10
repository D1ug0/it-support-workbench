import { z } from 'zod'
import { topologySchema } from '../terminal/networkModel'
import { graphSchema } from './graph'
import { customCourseSchema, validateCourseLinks } from './customCourses'
import { reportSchema } from './portfolio'
import { workshopProgressSchema } from './skills'
import { progressSchema } from '../learning/progress'
import { standAttemptSchema } from './stand'
import { labIds } from '../terminal/catalog'
export const backupSchema = z
  .object({
    format: z.literal('it-workbench-learning-backup'),
    schemaVersion: z.literal(1),
    createdAt: z.iso.datetime(),
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
    for (const key of ['labs', 'courses', 'graphs', 'portfolio', 'standAttempts'] as const)
      if (new Set(b[key].map((v) => v.id)).size !== b[key].length)
        ctx.addIssue({ code: 'custom', message: `Повторяющиеся ID: ${key}.` })
    if (b.labs.some((l) => !l.id.startsWith('USR-')))
      ctx.addIssue({ code: 'custom', message: 'Встроенные лаборатории не перезаписываются.' })
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
export const backupLimit = 2 * 1024 * 1024
export function parseBackup(text: string): LearningBackup {
  if (new TextEncoder().encode(text).length > backupLimit)
    throw new Error('Резервная копия превышает 2 MiB.')
  return backupSchema.parse(JSON.parse(text))
}
