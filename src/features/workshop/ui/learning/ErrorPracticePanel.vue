<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkshopStore } from '../../model/useWorkshopStore'
import type { LearningErrorId } from '../../domain/learningErrors'
import { remediationRecommendations } from '../../domain/remediation'
import { remediationChecks, remediationPassed } from '../../domain/remediationCatalog'
import { describeLearningEvent } from '../../application/learningHistory'
import type { SaveResult } from '../../../../shared/persistence'

const store = useWorkshopStore(),
  route = useRoute(),
  router = useRouter()
const now = ref(Date.now()),
  step = ref(0),
  busy = ref(false),
  notice = ref(''),
  error = ref('')
const questionElement = ref<HTMLElement>()
watch(
  () => store.state,
  () => (now.value = Date.now()),
  { flush: 'sync' },
)
let timer: ReturnType<typeof globalThis.setInterval> | undefined,
  generation = 0
onMounted(async () => {
  timer = globalThis.setInterval(() => (now.value = Date.now()), 60_000)
  await store.initialize()
})
onBeforeUnmount(() => {
  generation++
  globalThis.clearInterval(timer)
})
const recommendations = computed(() => remediationRecommendations(store.state, now.value))
const selected = computed(
  () =>
    recommendations.value.find((r) => r.lesson.id === route.query.error) ??
    recommendations.value[0],
)
const attempt = computed(() => selected.value?.latest)
const checks = computed(() => (attempt.value ? remediationChecks(attempt.value) : undefined))
const question = computed(() => checks.value?.[step.value])
const firstAnswer = computed(() => attempt.value?.answers[step.value])
watch(
  () => [route.query.error, store.ready],
  () => {
    generation++
    busy.value = false
    step.value = Math.min(attempt.value?.answers.length ?? 0, 1)
    notice.value = ''
    error.value = ''
  },
  { immediate: true },
)
function saveNotice(result: SaveResult) {
  return result.status === 'saved'
    ? 'Ответы сохранены на устройстве.'
    : result.status === 'failed'
      ? `Не удалось сохранить: ${result.error}. Результат остаётся в памяти; экспортируйте прогресс.`
      : 'Результат в памяти вкладки. Для продолжения после перезагрузки включите сохранение практикума.'
}
const formatDate = (at: number | string) =>
  new Date(at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
async function select(errorId: LearningErrorId) {
  await router.replace({
    path: '/learning',
    query: { view: 'workshop', workshop: 'error-practice', error: errorId },
  })
}
async function start() {
  if (!store.ready || busy.value || !selected.value) return
  const ticket = generation,
    id = selected.value.lesson.id
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await store.startErrorPractice(id)
    if (ticket !== generation) return
    now.value = Date.now()
    step.value = Math.min(attempt.value?.answers.length ?? 0, 1)
    notice.value = saveNotice(result.saved)
    await nextTick()
    questionElement.value?.focus()
  } catch (cause) {
    if (ticket === generation)
      error.value = cause instanceof Error ? cause.message : 'Занятие недоступно.'
  } finally {
    if (ticket === generation) busy.value = false
  }
}
async function answer(choice: number) {
  if (!attempt.value || firstAnswer.value || busy.value || !store.ready) return
  const ticket = generation,
    id = attempt.value.id,
    index = step.value
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const saved = await store.answerErrorPractice(id, index, choice)
    if (ticket === generation) {
      now.value = Date.now()
      notice.value = saveNotice(saved)
    }
  } catch (cause) {
    if (ticket === generation)
      error.value = cause instanceof Error ? cause.message : 'Ответ не принят.'
  } finally {
    if (ticket === generation) busy.value = false
  }
}
async function next() {
  step.value++
  await nextTick()
  questionElement.value?.focus()
}
</script>
<template>
  <section
    class="panel feature-section"
    aria-labelledby="error-practice-title"
    :aria-busy="!store.ready"
  >
    <h3 id="error-practice-title">Короткая тренировка ошибки</h3>
    <p>
      5–10 минут: разбор → новая ситуация → выбор доказательства. Через сутки — проверка в другом
      контексте. Это работа над конкретным затруднением, отдельная от оценки всего навыка DNS.
    </p>
    <p v-if="!store.ready" role="status">Загружаем результаты…</p>
    <template v-else>
      <p v-if="!recommendations.length">
        Пока нет результатов с одной из трёх DNS-ошибок. Начните с материала о кэше или базовых
        вопросов DNS.
      </p>
      <div v-if="!recommendations.length" class="button-row">
        <RouterLink class="button secondary" to="/learning?view=workshop&lesson=DNS"
          >Материал DNS и кэш</RouterLink
        >
        <RouterLink class="button secondary" to="/learning?topic=DNS">Вопросы DNS</RouterLink>
      </div>
      <nav v-else class="learning-mode-nav" aria-label="DNS-затруднения">
        <button
          v-for="r in recommendations"
          :key="r.lesson.id"
          class="button secondary"
          :disabled="busy"
          :aria-pressed="selected?.lesson.id === r.lesson.id"
          @click="select(r.lesson.id)"
        >
          {{ r.lesson.title }}
        </button>
      </nav>
      <template v-if="selected">
        <h4>{{ selected.lesson.title }}</h4>
        <p>
          Причина назначения: ошибка в задании «{{ describeLearningEvent(selected.source).title }}»,
          <time :datetime="selected.source.at">{{ formatDate(selected.source.at) }}</time
          >.
        </p>
        <ul v-if="selected.source.errors.length">
          <li v-for="text in selected.source.errors" :key="text">{{ text }}</li>
        </ul>
        <p v-if="!attempt || attempt.phase === 'practice'">{{ selected.lesson.explanation }}</p>
        <p v-else>
          Сначала решите обе задачи самостоятельно. Разбор ответов и объяснение откроются после
          попытки.
        </p>
        <p>Цель: {{ selected.lesson.competency }}.</p>
        <p v-if="selected.state === 'waiting'" role="status">
          Новая ситуация решена. Отложенная проверка доступна {{ formatDate(selected.dueAt!) }}.
          Активное назначение закрыто; история исходной ошибки сохранена.
        </p>
        <p v-if="selected.state === 'verified'" role="status">
          Исправление ошибки подтверждено в другом контексте после перерыва. Освоение всего навыка
          проверяется отдельно.
        </p>
        <button
          v-if="selected.state === 'practice' || selected.state === 'review'"
          class="button primary"
          :disabled="busy"
          @click="start"
        >
          {{
            selected.state === 'review'
              ? 'Начать отложенную проверку'
              : attempt
                ? 'Начать другую ситуацию'
                : 'Начать короткое занятие'
          }}
        </button>
        <article
          v-if="attempt && !attempt.completedAt && question"
          ref="questionElement"
          class="workshop-item"
          tabindex="-1"
          aria-label="Текущая задача"
        >
          <h4>
            {{ attempt.phase === 'review' ? 'Отложенная проверка' : 'Новая ситуация' }} ·
            {{ step + 1 }} из 2
          </h4>
          <p>{{ question.prompt }}</p>
          <div class="workshop-choices">
            <button
              v-for="(option, i) in question.choices"
              :key="i"
              class="button secondary"
              :disabled="busy || !!firstAnswer"
              :aria-pressed="firstAnswer?.choice === i"
              @click="answer(i)"
            >
              {{ option }}
            </button>
          </div>
          <p v-if="firstAnswer" role="status">
            <template v-if="attempt.phase === 'practice'"
              >{{
                firstAnswer.choice === question.correct
                  ? 'Первый ответ верный.'
                  : 'Первый ответ ошибочный.'
              }}
              {{ question.explanation }}</template
            ><template v-else
              >Первый ответ зафиксирован. Разбор откроется после обеих задач.</template
            >
          </p>
          <button
            v-if="firstAnswer && step === 0"
            class="button primary"
            :disabled="busy"
            @click="next"
          >
            К выбору доказательства
          </button>
        </article>
        <div v-if="attempt?.completedAt && checks" class="workshop-item">
          <h4>{{ remediationPassed(attempt) ? 'Обе задачи решены' : 'Нужен ещё один разбор' }}</h4>
          <p>
            Первые ответы не меняются после показа объяснения. Ошибочная попытка остаётся в истории.
          </p>
          <ol>
            <li v-for="(check, i) in checks" :key="i">
              <p>{{ check.prompt }}</p>
              <p>
                Ваш ответ: {{ check.choices[attempt.answers[i]!.choice] }}.
                {{ attempt.answers[i]!.choice === check.correct ? 'Верно.' : 'Ошибочно.' }}
                {{ check.explanation }}
              </p>
            </li>
          </ol>
        </div>
        <p v-if="attempt?.completedAt || !attempt || attempt.phase === 'practice'">
          <a :href="selected.lesson.source.url" target="_blank" rel="noopener noreferrer">{{
            selected.lesson.source.title
          }}</a>
        </p>
      </template>
      <p v-if="busy" role="status">
        Фиксируем текущий ответ{{ store.enabled ? ' и сохраняем на устройстве' : ' в памяти' }}…
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" :role="notice.startsWith('Не удалось') ? 'alert' : 'status'">{{ notice }}</p>
    </template>
  </section>
</template>
