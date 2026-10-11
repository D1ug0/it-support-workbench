<script setup lang="ts">
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { confirmDiscardForms, useUnsavedChanges } from '../../shared/unsavedChanges'
import { useRoute } from 'vue-router'
import { drafts, draftSchema, saveDraft } from './drafts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTerminalStore } from '../terminal/useTerminalStore'
import { useWorkshopStore } from './useWorkshopStore'
import { reportSchema, reportMarkdown } from './portfolio'
import { downloadText } from '../../infrastructure/export/exportReport'
import ExplanationReviewPanel from './ExplanationReviewPanel.vue'
import type { ExplanationReview } from './explanationReview'
import type { TerminalRecord } from '../terminal/useTerminalStore'
const route = useRoute()
const terminal = useTerminalStore(),
  workshop = useWorkshopStore()
const symptom = ref(''),
  hypothesis = ref(''),
  evidence = ref(''),
  change = ref(''),
  verification = ref(''),
  limits = ref(''),
  consent = ref(false),
  error = ref(''),
  notice = ref(''),
  busy = ref(false)
const reportId = ref<string>(globalThis.crypto.randomUUID()),
  reportToken = ref<string | null>(null),
  reportTitle = ref(terminal.lab.title),
  reportLabId = ref(terminal.lab.id),
  reportAt = ref(new Date().toISOString()),
  reportVersion = ref(1),
  draftToken = ref<string | null>(null),
  reportAttemptId = ref(terminal.attemptId),
  status = ref<'draft' | 'completed'>('draft')
const explanationReview = ref<ExplanationReview | null>(null)
const inheritedRefs = ref<import('./portfolio').PortfolioReport['evidenceRefs']>([]),
  inheritedScore = ref<number | null>(null),
  inheritedFinished = ref(false)
function sameReference(
  reference: import('./portfolio').PortfolioReport['evidenceRefs'][number],
  record: TerminalRecord,
) {
  if (reference.recordId || record.recordId) return reference.recordId === record.recordId
  return (
    reference.commandId === record.id &&
    reference.revision === record.revision &&
    reference.command === record.command
  )
}
// Capture references when selected, so the 40-command history limit cannot erase them.
function toggleReference(record: TerminalRecord, checked: boolean) {
  const exists = inheritedRefs.value.some((reference) => sameReference(reference, record))
  if (!checked) {
    inheritedRefs.value = inheritedRefs.value.filter(
      (reference) => !sameReference(reference, record),
    )
  } else if (!exists && inheritedRefs.value.length < 40) {
    inheritedRefs.value = [
      ...inheritedRefs.value,
      {
        commandId: record.id,
        recordId: record.recordId,
        revision: record.revision,
        command: record.command,
        summary: record.ok
          ? record.changed
            ? 'Изменение синтетической среды; сопоставьте с выводом в терминале.'
            : 'Синтетический результат; сопоставьте с выводом в терминале.'
          : 'Команда отклонена.',
      },
    ]
  }
}
const noteSnapshot = () =>
  JSON.stringify([
    symptom.value,
    hypothesis.value,
    evidence.value,
    change.value,
    verification.value,
    limits.value,
    explanationReview.value,
    inheritedRefs.value,
    status.value,
  ])
