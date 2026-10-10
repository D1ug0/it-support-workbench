<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { useLearningStore } from '../learning/useLearningStore'
import { backupLimit, backupSchema, parseBackup, type LearningBackup } from './backup'
import {
  backupToken,
  readLearningBackup,
  restoreLearningBackup,
  standAttempts,
} from './backupRepository'
import { downloadText } from '../../infrastructure/export/exportReport'
const workshop = useWorkshopStore(),
  learning = useLearningStore()
const pending = ref<LearningBackup>(),
  token = ref(''),
  consent = ref(false),
  replace = ref(false),
  busy = ref(false),
  error = ref(''),
  notice = ref('')
const standCount = ref<number>()
let generation = 0
onBeforeUnmount(() => generation++)
const contents = computed(() =>
  pending.value
    ? [
        ['Авторские лаборатории', pending.value.labs.length, workshop.customLabs.length],
        ['Авторские курсы', pending.value.courses.length, workshop.customCourses.length],
        ['Развилки', pending.value.graphs.length, workshop.customGraphs.length],
        ['Портфолио', pending.value.portfolio.length, workshop.portfolio.length],
        [
          'Отчёты настоящего стенда',
          pending.value.standAttempts.length,
          standCount.value ?? 'недоступно',
        ],
        [
          'Попытки практикума',
          pending.value.workshop.attempts.length,
          workshop.state.attempts.length,
        ],
        [
          'События базового журнала',
          pending.value.learning.journal.length,
          learning.state.journal.length,
        ],
      ]
    : [],
)
async function flush() {
  await Promise.all([workshop.flush(), learning.flush()])
}
async function exportBackup() {
  if (!consent.value || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await flush()
    const saved = await readLearningBackup()
    const value = backupSchema.parse({
      ...saved,
      learning: learning.state,
      workshop: workshop.state,
    })
    const text = JSON.stringify(value, null, 2)
    parseBackup(text)
    downloadText(text, 'workbench-learning-backup.json', 'application/json;charset=utf-8')
    notice.value =
      'Общая учебная копия скачана. Включён текущий прогресс, даже если автозапись выключена.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Экспорт недоступен.'
  } finally {
    busy.value = false
  }
}
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file || busy.value) return
  const current = ++generation
  pending.value = undefined
  replace.value = false
  error.value = ''
  notice.value = ''
  try {
    if (file.size > backupLimit) throw new Error('Лимит копии: 2 MiB.')
    const value = parseBackup(await file.text())
    await flush()
    standCount.value = await standAttempts.count()
    const expected = await backupToken()
    if (current === generation) {
      pending.value = value
      token.value = expected
    }
  } catch (e) {
    if (current === generation)
      error.value = e instanceof Error ? e.message : 'Копия не поддерживается.'
  } finally {
    input.value = ''
  }
}
function cancel() {
  generation++
  pending.value = undefined
  replace.value = false
}
async function restore() {
  if (!pending.value || !consent.value || !replace.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await flush()
    await restoreLearningBackup(pending.value, token.value)
    await Promise.all([workshop.reloadSaved(), learning.reloadSaved()])
    cancel()
    notice.value =
      'Учебная копия восстановлена целиком. Автозапись прогресса выключена. Перечитайте другие открытые вкладки.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Восстановление не удалось; транзакция отменена.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Общая резервная копия обучения</h2>
    <p>
      Один JSON содержит оба учебных журнала, авторские лаборатории, курсы, развилки, портфолио и
      отчёты стенда. Копия до 2 MiB; загружается и проверяется на этом устройстве.
    </p>
    <p>
      Рабочие кейсы, архивы диагностики, команды терминала, контрольные точки, ключи companion и
      офлайн-кэш управляются отдельно. Заметки автора переносятся как введены: проверьте их перед
      экспортом.
    </p>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" :disabled="busy" />Проверил учебную копию: в
      заметках нет чувствительных данных</label
    >
    <button class="button secondary" :disabled="busy || !consent" @click="exportBackup">
      Скачать общую учебную копию
    </button>
    <label
      >Открыть общую учебную копию<input
        type="file"
        accept=".json,application/json"
        :disabled="busy"
        @change="read"
    /></label>
    <div v-if="pending" class="terminal-checkpoint-preview">
      <h3>Предпросмотр восстановления</h3>
      <p>
        Дата копии: {{ pending.createdAt }}. Восстановление заменяет перечисленные учебные коллекции
        целиком, включая удаление отсутствующих в копии записей.
      </p>
      <table>
        <caption>
          Состав копии и текущего практикума
        </caption>
        <thead>
          <tr>
            <th>Коллекция</th>
            <th>В копии</th>
            <th>Сейчас</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in contents" :key="String(row[0])">
            <th>{{ row[0] }}</th>
            <td>{{ row[1] }}</td>
            <td>{{ row[2] }}</td>
          </tr>
        </tbody>
      </table>
      <details>
        <summary>Названия материалов и отчётов в копии</summary>
        <ul>
          <li
            v-for="item in [
              ...pending.labs,
              ...pending.courses,
              ...pending.graphs,
              ...pending.portfolio,
            ]"
            :key="item.id"
          >
            {{ item.title }}
          </li>
        </ul>
        <p>
          Базовый журнал: {{ pending.learning.journal.length }} событий. Направление:
          {{ pending.workshop.track }}.
        </p>
      </details>
      <label class="checkbox-label"
        ><input v-model="replace" type="checkbox" :disabled="busy" />Подтверждаю замену учебных
        коллекций; текущую копию сохранил при необходимости</label
      >
      <div class="button-row">
        <button class="button primary" :disabled="busy || !consent || !replace" @click="restore">
          Восстановить общую учебную копию</button
        ><button class="button ghost" :disabled="busy" @click="cancel">
          Отмена восстановления
        </button>
      </div>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
