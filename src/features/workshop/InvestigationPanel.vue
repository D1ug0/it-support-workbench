<script setup lang="ts">
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { confirmDiscardForms, useUnsavedChanges } from '../../shared/unsavedChanges'
import { useRoute } from 'vue-router'
import { drafts, draftSchema, saveDraft } from './drafts'
import { computed, onMounted, ref, watch } from 'vue'
import { useTerminalStore } from '../terminal/useTerminalStore'
import { useWorkshopStore } from './useWorkshopStore'
import { reportSchema, reportMarkdown } from './portfolio'
import { downloadText } from '../../infrastructure/export/exportReport'
const route = useRoute()
const terminal = useTerminalStore(),
  workshop = useWorkshopStore()
const symptom = ref(''),
  hypothesis = ref(''),
  evidence = ref(''),
  change = ref(''),
  verification = ref(''),
  consent = ref(false),
  error = ref(''),
  notice = ref(''),
  busy = ref(false)
const reportId = ref<string>(globalThis.crypto.randomUUID()),
  reportVersion = ref(1),
  draftToken = ref<string | null>(null),
  reportAttemptId = ref(terminal.attemptId),
  status = ref<'draft' | 'completed'>('draft'),
  selected = ref<number[]>([])
const inheritedRefs = ref<import('./portfolio').PortfolioReport['evidenceRefs']>([]),
  inheritedScore = ref<number | null>(null)
const noteSnapshot = () =>
  JSON.stringify([
    symptom.value,
    hypothesis.value,
    evidence.value,
    change.value,
    verification.value,
    selected.value,
    status.value,
  ])
const { markSaved } = useUnsavedChanges(noteSnapshot)
const savedDrafts = ref<import('./drafts').LearningDraft[]>([])
onMounted(async () => {
  await workshop.initialize()
  if (typeof route.query.report === 'string') editReport(route.query.report)
  savedDrafts.value = (await drafts.toArray().catch(() => [])).flatMap((v) => {
    const p = draftSchema.safeParse(v)
    return p.success && p.data.kind === 'investigation' ? [p.data] : []
  })
})
watch(
  () => terminal.attemptId,
  () => {
    reportId.value = globalThis.crypto.randomUUID()
    reportAttemptId.value = terminal.attemptId
    reportVersion.value = 1
    draftToken.value = null
    status.value = 'draft'
    selected.value = []
    inheritedRefs.value = []
    inheritedScore.value = null
    symptom.value = ''
    hypothesis.value = ''
    evidence.value = ''
    change.value = ''
    verification.value = ''
    consent.value = false
    markSaved()
  },
)
const report = computed(() => ({
  id: reportId.value,
  version: reportVersion.value,
  status: status.value,
  attemptId: reportAttemptId.value,
  evidenceRefs: [
    ...inheritedRefs.value,
    ...(reportAttemptId.value === terminal.attemptId ? terminal.records : [])
      .filter((r) => selected.value.includes(r.id))
      .map((r) => ({
        commandId: r.id,
        revision: r.revision,
        command: r.command,
        summary: r.ok
          ? 'Поддержанная синтетическая проверка; сопоставьте с выводом в терминале.'
          : 'Команда отклонена.',
      })),
  ].slice(-40),
  title: terminal.lab.title,
  at: new Date().toISOString(),
  labId: terminal.lab.id,
  symptom: symptom.value,
  hypothesis: hypothesis.value,
  evidence: evidence.value,
  change: change.value,
  verification: verification.value,
  score:
    reportAttemptId.value === terminal.attemptId
      ? (terminal.feedback?.score ?? inheritedScore.value)
      : inheritedScore.value,
}))
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
    await workshop.saveReport(reportSchema.parse(report.value))
    if (id === reportId.value) {
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
      taskId: terminal.lab.id,
      at: new Date().toISOString(),
      notes: {
        symptom: symptom.value,
        hypothesis: hypothesis.value,
        evidence: evidence.value,
        change: change.value,
        verification: verification.value,
      },
    })
    const stored = await saveDraft(value)
    if (id === reportId.value) draftToken.value = stored.storageToken
    savedDrafts.value = [...savedDrafts.value.filter((d) => d.id !== stored.id), stored]
    if (id === reportId.value && !selected.value.length && status.value === 'draft')
      markSaved(before)
    notice.value = 'Черновик сохранён вручную; доступен после перезагрузки.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Черновик не сохранён.'
  } finally {
    busy.value = false
  }
}
async function resumeDraft(id: string) {
  if (busy.value || !confirmDiscardForms()) return
  const parsed = draftSchema.safeParse(await drafts.get(id).catch(() => undefined))
  const d = parsed.success ? parsed.data : undefined
  if (!d) {
    error.value = 'Черновик удалён или недоступен; текущие заметки можно экспортировать.'
    return
  }
  error.value = ''
  selected.value = []
  inheritedRefs.value = []
  inheritedScore.value = null
  reportVersion.value = (workshop.portfolio.find((r) => r.id === d.id)?.version ?? 0) + 1
  reportId.value = d.id
  draftToken.value = d.storageToken
  reportAttemptId.value = d.attemptId
  for (const [key, target] of Object.entries({
    symptom,
    hypothesis,
    evidence,
    change,
    verification,
  }))
    target.value = d.notes[key] ?? ''
  markSaved()
  notice.value = `Продолжен черновик попытки ${d.attemptId}. Среда восстанавливается отдельно через контрольную точку.`
}
function editReport(id: string) {
  if (busy.value || !confirmDiscardForms()) return
  const r = workshop.portfolio.find((r) => r.id === id)
  if (!r) return
  selected.value = []
  inheritedRefs.value = r.evidenceRefs
  inheritedScore.value = r.score
  reportAttemptId.value = r.attemptId ?? terminal.attemptId
  reportId.value = r.id
  draftToken.value = savedDrafts.value.find((d) => d.id === id)?.storageToken ?? null
  reportVersion.value = r.version + 1
  status.value = r.status
  for (const [key, target] of Object.entries({
    symptom,
    hypothesis,
    evidence,
    change,
    verification,
  }))
    target.value = r[key as 'symptom']
  markSaved()
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Оформить расследование</h2>
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
      <label v-for="r in terminal.records" :key="r.id" class="checkbox-label"
        ><input v-model="selected" type="checkbox" :value="r.id" />#{{ r.id }} · ревизия
        {{ r.revision }} · {{ r.command }}</label
      >
    </fieldset>
    <label>Симптом<textarea v-model="symptom" class="text-input" rows="2" maxlength="1200" /></label
    ><label
      >Гипотеза<textarea v-model="hypothesis" class="text-input" rows="2" maxlength="1200" /></label
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
