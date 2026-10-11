<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { saveNotice } from '../../shared/persistence'
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import MaterialCard from './MaterialCard.vue'
import { workshopCourses, tracks } from './courses'
import { skills, type SkillId } from './skills'
import { taskErrorIds } from './learningErrors'
const store = useWorkshopStore()
const notice = ref('')
const route = useRoute(),
  courseId = ref(workshopCourses[0]!.id),
  query = ref(''),
  choice = ref<number>(),
  busy = ref(false)
let generation = 0
onBeforeUnmount(() => generation++)
const allCourses = computed(() => [...workshopCourses, ...store.customCourses])
const courses = computed(() =>
  allCourses.value.filter(
    (c) =>
      c.tracks.includes(store.state.track) &&
      `${c.title} ${c.paragraphs.join(' ')}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
const course = computed(
  () => allCourses.value.find((c) => c.id === courseId.value) ?? workshopCourses[0]!,
)
const authored = computed(() => course.value.id.startsWith('COURSE-'))
function prerequisites(ids: readonly SkillId[]) {
  return ids.map((id) => skills.find((s) => s.id === id)?.title).join(', ')
}
function openCourse(id: string) {
  generation++
  courseId.value = id
  choice.value = undefined
  notice.value = ''
  void store.selectLesson(id)
}
watch(
  () => [route.query.lesson, store.customCourses] as const,
  ([id]) => {
    if (allCourses.value.some((c) => c.id === id) && courseId.value !== id) openCourse(String(id))
  },
  { immediate: true },
)
onMounted(async () => {
  const ticket = generation
  await store.initialize()
  if (
    ticket === generation &&
    !route.query.lesson &&
    allCourses.value.some((c) => c.id === store.state.currentLesson)
  )
    openCourse(store.state.currentLesson!)
})
async function markRead() {
  if (busy.value) return
  const id = course.value.id,
    ticket = generation
  busy.value = true
  try {
    const result = await store.markRead(id)
    if (ticket === generation)
      notice.value = saveNotice(
        result,
        'Знакомство с материалом отмечено. Навык проверяется практикой.',
      )
  } finally {
    busy.value = false
  }
}
async function answer(index: number) {
  if (busy.value || choice.value !== undefined) return
  const current = course.value,
    ticket = generation,
    at = new Date().toISOString(),
    correct = index === current.correct
  choice.value = index
  if (authored.value) return
  busy.value = true
  try {
    const result = await store.recordResult({
      theory: { taskId: current.id, skill: current.skill, form: 'choice', correct, at },
      assessment: correct,
      event: {
        attemptId: globalThis.crypto.randomUUID(),
        module: 'course',
        taskId: current.id,
        skill: current.skill,
        at,
        score: correct ? 100 : 0,
        outcome: correct ? 'completed' : 'failed',
        errors: correct ? [] : [current.why.slice(0, 180)],
        errorIds: correct ? [] : taskErrorIds('course', current.id),
      },
    })
    if (ticket === generation) notice.value = saveNotice(result, 'Результат сохранён.')
  } finally {
    busy.value = false
  }
}
async function track(value: string) {
  notice.value = saveNotice(await store.selectTrack(value), 'Направление сохранено.')
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Тематические пакеты</h3>
    <label
      >Поиск по новым курсам<input
        v-model="query"
        class="text-input"
        placeholder="TLS, DHCP, Linux, Git…" /></label
    ><label
      >Направление<AppSelect :model-value="store.state.track" class="text-input" @change="track">
        <AppSelectOption v-for="t in tracks" :key="t.id" :value="t.id">{{
          t.title
        }}</AppSelectOption>
      </AppSelect></label
    >
    <div class="button-row">
      <button
        v-for="c in courses"
        :key="c.id"
        :class="['button', courseId === c.id ? 'primary' : 'secondary']"
        @click="openCourse(c.id)"
      >
        {{ c.title }} {{ store.state.read.includes(`LESSON-${c.id}`) ? '✓' : '' }}
      </button>
    </div>
    <p v-if="!courses.length">
      В выбранном направлении совпадений нет. Измените запрос или направление.
    </p>
  </section>
  <article class="panel feature-section">
    <h3>{{ course.title }}</h3>
    <RouterLink
      v-if="typeof route.query.returnAttempt === 'string'"
      class="button secondary"
      :to="`/learning?view=workshop&workshop=professional&attempt=${encodeURIComponent(route.query.returnAttempt)}`"
      >Вернуться к инциденту {{ route.query.returnAttempt }}</RouterLink
    >
    <MaterialCard
      :id="course.id"
      :source="course.source"
      :authored="authored"
      :prerequisites="prerequisites(skills.find((s) => s.id === course.skill)?.requires ?? [])"
    />
    <p v-if="authored" class="tag">
      Авторский материал · самопроверка без изменения встроенной оценки навыка
    </p>
    <p v-for="paragraph in course.paragraphs" :key="paragraph">{{ paragraph }}</p>
    <h4>Практический процесс</h4>
    <ol>
      <li v-for="step in course.steps" :key="step">{{ step }}</li>
    </ol>
    <a :href="course.source" target="_blank" rel="noopener noreferrer">{{
      authored ? 'Источник, указанный автором' : 'Первичный источник по теме'
    }}</a>
    <div class="button-row">
      <button class="button ghost" :disabled="busy" @click="markRead">
        Отметить материал изученным</button
      ><RouterLink
        v-for="lab in course.labs"
        :key="lab"
        class="button secondary"
        :to="`/terminal?lab=${lab}`"
        >Практика: {{ lab }}</RouterLink
      >
    </div>
    <h4>Проверка понимания</h4>
    <p>{{ course.question }}</p>
    <div class="workshop-choices">
      <button
        v-for="(option, index) in course.options"
        :key="index"
        class="button secondary"
        :disabled="busy || choice !== undefined"
        @click="answer(index)"
      >
        {{ option }}
      </button>
    </div>
    <p v-if="choice !== undefined" role="status">
      {{ choice === course.correct ? 'Верно.' : 'Разберём ошибку.' }} {{ course.why }}
    </p>
    <button
      v-if="choice !== undefined"
      class="button ghost"
      :disabled="busy"
      @click="choice = undefined"
    >
      Повторить вопрос
    </button>
  </article>

  <p v-if="notice" role="status">{{ notice }}</p>
</template>