const { markSaved } = useUnsavedChanges(noteSnapshot)
const savedDrafts = ref<import('./drafts').LearningDraft[]>([])
const ready = ref(false)
let loadGeneration = 0
let disposed = false
onBeforeUnmount(() => {
  loadGeneration++
  disposed = true
})
onMounted(async () => {
  await workshop.initialize()
  if (disposed) return
  savedDrafts.value = (await drafts.toArray().catch(() => [])).flatMap((v) => {
    const p = draftSchema.safeParse(v)
    return p.success && p.data.kind === 'investigation' ? [p.data] : []
  })
  if (disposed) return
  ready.value = true
  if (typeof route.query.report === 'string') editReport(route.query.report)
})
watch(
  () => route.query.report,
  (id) => {
    if (ready.value && typeof id === 'string' && id !== reportId.value) editReport(id, true)
  },
  { flush: 'post' },
)
watch(
  () => terminal.attemptId,
  () => {
    loadGeneration++
    reportId.value = globalThis.crypto.randomUUID()
    reportAttemptId.value = terminal.attemptId
    reportVersion.value = 1
    reportToken.value = null
    reportTitle.value = terminal.lab.title
    reportLabId.value = terminal.lab.id
    reportAt.value = new Date().toISOString()
    draftToken.value = null
    status.value = 'draft'
    inheritedRefs.value = []
    inheritedScore.value = null
    inheritedFinished.value = false
    symptom.value = ''
    hypothesis.value = ''
    evidence.value = ''
    change.value = ''
    verification.value = ''
    limits.value = ''
    explanationReview.value = null
    consent.value = false
    markSaved()
  },
)
const report = computed(() => ({
  id: reportId.value,
  storageToken: reportToken.value,
  version: reportVersion.value,
  status: status.value,
  attemptId: reportAttemptId.value,
  attemptFinished:
    reportAttemptId.value === terminal.attemptId
      ? terminal.finished
      : inheritedFinished.value ||
        workshop.state.events.some(
          (event) =>
            event.module === 'terminal' &&
            event.attemptId === reportAttemptId.value &&
            ['completed', 'failed'].includes(event.outcome),
        ),
  evidenceRefs: inheritedRefs.value,
  title: reportTitle.value,
  at: reportAt.value,
  labId: reportLabId.value,
  symptom: symptom.value,
  hypothesis: hypothesis.value,
  evidence: evidence.value,
  change: change.value,
  verification: verification.value,
  limits: limits.value,
  explanationReview: explanationReview.value,
  score:
    reportAttemptId.value === terminal.attemptId
      ? (terminal.feedback?.score ?? inheritedScore.value)
      : inheritedScore.value,
}))
const reviewAvailable = computed(() => report.value.attemptFinished)
const previewText = computed(() => {
  const parsed = reportSchema.safeParse(report.value)
  return reportMarkdown(parsed.success ? parsed.data : { ...report.value, status: 'draft' })
})
async function save() {
  if (busy.value) return
  if (!consent.value) {
    error.value = 'Подтвердите проверку заметок перед сохранением.'
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  const before = noteSnapshot(),
    id = reportId.value
  try {
    const stored = await workshop.saveReport(reportSchema.parse(report.value))
    if (id === reportId.value) {
      reportToken.value = stored.storageToken
      reportVersion.value++
      markSaved(before)
    }
    notice.value = 'Учебный отчёт сохранён в портфолио.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось сохранить отчёт.'
  } finally {
    busy.value = false
  }
}
async function saveNotes() {
  if (!consent.value || busy.value) return
  busy.value = true
  error.value = ''
  const before = noteSnapshot(),
    id = reportId.value
  try {
    const value = draftSchema.parse({
      id: reportId.value,
      storageToken: draftToken.value,
      kind: 'investigation',
      attemptId: reportAttemptId.value,
      attemptFinished: report.value.attemptFinished,
      taskId: reportLabId.value,
      title: reportTitle.value,
      at: new Date().toISOString(),
      notes: {
        symptom: symptom.value,
        hypothesis: hypothesis.value,
        evidence: evidence.value,
        change: change.value,
        verification: verification.value,
        limits: limits.value,
      },
      explanationReview: explanationReview.value,
      evidenceRefs: report.value.evidenceRefs,
      reportStatus: status.value,
      score: report.value.score,
    })
    const stored = await saveDraft(value)
    if (id === reportId.value) draftToken.value = stored.storageToken
    savedDrafts.value = [...savedDrafts.value.filter((d) => d.id !== stored.id), stored]
    if (id === reportId.value) markSaved(before)
    notice.value = 'Черновик сохранён вручную; доступен после перезагрузки.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Черновик не сохранён.'
  } finally {
    busy.value = false
  }
}
async function resumeDraft(id: string) {
  if (busy.value || !confirmDiscardForms()) return
  const generation = ++loadGeneration,
    before = noteSnapshot()
  const parsed = draftSchema.safeParse(await drafts.get(id).catch(() => undefined))
  if (generation !== loadGeneration) return
  if (busy.value || before !== noteSnapshot()) {
    error.value =
      'Форма изменилась во время чтения черновика. Текущие заметки остались в форме; повторите загрузку при необходимости.'
    return
  }
  const d = parsed.success ? parsed.data : undefined
  if (!d) {
    error.value = 'Черновик удалён или недоступен; текущие заметки можно экспортировать.'
    return
  }
  error.value = ''
  inheritedRefs.value = d.evidenceRefs
  inheritedScore.value = d.score
  inheritedFinished.value = d.attemptFinished
  explanationReview.value = d.explanationReview
  status.value = d.reportStatus
  reportVersion.value = (workshop.portfolio.find((r) => r.id === d.id)?.version ?? 0) + 1
  reportToken.value = workshop.portfolio.find((r) => r.id === d.id)?.storageToken ?? null
  reportLabId.value = d.taskId
  reportTitle.value = d.title ?? workshop.portfolio.find((r) => r.id === d.id)?.title ?? d.taskId
  reportAt.value = d.at
  reportId.value = d.id
  draftToken.value = d.storageToken
  reportAttemptId.value = d.attemptId
  for (const [key, target] of Object.entries({
    symptom,
    hypothesis,
    evidence,
    change,
    verification,
    limits,
  }))
    target.value = d.notes[key] ?? ''
  markSaved()
  notice.value = `Продолжен черновик попытки ${d.attemptId}. Среда восстанавливается отдельно через контрольную точку.`
}
function editReport(id: string, navigationConfirmed = false) {
  if (busy.value || (!navigationConfirmed && !confirmDiscardForms())) return
  loadGeneration++
  const r = workshop.portfolio.find((r) => r.id === id)
  if (!r) return
  inheritedRefs.value = r.evidenceRefs
  inheritedScore.value = r.score
  inheritedFinished.value = r.attemptFinished
  reportAttemptId.value = r.attemptId ?? terminal.attemptId
  reportId.value = r.id
  reportToken.value = r.storageToken
  reportTitle.value = r.title
  reportLabId.value = r.labId
  reportAt.value = r.at
  draftToken.value = savedDrafts.value.find((d) => d.id === id)?.storageToken ?? null
  reportVersion.value = r.version + 1
  status.value = r.status
  explanationReview.value = r.explanationReview
  for (const [key, target] of Object.entries({
    symptom,
    hypothesis,
    evidence,
    change,
    verification,
    limits,
  }))
    target.value = r[key as 'symptom']
  markSaved()
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Оформить расследование</h2>
    <p>{{ reportTitle }} · {{ reportLabId }}</p>
    <p>
      Запишите свои выводы. Заметки остаются в памяти до явного сохранения. Свободный текст
      автоматически не обезличивается; перед экспортом проверьте содержимое.
    </p>
    <label
      >Статус отчёта<AppSelect v-model="status" class="text-input">
        <AppSelectOption value="draft">Черновик</AppSelectOption>
        <AppSelectOption value="completed">Законченный отчёт</AppSelectOption>
      </AppSelect></label
    >
    <label
      >Продолжить сохранённый черновик<AppSelect class="text-input" @change="resumeDraft($event)">
        <AppSelectOption value="">Выберите черновик</AppSelectOption>
        <AppSelectOption
          v-for="d in savedDrafts.filter((d) => d.taskId === terminal.lab.id)"
          :key="d.id"
          :value="d.id"
        >
          {{ d.at }} · {{ d.attemptId }}
        </AppSelectOption>
      </AppSelect></label
    >
    <label
      >Редактировать отчёт этой лаборатории<AppSelect
        class="text-input"
        @change="editReport($event)"
      >
        <AppSelectOption value="">Выберите отчёт</AppSelectOption>
        <AppSelectOption
          v-for="r in workshop.portfolio.filter((r) => r.labId === terminal.lab.id)"
          :key="r.id"
          :value="r.id"
        >
          {{ r.title }} · версия {{ r.version }}
        </AppSelectOption>
      </AppSelect></label
    >
    <fieldset v-if="terminal.records.length && reportAttemptId === terminal.attemptId">
      <legend>Добавить ссылки на синтетические доказательства</legend>
      <label v-for="r in terminal.records" :key="r.id" class="checkbox-label">
        <input
          type="checkbox"
          :checked="inheritedRefs.some((reference) => sameReference(reference, r))"
          :disabled="
            report.evidenceRefs.length >= 40 &&
            !inheritedRefs.some((reference) => sameReference(reference, r))
          "
          @change="toggleReference(r, ($event.target as HTMLInputElement).checked)"
        />
        #{{ r.id }} · ревизия {{ r.revision }} · {{ r.command }}
      </label>
      <p>
        Выбрано {{ report.evidenceRefs.length }} из 40 ссылок. Прежние ссылки можно убрать отдельно.
      </p>
    </fieldset>
    <div v-if="inheritedRefs.length">
      <h3>Проверки, связанные с отчётом</h3>
      <p>
        Ссылки описывают синтетические команды; исходный вывод хранится только в памяти попытки.
      </p>
      <ul>
        <li
          v-for="(reference, index) in inheritedRefs"
          :key="reference.recordId ?? `${reference.commandId}-${index}`"
        >
          #{{ reference.commandId }} · состояние {{ reference.revision }} ·
          <code>{{ reference.command }}</code
          ><button
            class="button ghost"
            @click="inheritedRefs = inheritedRefs.filter((_, itemIndex) => itemIndex !== index)"
          >
            Убрать ссылку #{{ reference.commandId }}
          </button>
        </li>
      </ul>
    </div>
    <label
      >Симптом и масштаб<textarea
        v-model="symptom"
        class="text-input"
        rows="2"
        maxlength="1200"
        placeholder="Кто затронут и какое действие не проходит?"
      /></label
    ><label
      >Гипотеза<textarea
        v-model="hypothesis"
        class="text-input"
        rows="2"
        maxlength="1200"
        placeholder="Предполагаемая причина и альтернативное объяснение"
      /></label
    ><label
      >Доказательства<textarea
        v-model="evidence"
        class="text-input"
        rows="3"
        maxlength="1800"
      /></label
    ><label
      >Что изменено<textarea v-model="change" class="text-input" rows="2" maxlength="1200" /></label
    ><label
      >Повторная проверка<textarea
        v-model="verification"
        class="text-input"
        rows="2"
        maxlength="1200"
      />
    </label>
    <label
      >Ограничения, откат и эскалация<textarea
        v-model="limits"
        class="text-input"
        rows="3"
        maxlength="1200"
        placeholder="Что ещё не проверено? Когда нужен откат или передача задачи?"
      />
    </label>
    <ExplanationReviewPanel
      v-model="explanationReview"
      :report="report"
      :available="reviewAvailable"
      :show-examples="reviewAvailable"
    />
    <details>
      <summary>Предпросмотр учебного отчёта</summary>
      <pre class="workshop-report-preview" tabindex="0">{{ previewText }}</pre>
    </details>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Проверил заметки: здесь только учебные
      данные</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="!consent || busy" @click="saveNotes">
        Сохранить учебный черновик
      </button>
      <button class="button secondary" :disabled="!consent || busy" @click="save">
        Сохранить в портфолио</button
      ><button
        class="button ghost"
        :disabled="!consent"
        @click="downloadText(previewText, 'workbench-investigation.md')"
      >
        Экспорт расследования Markdown
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error" class="button secondary" @click="resumeDraft(reportId)">
      Перечитать сохранённый черновик
    </button>
    <p v-if="notice" role="status">{{ notice }}</p>
    <details v-if="terminal.environment.network">
      <summary>Временная линия лаборатории</summary>
      <ol class="trace-timeline">
        <li v-for="(event, index) in terminal.environment.network.timeline" :key="index">
          T+{{ event.time }} с · {{ event.type }} · {{ event.message }}
        </li>
      </ol>
    </details>
    <div v-if="terminal.environment.network">
      <p>
        Разбор изменений модели: улучшений {{ terminal.environment.network.changeAudit.repairs }},
        ухудшений {{ terminal.environment.network.changeAudit.regressions }}, без улучшения
        {{ terminal.environment.network.changeAudit.unnecessary }}, откатов
        {{ terminal.environment.network.changeAudit.rollbacks }}.
      </p>
      <p>
        Дополнительный отказ снижает оценку на 5, изменение без улучшения — на 2; вместе не больше
        20 баллов. Это оценка условий модели. Откат возвращает настройку, сохраняет разбор и требует
        новой проверки сервиса. Последние 20 изменений доступны только в текущей попытке.
      </p>
      <button
        class="button secondary"
        :disabled="
          terminal.finished ||
          !terminal.rollbackStates.length ||
          terminal.environment.network.revision >= 1000
        "
        @click="terminal.undo()"
      >
        Откатить последнее изменение модели
      </button>
    </div>
  </section>
</template>
