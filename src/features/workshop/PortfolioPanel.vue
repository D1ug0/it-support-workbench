<script setup lang="ts">
import { ref } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { reportMarkdown } from './portfolio'
import { downloadText } from '../../infrastructure/export/exportReport'
const store = useWorkshopStore(),
  error = ref('')
async function removeReport(id: string) {
  if (!window.confirm('Удалить выбранный отчёт?')) return
  try {
    await store.removeReport(id)
  } catch {
    error.value = 'Удаление отчёта не удалось.'
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Портфолио расследований</h3>
    <p>
      Отчёт создаётся в терминале через «Оформить расследование». Сохранение заметок явное, исходные
      команды автоматически не включаются. До 50 отчётов.
    </p>
    <p v-if="!store.portfolio.length">Сохранённых отчётов пока нет.</p>
    <article
      v-for="report in [...store.portfolio].reverse()"
      :key="report.id"
      class="workshop-item"
    >
      <h4>{{ report.title }}</h4>
      <p>
        {{ report.status === 'completed' ? 'Законченный отчёт' : 'Черновик' }} · версия
        {{ report.version }} · {{ new Date(report.at).toLocaleString('ru-RU') }} ·
        {{ report.score ?? 'без оценки' }}
      </p>
      <RouterLink class="button secondary" :to="`/terminal?lab=${report.labId}&report=${report.id}`"
        >Редактировать отчёт</RouterLink
      >
      <details>
        <summary>Показать сохранённые заметки</summary>
        <pre class="workshop-report-preview" tabindex="0">{{ reportMarkdown(report) }}</pre>
      </details>
      <button
        class="button ghost"
        @click="downloadText(reportMarkdown(report), 'workbench-investigation.md')"
      >
        Скачать отчёт</button
      ><button class="button ghost" @click="removeReport(report.id)">Удалить отчёт</button>
    </article>
  </section>

  <p v-if="error" role="alert">{{ error }}</p>
</template>
