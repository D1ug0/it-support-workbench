import { z } from 'zod'
import { labIds } from './catalog'
import { eventIds } from './engine'
export const modes = ['guided', 'practice', 'exam'] as const
export type TerminalMode = (typeof modes)[number]
export const checkpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: z
      .object({
        labId: z.enum(labIds),
        dns: z.enum(['192.0.2.53', '192.0.2.54']),
        cache: z.enum(['192.0.2.20', '198.51.100.99']).nullable(),
        revision: z.number().int().min(0).max(1000),
        verifiedRevision: z.number().int().min(0).max(1000).nullable(),
        events: z.array(z.enum(eventIds)).max(eventIds.length),
      })
      .strict()
      .refine(
        (v) =>
          new Set(v.events).size === v.events.length &&
          (v.verifiedRevision === null ||
            (v.verifiedRevision <= v.revision && v.events.includes('tcp-success'))),
      ),
    mode: z.enum(modes),
    hints: z.number().int().min(0).max(3),
    diagnosis: z.number().int().min(0).max(2).nullable(),
    finished: z.boolean(),
  })
  .strict()
export type Checkpoint = z.infer<typeof checkpointSchema>
export function parseCheckpoint(text: string): Checkpoint {
  if (new TextEncoder().encode(text).length > 8192)
    throw new Error('Контрольная точка превышает 8 KiB.')
  try {
    return checkpointSchema.parse(JSON.parse(text))
  } catch {
    throw new Error(
      'Неподдерживаемая контрольная точка. Файл должен содержать только состояние учебной среды версии 1.',
    )
  }
}
