<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTerminalStore } from '../terminal/useTerminalStore'
import { useWorkshopStore } from './useWorkshopStore'
import { reportSchema, reportMarkdown } from './portfolio'
import { downloadText } from '../../infrastructure/export/exportReport'
const terminal = useTerminalStore(),
  workshop = useWorkshopStore()
const symptom = ref(''),
  hypothesis = ref(''),
  evidence = ref(''),
  change = ref(''),
  verification = ref(''),
  consent = ref(false),
  error = ref(''),
  notice = ref('')
watch(
  () => terminal.lab.id,
  () => {
    symptom.value = ''
    hypothesis.value = ''
    evidence.value = ''
    change.value = ''
    verification.value = ''
    consent.value = false
  },
)
const report = computed(() =>
  reportSchema.parse({
    id: globalThis.crypto.randomUUID(),
    title: terminal.lab.title,
    at: new Date().toISOString(),
    labId: terminal.lab.id,
    symptom: symptom.value,
    hypothesis: hypothesis.value,
    evidence: evidence.value,
    change: change.value,
    verification: verification.value,
    score: terminal.feedback?.score ?? null,
  }),
)
async function save() {
  if (!consent.value) {
    error.value = 'Подтвердите проверку заметок перед сохранением.'
    return
  }
  try {
    await workshop.saveReport(report.value)
    notice.value = 'Учебный отчёт сохранён в портфолио.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось сохранить отчёт.'
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Оформить расследование</h2>
    <p>
      Запишите свои выводы. Заметки остаются в памяти до явного сохранения. Свободный текст
      автоматически не обезличивается; перед экспортом проверьте содержимое.
    </p>
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
      <pre class="workshop-report-preview" tabindex="0">{{ reportMarkdown(report) }}</pre>
    </details>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Проверил заметки: здесь только учебные
      данные</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="!consent" @click="save">
        Сохранить в портфолио</button
      ><button
        class="button ghost"
        :disabled="!consent"
        @click="downloadText(reportMarkdown(report), 'workbench-investigation.md')"
      >
        Экспорт расследования Markdown
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
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
