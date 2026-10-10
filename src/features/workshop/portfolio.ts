import { z } from 'zod'
export const reportSchema = z
  .object({
    id: z.uuid(),
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
export type PortfolioReport = z.infer<typeof reportSchema>
export function reportMarkdown(report: PortfolioReport) {
  const r = reportSchema.parse(report)
  return [
    `# ${r.title}`,
    'Учебная среда; отчёт составлен пользователем. Команды и исходные логи автоматически не включаются.',
    `Дата: ${r.at}\nЛаборатория: ${r.labId}\nРезультат: ${r.score ?? 'не оценён'}`,
    `## Симптом\n${r.symptom}`,
    `## Гипотеза\n${r.hypothesis}`,
    `## Доказательства\n${r.evidence}`,
    `## Изменение\n${r.change}`,
    `## Повторная проверка\n${r.verification}`,
  ].join('\n\n')
}
