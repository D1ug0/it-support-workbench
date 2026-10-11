<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { saveNotice } from '../../shared/persistence'
import { onBeforeUnmount, defineAsyncComponent } from 'vue'
import { parseWorkshopProgress, buildSkillStatuses, skills, type WorkshopProgress } from './skills'
import { downloadText } from '../../infrastructure/export/exportReport'
const store = useWorkshopStore()
const notice = ref('')
const TeacherPanel = defineAsyncComponent(() => import('./TeacherPanel.vue'))
const CompanionPanel = defineAsyncComponent(() => import('./CompanionPanel.vue'))
const error = ref(''),
  pending = ref<WorkshopProgress>(),
  busy = ref(false)
const statuses = computed(() => buildSkillStatuses(store.state))
function exportProgress() {
  downloadText(
    JSON.stringify(store.state),
    'workbench-workshop-progress.json',
    'application/json;charset=utf-8',
  )
}
let version = 0
onBeforeUnmount(() => version++)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const ticket = ++version
  pending.value = undefined
  try {
    if (file.size > 12 * 1024 * 1024) throw new Error('Лимит 12 MiB.')
    const value = parseWorkshopProgress(await file.text())
    if (ticket === version) {
      pending.value = value
      error.value = ''
    }
  } catch (e) {
    if (ticket === version) error.value = e instanceof Error ? e.message : 'Ошибка импорта.'
  } finally {
    input.value = ''
  }
}
async function restore() {
  if (busy.value || !pending.value) return
  busy.value = true
  try {
    const result = await store.replace(pending.value)
    if (result.status !== 'failed') pending.value = undefined
    notice.value = saveNotice(result, 'Прогресс практикума восстановлен.')
  } catch {
    error.value = 'Не удалось восстановить прогресс.'
  } finally {
    busy.value = false
  }
}
async function clear() {
  if (busy.value) return
  busy.value = true
  try {
    await store.clear()
    notice.value = 'Прогресс практикума удалён; лаборатории и отчёты сохраняются отдельно.'
  } catch {
    error.value = 'Удаление не удалось.'
  } finally {
    busy.value = false
  }
}
function exportTeacher() {
  downloadText(
    [
      '# Обзор навыков',
      'Анонимная учебная статистика; не является независимой аттестацией.',
      ...skills.map(
        (s) =>
          `- ${s.title}: ${statuses.value[s.id].level}; попыток ${statuses.value[s.id].attempts}`,
      ),
    ].join('\n'),
    'workbench-skills-summary.md',
  )
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Обмен прогрессом и работа преподавателя</h3>
    <p>
      Перенос между устройствами через JSON выполняется вручную. Предпросмотр отделён от замены
      данных. Отдельный companion ниже позволяет явно подключить собственный сервис; перенос JSON
      остаётся доступным без него.
    </p>
    <div class="button-row">
      <button class="button secondary" @click="exportProgress">Экспорт прогресса практикума</button
      ><button class="button ghost" @click="exportTeacher">Экспорт обзора навыков</button>
    </div>
    <label
      >Импорт прогресса практикума<input
        type="file"
        accept=".json,application/json"
        :disabled="busy"
        @change="read"
    /></label>
    <div v-if="pending" class="terminal-checkpoint-preview">
      <p>
        Будут заменены результаты практикума: {{ pending.attempts.length }} попыток,
        {{ pending.read.length }} изученных материалов, направление {{ pending.track }}. Лаборатории
        и портфолио не заменяются.
      </p>
      <button class="button primary" :disabled="busy" @click="restore">
        Подтвердить замену прогресса практикума</button
      ><button class="button ghost" :disabled="busy" @click="pending = undefined">
        Отменить замену
      </button>
    </div>
    <details>
      <summary>Удалить только прогресс практикума</summary>
      <p>Действие удаляет результаты навыков и попыток. Сначала можно скачать JSON.</p>
      <button class="button ghost" :disabled="busy" @click="clear">
        Удалить прогресс практикума
      </button>
    </details>
    <h4>Процесс преподавателя</h4>
    <ol>
      <li>Создать лаборатории и графы с критериями и объяснениями.</li>
      <li>Передать ученику JSON-пакеты.</li>
      <li>Получить отчёт расследования и обзор навыков.</li>
      <li>Проверить доказательства и назначить новый самостоятельный вариант.</li>
    </ol>
    <p>
      Критерии сценариев и локальные оценки редактируемы. Для независимой аттестации нужны отдельные
      правила доверия и проверка работы.
    </p>
  </section>
  <TeacherPanel /><CompanionPanel />

  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="notice" role="status">{{ notice }}</p>
</template>
