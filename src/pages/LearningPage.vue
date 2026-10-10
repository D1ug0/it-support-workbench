<script setup lang="ts">
import ContinueLearning from '../features/workshop/ContinueLearning.vue'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  nextTick,
  defineAsyncComponent,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { questions, quizCategories } from '../features/learning/questions'
import { useLearningStore } from '../features/learning/useLearningStore'
import { parseProgress } from '../features/learning/progress'
import type { LearningProgress } from '../features/learning/progress'
import { scenarios } from '../features/simulator/scenarios'
import { downloadText } from '../infrastructure/export/exportReport'
import { buildLearningPath } from '../features/learning/path'
import { knowledgeEntries } from '../features/knowledge/catalog'
import AcademyPanel from '../features/academy/AcademyPanel.vue'
import { academyCourses, academyQuestions } from '../features/academy/catalog'
import { allLearningQuestions } from '../features/learning/catalog'
import { buildReviewQueue } from '../features/learning/review'
import PracticePanel from '../features/practice/PracticePanel.vue'
import { practiceTasks } from '../features/practice/catalog'
import LearningJournal from '../features/learning/LearningJournal.vue'
import { labIds } from '../features/terminal/catalog'
const WorkshopPanel = defineAsyncComponent(() => import('../features/workshop/WorkshopPanel.vue'))
const store = useLearningStore()
onMounted(() => void store.initialize())
const category = ref('Все')
const weakOnly = ref(false)
const deck = ref<string[]>([])
const cursor = ref(0)
const choice = ref<number>()
const answering = ref(false)
const imported = ref<LearningProgress>()
const error = ref('')
let readVersion = 0
const now = ref(Date.now())
let clock: ReturnType<typeof globalThis.setInterval> | undefined
onMounted(() => {
  clock = globalThis.setInterval(() => (now.value = Date.now()), 60_000)
})
onBeforeUnmount(() => {
  readVersion++
  globalThis.clearInterval(clock)
})
const due = computed(() => buildReviewQueue(store.state, allLearningQuestions, now.value))
const nextDue = computed(
  () =>
    Object.values(store.state.reviews)
      .map((r) => Date.parse(r.dueAt))
      .filter((t) => t > now.value)
      .sort((a, b) => a - b)[0],
)
const formatDate = (value: number) =>
  new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const candidates = computed(() =>
  questions.filter(
    (q) =>
      (category.value === 'Все' || q.category === category.value) &&
      (!weakOnly.value || store.state.answers[q.id]?.lastCorrect === false),
  ),
)
const question = computed(() => allLearningQuestions.find((q) => q.id === deck.value[cursor.value]))
const mastered = computed(
  () => questions.filter((q) => store.state.answers[q.id]?.lastCorrect).length,
)
const completed = computed(() => scenarios.filter((s) => store.state.scenarios[s.id]).length)
const path = computed(() => buildLearningPath(store.state))
const route = useRoute()
const router = useRouter()
const advanced = computed(
  () => route.query.view === 'advanced' || academyCourses.some((c) => c.id === route.query.course),
)
const practice = computed(() => !advanced.value && route.query.view === 'practice')
const journal = computed(() => !advanced.value && route.query.view === 'journal')
const workshop = computed(() => route.query.view === 'workshop')
const basic = computed(
  () => !advanced.value && !practice.value && !journal.value && !workshop.value,
)
watch(advanced, () => finish())
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
async function answer(index: number) {
  if (!question.value || choice.value !== undefined || answering.value || !store.ready) return
  choice.value = index
  answering.value = true
  try {
    await store.answer(question.value.id, index === question.value.correct)
    now.value = Date.now()
  } catch {
    error.value = 'Не удалось обновить прогресс. Экспортируйте текущие результаты.'
  } finally {
    answering.value = false
  }
}
async function startReview() {
  const ids = due.value.map((q) => q.id)
  await router.push('/learning')
  deck.value = ids
  cursor.value = 0
  choice.value = undefined
  await nextTick()
  document.getElementById('quiz-section')?.focus()
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
      allLearningQuestions.map((q) => q.id),
      [
        ...labIds,
        ...scenarios.map((s) => s.id),
        ...academyCourses.map((c) => `LAB-${c.id}`),
        ...practiceTasks.map((t) => `PRACTICE-${t.id}`),
      ],
    )
    if (version === readVersion) imported.value = value
  } catch (cause) {
    if (version === readVersion)
      error.value = cause instanceof Error ? cause.message : 'Ошибка импорта.'
  }
}
async function apply() {
  if (!imported.value) return
  try {
    await store.replace(imported.value)
    imported.value = undefined
    error.value = ''
  } catch {
    error.value = 'Не удалось применить прогресс. Текущие данные не заменены.'
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">МАРШРУТ ОБУЧЕНИЯ</span>
      <h1>Знания превращаются в навык<span class="accent">.</span></h1>
      <p>Повторение, разбор ошибок и измеримый учебный прогресс.</p>
    </div>
    <span class="tag"
      >{{ questions.length }} БАЗОВЫХ ВОПРОСОВ · {{ academyQuestions.length }} ПРАКТИЧЕСКИХ
      РЕШЕНИЙ</span
    >
  </div>
  <ContinueLearning v-if="!workshop" />

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
      и оценки, даты повторений, последние 500 учебных событий и цель недели; диагностические логи
      сюда не попадают. Отключение останавливает запись, прежний прогресс удаляется отдельной
      кнопкой.
    </p>
    <p v-if="store.error" role="alert" class="form-error">{{ store.error }}</p>
    <p
      v-if="store.ready && store.enabled && !store.error"
      role="status"
      data-testid="learning-save-status"
    >
      {{
        store.saving
          ? 'Сохраняем прогресс… Не перезагружайте вкладку.'
          : 'Прогресс сохранён на устройстве.'
      }}
    </p>
  </section>
  <nav class="learning-view-nav button-row" aria-label="Учебные направления">
    <RouterLink class="button secondary" to="/terminal">Практика в терминале</RouterLink>
    <RouterLink
      :class="['button', basic ? 'primary' : 'secondary']"
      :aria-current="basic ? 'page' : undefined"
      to="/learning"
      >Базовый маршрут</RouterLink
    >
    <RouterLink
      :class="['button', advanced ? 'primary' : 'secondary']"
      :aria-current="advanced ? 'page' : undefined"
      to="/learning?view=advanced"
      >Продвинутый курс</RouterLink
    >
    <RouterLink
      :class="['button', practice ? 'primary' : 'secondary']"
      :aria-current="practice ? 'page' : undefined"
      to="/learning?view=practice"
      >Самостоятельная практика</RouterLink
    >
    <RouterLink
      :class="['button', journal ? 'primary' : 'secondary']"
      :aria-current="journal ? 'page' : undefined"
      to="/learning?view=journal"
      >Журнал обучения</RouterLink
    >
    <RouterLink :class="['button', workshop ? 'primary' : 'secondary']" to="/learning?view=workshop"
      >Практикум развития</RouterLink
    >
  </nav>
  <section
    v-if="!workshop"
    class="panel feature-section review-section"
    aria-labelledby="review-title"
  >
    <span class="eyebrow">ИНТЕРВАЛЬНОЕ ПОВТОРЕНИЕ</span>
    <h2 id="review-title">К повторению сейчас: {{ due.length }}</h2>
    <p>
      После верного ответа: 1 → 3 → 7 → 14 → 30 дней. После ошибки — через 10 минут; последние
      ошибки можно разобрать сразу. Ответы раньше срока не увеличивают интервал. Это учебное
      расписание, не оценка квалификации.
    </p>
    <p v-if="!due.length">
      {{
        nextDue
          ? `Ближайшее повторение: ${formatDate(nextDue)}.`
          : 'Пройдите тест или лабораторную — появится расписание.'
      }}
    </p>
    <template v-else
      ><p>
        В подборке есть базовые и продвинутые задания. Старый прогресс без дат также можно
        повторить.
      </p>
      <ul>
        <li v-for="q in due.slice(0, 3)" :key="q.id">{{ q.category }}: {{ q.prompt }}</li>
      </ul>
      <button class="button primary small" :disabled="!store.ready" @click="startReview">
        Повторить по расписанию
      </button>
    </template>
    <button class="button ghost small" @click="now = Date.now()">Обновить расписание</button>
  </section>
  <WorkshopPanel v-if="workshop" />
  <AcademyPanel v-if="advanced" />
  <PracticePanel v-if="practice" />
  <LearningJournal v-if="journal" />
  <section
    v-if="basic"
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
  <p v-if="basic" class="path-explanation">
    Проходите темы по порядку: прочитать → проверить понимание → применить на практике. Доступны все
    темы; верный последний ответ отмечает повторение, а не сертификат компетентности.
  </p>
  <div v-if="basic" class="learning-path">
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
    v-if="basic"
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
          :disabled="choice !== undefined || answering || !store.ready"
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
        <p v-if="store.state.reviews[question.id]">
          Следующее повторение:
          {{ formatDate(Date.parse(store.state.reviews[question.id]!.dueAt)) }}.
        </p>
        <a :href="question.source.url" target="_blank" rel="noopener noreferrer">{{
          question.source.title
        }}</a
        ><button class="button primary small" :disabled="answering" @click="next">
          Следующий вопрос
        </button>
      </div>
      <button class="button ghost small" :disabled="answering" @click="finish">
        Завершить тест
      </button></template
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
    <p v-if="!Object.keys(store.state.scenarios).length">
      Пройдите сценарий или лабораторную — здесь появятся попытки и лучшая оценка.
    </p>
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
    <div
      v-for="course in academyCourses.filter((c) => store.state.scenarios[`LAB-${c.id}`])"
      :key="course.id"
      class="history-row"
    >
      <RouterLink :to="{ path: '/learning', query: { course: course.id } }">{{
        course.title
      }}</RouterLink>
      <strong>{{ store.state.scenarios[`LAB-${course.id}`]?.best }} / 100</strong>
      <span>{{ store.state.scenarios[`LAB-${course.id}`]?.attempts }} попыток лабораторной</span>
    </div>
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
