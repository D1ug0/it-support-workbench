import { z } from 'zod'
import { eventIds } from './engine'
import { networkStateSchema, labAddress } from './networkModel'
export const modes = ['guided', 'practice', 'exam'] as const
export type TerminalMode = (typeof modes)[number]
const legacyCheckpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: z
      .object({
        labId: z.enum(['TERM-DNS-SERVER', 'TERM-DNS-CACHE', 'TERM-ICMP-TCP']),
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
const environmentSchema = legacyCheckpointSchema.shape.environment
export const checkpointSchema = z.union([
  legacyCheckpointSchema,
  z
    .object({
      schemaVersion: z.literal(2),
      variantSeed: z.number().int().min(0).max(999999).optional(),
      environment: z
        .object({
          labId: z.string().max(80),
          dns: labAddress,
          cache: labAddress.nullable(),
          revision: z.number().int().min(0).max(1000),
          verifiedRevision: z.number().int().min(0).max(1000).nullable(),
          events: z.array(z.enum(eventIds)).max(eventIds.length),
          network: networkStateSchema.optional(),
          clock: z.number().int().min(0).max(86400).optional(),
          cacheExpires: z.number().int().min(0).max(86700).optional(),
          negativeUntil: z.number().int().min(0).max(86520).optional(),
        })
        .strict()
        .superRefine((v, ctx) => {
          const legacy = environmentSchema.safeParse({
            labId: v.labId,
            dns: v.dns,
            cache: v.cache,
            revision: v.revision,
            verifiedRevision: v.verifiedRevision,
            events: v.events,
          })
          if (
            v.network
              ? v.network.definition.id !== v.labId ||
                v.revision !== v.network.revision ||
                v.dns !== v.network.dns ||
                v.cache !== (v.network.cache?.address ?? null) ||
                v.verifiedRevision !== v.network.verifiedRevision
              : !legacy.success
          )
            ctx.addIssue({ code: 'custom', message: 'Состояние не соответствует лаборатории.' })
        }),
      mode: z.enum(modes),
      hints: z.number().int().min(0).max(3),
      diagnosis: z.number().int().min(0).max(2).nullable(),
      finished: z.boolean(),
    })
    .strict(),
])
export type Checkpoint = z.infer<typeof checkpointSchema>
export function parseCheckpoint(text: string): Checkpoint {
  if (new TextEncoder().encode(text).length > 65536)
    throw new Error('Контрольная точка превышает 64 KiB.')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    if (text.length > 8192) throw new Error('Контрольная точка превышает 8 KiB.')
    throw new Error('Неподдерживаемая контрольная точка: некорректный JSON.')
  }
  if (
    text.length > 8192 &&
    !(
      typeof value === 'object' &&
      value !== null &&
      'schemaVersion' in value &&
      value.schemaVersion === 2
    )
  )
    throw new Error('Контрольная точка превышает 8 KiB.')
  const valid = checkpointSchema.safeParse(value)
  if (!valid.success)
    throw new Error(
      'Неподдерживаемая контрольная точка. Требуется состояние учебной среды версии 1 или 2.',
    )
  return valid.data
}
