<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { questions, quizCategories } from '../features/learning/questions'
import { useLearningStore } from '../features/learning/useLearningStore'
import { parseProgress } from '../features/learning/progress'
import type { LearningProgress } from '../features/learning/progress'
import { scenarios } from '../features/simulator/scenarios'
import { downloadText } from '../infrastructure/export/exportReport'
import { buildLearningPath } from '../features/learning/path'
import { knowledgeEntries } from '../features/knowledge/catalog'
const store = useLearningStore()
onMounted(() => void store.initialize())
const category = ref('Все')
const weakOnly = ref(false)
const deck = ref<string[]>([])
const cursor = ref(0)
const choice = ref<number>()
const imported = ref<LearningProgress>()
const error = ref('')
let readVersion = 0
onBeforeUnmount(() => readVersion++)
const candidates = computed(() =>
  questions.filter(
    (q) =>
      (category.value === 'Все' || q.category === category.value) &&
      (!weakOnly.value || store.state.answers[q.id]?.lastCorrect === false),
  ),
)
const question = computed(() => questions.find((q) => q.id === deck.value[cursor.value]))
const mastered = computed(
  () => questions.filter((q) => store.state.answers[q.id]?.lastCorrect).length,
)
const completed = computed(() => Object.keys(store.state.scenarios).length)
const path = computed(() => buildLearningPath(store.state))
const route = useRoute()
watch(
  () => route.query.topic,
  (value) => {
    if (typeof value === 'string' && quizCategories.includes(value)) category.value = value
  },
  { immediate: true },
)
function readingPath(id: string) {
  return {
    path: '/knowledge',
    query: { q: knowledgeEntries.find((entry) => entry.id === id)!.title },
  }
}
async function startTopic(topic: string, mistakes = false) {
  category.value = topic
  weakOnly.value = mistakes
  start()
  await nextTick()
  document.getElementById('quiz-section')?.focus()
}
function start() {
  deck.value = candidates.value.map((q) => q.id)
  cursor.value = 0
  choice.value = undefined
}
function answer(index: number) {
  if (!question.value || choice.value !== undefined) return
  choice.value = index
  void store.answer(question.value.id, index === question.value.correct)
}
function next() {
  cursor.value++
  choice.value = undefined
}
function finish() {
  deck.value = []
  cursor.value = 0
  choice.value = undefined
}
async function toggle(event: Event) {
  await store.setEnabled((event.target as HTMLInputElement).checked)
}
async function clear() {
  if (window.confirm('Удалить весь учебный прогресс и отключить его сохранение?'))
    await store.clear()
}
async function read(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const version = ++readVersion
  imported.value = undefined
  error.value = ''
  try {
    if (file.size > 256 * 1024) throw new Error('Файл превышает 256 KiB.')
    const value = parseProgress(
      await file.text(),
      questions.map((q) => q.id),
      scenarios.map((s) => s.id),
    )
    if (version === readVersion) imported.value = value
  } catch (cause) {
    if (version === readVersion)
      error.value = cause instanceof Error ? cause.message : 'Ошибка импорта.'
  }
}
async function apply() {
  if (!imported.value) return
  await store.replace(imported.value)
  imported.value = undefined
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">МАРШРУТ ОБУЧЕНИЯ</span>
      <h1>Знания превращаются в навык<span class="accent">.</span></h1>
      <p>Повторение, разбор ошибок и измеримый учебный прогресс.</p>
    </div>
    <span class="tag">{{ questions.length }} ВОПРОСОВ · {{ quizCategories.length }} ТЕМ</span>
  </div>
  <section class="panel feature-section">
    <div class="learning-metrics">
      <div>
        <strong>{{ mastered }} / {{ questions.length }}</strong
        ><span>последних верных ответов</span>
      </div>
      <div>
        <strong>{{ completed }} / {{ scenarios.length }}</strong
        ><span>пройденных сценариев</span>
      </div>
      <div>
        <strong>{{
          Object.values(store.state.answers).reduce((sum, a) => sum + a.attempts, 0)
        }}</strong
        ><span>попыток ответа</span>
      </div>
    </div>
    <label class="checkbox-label"
      ><input :checked="store.enabled" :disabled="!store.ready" type="checkbox" @change="toggle" />
      Сохранять учебный прогресс на этом устройстве</label
    >
    <p>
      По умолчанию прогресс остаётся в памяти. При включении сохраняются только ID заданий, счётчики
      и оценки; диагностические логи сюда не попадают. Отключение останавливает запись, прежний
      прогресс удаляется отдельной кнопкой.
    </p>
    <p v-if="store.error" role="alert" class="form-error">{{ store.error }}</p>
  </section>
  <section
    class="panel feature-section learning-recommendation"
    aria-labelledby="recommendation-title"
  >
    <span class="eyebrow">СЛЕДУЮЩИЙ ШАГ</span>
    <h2 id="recommendation-title">
      {{ path.recommended ? `Тема: ${path.recommended.topic}` : 'Закрепите знания практикой' }}
    </h2>
    <p>{{ path.reason }}</p>
    <div class="button-row">
      <button
        v-if="path.recommended"
        class="button primary small"
        :disabled="!store.ready"
        @click="startTopic(path.recommended.topic, path.recommended.mistakes > 0)"
      >
        {{ path.recommended.mistakes ? 'Разобрать последние ошибки' : 'Проверить тему' }}</button
      ><RouterLink
        class="button secondary small"
        :to="path.recommended?.practice ?? '/simulator'"
        >{{ path.recommended?.practiceLabel ?? 'Перейти к инцидентам' }}</RouterLink
      >
    </div>
  </section>
  <p class="path-explanation">
    Проходите темы по порядку: прочитать → проверить понимание → применить на практике. Доступны все
    темы; верный последний ответ отмечает повторение, а не сертификат компетентности.
  </p>
  <div class="learning-path">
    <article
      v-for="item in path.modules"
      :key="item.topic"
      class="panel feature-section learning-module"
    >
      <span class="tag"
        >{{ String(item.index).padStart(2, '0') }} · {{ item.status }} · {{ item.correct }} /
        {{ item.total }}</span
      >
      <h2>{{ item.topic }}</h2>
      <p>{{ item.goal }}</p>
      <progress :value="item.correct" :max="item.total" :aria-label="`Прогресс: ${item.topic}`" />
      <div class="module-actions">
        <RouterLink :to="readingPath(item.reading)">1. Прочитать объяснение</RouterLink
        ><button
          class="button secondary small"
          :disabled="!store.ready"
          @click="startTopic(item.topic)"
        >
          2. Проверить: {{ item.topic }}</button
        ><RouterLink :to="item.practice">3. {{ item.practiceLabel }}</RouterLink>
      </div>
      <small v-if="item.mistakes"
        >Последних ошибок: {{ item.mistakes }}. Можно повторить их отдельно.</small
      >
    </article>
  </div>
  <section
    id="quiz-section"
    class="panel feature-section quiz-section"
    tabindex="-1"
    aria-label="Проверка понимания"
  >
    <h2>Проверка понимания</h2>
    <template v-if="!deck.length"
      ><div class="form-grid">
        <label
          >Тема вопросов<select v-model="category" class="text-input">
            <option>Все</option>
            <option v-for="item in quizCategories" :key="item">{{ item }}</option>
          </select></label
        ><label class="checkbox-label"
          ><input v-model="weakOnly" type="checkbox" /> Только последние ошибки</label
        >
      </div>
      <p>
        {{ candidates.length }} вопросов доступно. Ответ раскрывает объяснение и источник; ошибки
        можно повторить.
      </p>
      <button class="button primary" :disabled="!candidates.length || !store.ready" @click="start">
        Начать тест
      </button></template
    ><template v-else-if="question"
      ><span class="tag">{{ question.category }} · {{ cursor + 1 }} / {{ deck.length }}</span>
      <h3 class="quiz-prompt">{{ question.prompt }}</h3>
      <div class="quiz-options">
        <button
          v-for="(value, index) in question.choices"
          :key="index"
          :disabled="choice !== undefined"
          :class="{
            correct: choice !== undefined && index === question.correct,
            incorrect: choice === index && index !== question.correct,
          }"
          @click="answer(index)"
        >
          {{ value }}
        </button>
      </div>
      <div v-if="choice !== undefined" class="quiz-explanation" role="status">
        <strong>{{ choice === question.correct ? 'Верно' : 'Разберём ошибку' }}</strong>
        <p>{{ question.explanation }}</p>
        <a :href="question.source.url" target="_blank" rel="noopener noreferrer">{{
          question.source.title
        }}</a
        ><button class="button primary small" @click="next">Следующий вопрос</button>
      </div>
      <button class="button ghost small" @click="finish">Завершить тест</button></template
    ><template v-else
      ><h3>Все вопросы этой подборки пройдены</h3>
      <p>Повторите ошибки или перейдите к практическому тренажёру.</p>
      <div class="button-row">
        <button class="button primary small" @click="finish">Вернуться к темам</button
        ><RouterLink class="button secondary small" to="/simulator">Открыть тренажёр</RouterLink>
      </div></template
    >
  </section>
  <section class="panel feature-section">
    <h2>История практики</h2>
    <p v-if="!completed">Пройдите сценарий в тренажёре — здесь появятся попытки и лучшая оценка.</p>
    <div
      v-for="scenario in scenarios.filter((s) => store.state.scenarios[s.id])"
      :key="scenario.id"
      class="history-row"
    >
      <span>{{ scenario.title }}</span
      ><strong>{{ store.state.scenarios[scenario.id]?.best }} / 100</strong
      ><span>{{ store.state.scenarios[scenario.id]?.attempts }} попыток</span>
    </div>
    <RouterLink to="/playbooks">Открыть практические чек-листы</RouterLink>
  </section>
  <section class="panel feature-section">
    <h2>Перенос и управление прогрессом</h2>
    <div class="button-row">
      <button
        class="button secondary small"
        @click="
          downloadText(
            JSON.stringify(store.state, null, 2),
            'workbench-learning.json',
            'application/json',
          )
        "
      >
        Экспорт прогресса</button
      ><label class="button secondary small file-label"
        >Импорт прогресса<input
          type="file"
          accept=".json"
          aria-label="Импорт учебного прогресса"
          @change="read" /></label
      ><button class="button ghost small" @click="clear">Удалить учебный прогресс</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-if="imported" class="import-preview">
      <h3>Предпросмотр прогресса</h3>
      <p>
        Вопросов: {{ Object.keys(imported.answers).length }}, сценариев:
        {{ Object.keys(imported.scenarios).length }}. Текущие счётчики будут заменены.
      </p>
      <button class="button primary small" @click="apply">Применить импорт прогресса</button
      ><button class="button ghost small" @click="imported = undefined">
        Отмена импорта прогресса
      </button>
    </div>
  </section>
</template>
