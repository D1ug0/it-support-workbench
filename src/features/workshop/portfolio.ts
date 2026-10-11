import { z } from 'zod'
export const reportSchema = z
  .object({
    id: z.uuid(),
    storageToken: z.uuid().nullable().default(null),
    status: z.enum(['draft', 'completed']).default('draft'),
    version: z.number().int().min(1).max(10000).default(1),
    attemptId: z.uuid().optional(),
    evidenceRefs: z
      .array(
        z
          .object({
            commandId: z.number().int().min(1),
            revision: z.number().int().min(0),
            command: z.string().max(512),
            summary: z.string().max(300),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    title: z.string().min(1).max(160),
    at: z.iso.datetime(),
    labId: z.string().max(80),
    symptom: z.string().max(1200),
    hypothesis: z.string().max(1200),
    evidence: z.string().max(1800),
    change: z.string().max(1200),
    verification: z.string().max(1200),
    score: z.number().int().min(0).max(100).nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.status === 'completed')
      for (const key of ['symptom', 'hypothesis', 'evidence', 'change', 'verification'] as const)
        if (r[key].trim().length < 10)
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Для законченного отчёта нужно содержательное объяснение (от 10 символов).',
          })
  })
export type PortfolioReport = z.infer<typeof reportSchema>
export function reportMarkdown(report: z.input<typeof reportSchema>) {
  const r = reportSchema.parse(report)
  return [
    `# ${r.title}`,
    'Учебная среда; отчёт составлен пользователем. Команды и исходные логи автоматически не включаются.',
    `Статус: ${r.status === 'completed' ? 'Законченный отчёт' : 'Черновик'} · версия ${r.version} · попытка ${r.attemptId ?? 'старый отчёт'}\nДата: ${r.at}\nЛаборатория: ${r.labId}\nРезультат: ${r.score ?? 'не оценён'}`,
    `## Симптом\n${r.symptom}`,
    `## Гипотеза\n${r.hypothesis}`,
    `## Доказательства\n${r.evidence}`,
    `## Связанные синтетические проверки\n${r.evidenceRefs.map((e) => `Команда #${e.commandId}, ревизия ${e.revision}: ${e.command} — ${e.summary}`).join('\n')}`,
    `## Изменение\n${r.change}`,
    `## Повторная проверка\n${r.verification}`,
  ].join('\n\n')
}
