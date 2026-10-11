<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { todayTask } from './learningFlow'
import { describeLearningEvent, recentLearningEvents } from './learningHistory'
import { professionalAttempts, professionalAttemptSchema } from './professional'
import { remediationRecommendations } from './remediation'
defineProps<{ compact?: boolean }>()
const store = useWorkshopStore()
const incidentId = ref<string>()
const incidentError = ref('')
const now = ref(Date.now())
watch(
  () => store.state,
  () => (now.value = Date.now()),
  { flush: 'sync' },
)
let timer: ReturnType<typeof globalThis.setInterval> | undefined
onBeforeUnmount(() => globalThis.clearInterval(timer))
onMounted(async () => {
  timer = globalThis.setInterval(() => (now.value = Date.now()), 60_000)
  await store.initialize()
  try {
    incidentId.value = (await professionalAttempts.toArray())
      .flatMap((v) => {
        const parsed = professionalAttemptSchema.safeParse(v)
        return parsed.success && parsed.data.status === 'active' ? [parsed.data] : []
      })
      .sort((a, b) => Date.parse(a.updatedAt ?? a.at) - Date.parse(b.updatedAt ?? b.at))
      .at(-1)?.id
  } catch {
    incidentError.value = 'Не удалось прочитать сохранённые инциденты. Остальное обучение доступно.'
  }
})
const task = computed(() => (store.ready ? todayTask(store.state, now.value) : undefined))
const scheduled = computed(() =>
  store.ready
    ? remediationRecommendations(store.state, now.value).filter((r) => r.state === 'waiting')
    : [],
)
const history = computed(() =>
  recentLearningEvents(store.state.events).map((event) => ({
    ...event,
    ...describeLearningEvent(event, {
      labs: store.customLabs,
      graphs: store.customGraphs,
      courses: store.customCourses,
    }),
  })),
)
const formatDate = (at: string) =>
  new Date(at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
</script>
<template>
  <section
    class="panel feature-section continue-learning-card"
    aria-labelledby="continue-learning-title"
    :aria-busy="!store.ready"
  >
    <span class="eyebrow">ОДИН ПОНЯТНЫЙ СЛЕДУЮЩИЙ ШАГ</span>
    <h2 id="continue-learning-title">Продолжить обучение</h2>
    <p v-if="!task" role="status">Загружаем сохранённый прогресс…</p>
    <template v-else>
      <p v-if="store.error" role="alert">{{ store.error }}</p>
      <p v-if="incidentError" role="alert">{{ incidentError }}</p>
      <h3 class="continue-task-title">{{ task.title }}</h3>
      <p>{{ task.reason }}</p>
      <p>
        Сегодня: {{ task.minutes }} мин. Предпосылки: {{ task.prerequisite }}. Результат:
        {{ task.outcome }}.
      </p>
      <div class="button-row">
        <RouterLink class="button primary" :to="task.url">Открыть сегодняшнюю задачу</RouterLink
        ><RouterLink v-if="task.resume" class="button secondary" :to="task.resume"
          >Вернуться к месту в курсе</RouterLink
        ><RouterLink
          v-if="incidentId"
          class="button secondary"
          :to="`/learning?view=workshop&workshop=professional&attempt=${incidentId}`"
          >Продолжить сохранённый инцидент</RouterLink
        >
      </div>
      <p v-for="r in scheduled" :key="r.lesson.id">
        {{ r.lesson.title }}: новая ситуация решена. Проверка после перерыва —
        <time :datetime="new Date(r.dueAt!).toISOString()">{{
          formatDate(new Date(r.dueAt!).toISOString())
        }}</time
        >.
        <RouterLink :to="`/learning?view=workshop&workshop=error-practice&error=${r.lesson.id}`"
          >Посмотреть разбор</RouterLink
        >
      </p>
      <details v-if="!compact">
        <summary>Единая история обучения ({{ store.state.events.length }})</summary>
        <p>
          Последние 30 попыток из всех разделов, сначала новые. Даты зависят от часов устройства.
          Старые результаты остаются в исходных журналах. Отчёт стенда — самостоятельная запись без
          автоматической аттестации.
        </p>
        <p v-if="!history.length">
          Начните занятие — здесь появятся задания, даты и результаты попыток.
        </p>
        <ol v-else class="learning-event-list continue-learning-history">
          <li v-for="e in history" :key="`${e.module}:${e.attemptId}`">
            <div>
              <strong>{{ e.title }}</strong>
              <p>
                {{ e.module }}<span v-if="e.skill"> · {{ e.skill }}</span>
              </p>
              <p>
                {{ e.outcome }}<span v-if="e.score !== null"> · {{ e.score }} / 100</span>
              </p>
              <ul v-if="e.errors.length">
                <li v-for="error in e.errors" :key="error">{{ error }}</li>
              </ul>
            </div>
            <time :datetime="e.at">{{ formatDate(e.at) }}</time>
          </li>
        </ol>
      </details>
    </template>
  </section>
</template>
