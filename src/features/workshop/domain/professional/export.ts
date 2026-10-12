import { professionalCases, faultTitles } from './definitions'
import type { ProfessionalAttempt } from './model'
import { professionalExplanationReport } from './report'
import { explanationContentKey, explanationReviewMarkdown } from '../explanationReview'
import { hypothesisEvidence } from './assessment'
export function professionalMarkdown(a: ProfessionalAttempt) {
  return [
    `# ${professionalCases.find((c) => c.id === a.caseId)!.title}`,
    `Синтетический учебный инцидент; ${a.caseId === 'unknown' && a.status !== 'completed' ? 'причина и вариант скрыты до завершения' : `вариант ${a.variant + 1}`}. Попытка ${a.id}. Статус ${a.status}, оценка процесса ${a.score ?? 'в процессе'}. Рубрика ${a.gradingVersion || 'legacy'}. Содержание обоснований ожидает разбора человеком. ${a.escalated ? 'Восстановление доступа ожидает владельца.' : ''}`,
    '## Таблица гипотез',
    ...a.hypotheses.map((row) => {
      const evidence = hypothesisEvidence(a, row)
      return `${faultTitles[row.fault]}: ${row.explanation}\nПроверка ${row.step === null ? 'не выбрана' : '#' + row.step}: ${evidence.step?.result ?? 'нет данных'}\nВывод: ${row.conclusion}; ${evidence.matches ? 'согласован с наблюдением' : 'противоречит наблюдению'}; ${evidence.stale ? 'исторические данные, нужна свежая проверка текущего состояния' : 'текущая ревизия'}. Следующий шаг: ${row.nextStep}`
    }),
    ...a.steps.map(
      (s, i) =>
        `${i + 1}. ${s.action} · ревизия ${s.revision}\nГипотеза: ${s.reason}\nНаблюдение: ${s.result}`,
    ),
    `## Ограничения и следующий шаг\n${a.reportLimits || 'Не описаны.'}`,
    `## Ручной разбор\n${explanationReviewMarkdown(a.explanationReview ?? null, explanationContentKey(professionalExplanationReport(a)))}`,
    `Редакция отчёта: ${a.reportVersion ?? 1}; предыдущих редакций: ${a.reportHistory?.length ?? 0}.`,
    ...Object.entries(a.report).map(([k, v]) => `## ${k}\n${v}`),
    `Ссылки на действия: ${a.evidenceRefs.map((id) => '#' + id).join(', ')}; гипотезы: ${a.hypothesisFaults.join(', ')}.`,
    `Учебное время (не замер реального стенда): ${a.recoveryMinutes ?? 'не указано'} мин; потеря ${a.lossMinutes ?? 'не указано'} мин; восстановленная копия ${a.restoredSnapshot ?? 'не выбрана'}.`,
  ].join('\n\n')
}
