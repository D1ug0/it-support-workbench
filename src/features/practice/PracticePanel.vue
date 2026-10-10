<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { practiceTasks, checkPractice } from './catalog'
import { useLearningStore } from '../learning/useLearningStore'
import { downloadText } from '../../infrastructure/export/exportReport'
const store = useLearningStore()
const topic = ref('Все')
const topics = ['Все', ...new Set(practiceTasks.map((t) => t.topic))]
const route = useRoute()
const selected = ref(
  practiceTasks.find((t) => t.id === route.query.task)?.id ?? practiceTasks[0]!.id,
)
watch(
  () => route.query.task,
  (value) => {
    const item = practiceTasks.find((t) => t.id === value)
    if (item) {
      topic.value = 'Все'
      selected.value = item.id
    }
  },
)
const task = computed(() => practiceTasks.find((t) => t.id === selected.value)!)
const tasks = computed(() =>
  practiceTasks.filter((t) => topic.value === 'Все' || topic.value === t.topic),
)
const input = ref('')
const hint = ref(false)
const result = ref<ReturnType<typeof checkPractice>>()
const busy = ref(false)
const error = ref('')
watch(selected, () => {
  input.value = ''
  hint.value = false
  result.value = undefined
})
watch(topic, () => {
  if (!tasks.value.some((t) => t.id === selected.value)) selected.value = tasks.value[0]!.id
})
async function submit() {
  if (busy.value || result.value?.valid) return
  result.value = checkPractice(task.value, input.value)
  if (!result.value.valid) return
  busy.value = true
  try {
    await store.complete(`PRACTICE-${task.value.id}`, result.value.correct ? 100 : 0)
  } catch {
    error.value = 'Не удалось обновить прогресс. Решение остаётся доступно.'
  } finally {
    busy.value = false
  }
}
function restart() {
  input.value = ''
  hint.value = false
  result.value = undefined
}
function exportAttempt() {
  downloadText(
    `# Самостоятельная практика: ${task.value.title}\n\n${task.value.prompt}\n\nОтвет: ${input.value}\nРезультат: ${result.value?.correct ? 'верно' : 'ошибка'}\nПодсказка: ${hint.value ? 'использована' : 'не использована'}\n\n${task.value.explanation}\n\nУчебное упражнение на синтетических данных.`,
    `workbench-practice-${task.value.id}.md`,
  )
}
</script>
<template>
  <section class="panel feature-section" aria-labelledby="practice-title">
    <span class="eyebrow">САМОСТОЯТЕЛЬНАЯ ПРАКТИКА</span>
    <h2 id="practice-title">Рассчитайте и составьте план</h2>
    <p>
      {{ practiceTasks.length }} заданий с вводом ответа. Сначала решите самостоятельно; объяснение
      появляется после проверки. Планы проверяют зависимости заданного случая, а не единственно
      возможный порядок любой диагностики.
    </p>
    <label
      >Направление практики<select v-model="topic" class="text-input" :disabled="busy">
        <option v-for="item in topics" :key="item">{{ item }}</option>
      </select></label
    >
  </section>
  <div class="practice-layout">
    <nav class="panel practice-task-list" aria-label="Задания самостоятельной практики">
      <button
        v-for="item in tasks"
        :key="item.id"
        class="button secondary small"
        :aria-pressed="selected === item.id"
        :disabled="busy"
        @click="selected = item.id"
      >
        {{ item.title }} ·
        {{ store.state.scenarios[`PRACTICE-${item.id}`]?.best === 100 ? 'решено' : 'к практике' }}
      </button>
    </nav>
    <section class="panel feature-section" aria-label="Самостоятельное задание">
      <span class="tag">{{ task.topic }}</span>
      <h3>{{ task.title }}</h3>
      <p>{{ task.prompt }}</p>
      <ol v-if="task.steps">
        <li v-for="step in task.steps" :key="step">{{ step }}</li>
      </ol>
      <form @submit.prevent="submit">
        <label
          >Самостоятельный ответ<input
            v-model="input"
            class="text-input"
            maxlength="200"
            :disabled="result?.valid || busy"
            :placeholder="task.format === 'order' ? 'Например: 2, 1, 4, 3' : 'Введите ответ'"
        /></label>
        <div class="button-row">
          <button class="button primary small" :disabled="busy || !store.ready || result?.valid">
            Проверить самостоятельный ответ</button
          ><button
            v-if="!result?.valid"
            type="button"
            class="button ghost small"
            @click="hint = true"
          >
            Подсказка к практике
          </button>
        </div>
      </form>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="hint" class="finding-limit">{{ task.hint }}</p>
      <div v-if="result" class="practice-feedback" role="status">
        <strong>{{
          !result.valid ? 'Уточните формат' : result.correct ? 'Задание решено' : 'Разберём решение'
        }}</strong>
        <p>{{ result.message }}</p>
      </div>
      <div v-if="result?.valid" class="button-row">
        <button class="button secondary small" :disabled="busy" @click="restart">
          Повторить задание</button
        ><button class="button secondary small" @click="exportAttempt">Скачать решение</button>
      </div>
      <RouterLink v-if="task.course" :to="{ path: '/learning', query: { course: task.course } }"
        >Изучить связанную тему</RouterLink
      >
      <p>
        Сохраняется оценка и дата попытки по общему переключателю прогресса. Введённый ответ и
        подсказка остаются в памяти; экспорт содержит ваш ответ.
      </p>
    </section>
  </div>
</template>
