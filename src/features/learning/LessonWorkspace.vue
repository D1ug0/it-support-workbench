<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, Check, Terminal, FileText } from '@lucide/vue'
import type { WorkshopCourse } from '../workshop/courses'
import { useWorkshopStore } from '../workshop/useWorkshopStore'
import { terminalLabs } from '../terminal/catalog'
import MaterialCard from '../workshop/MaterialCard.vue'
import { useLessonSession } from './useLessonSession'
import { lessonJourney } from './journey'
import { useLearningClock } from './useLearningClock'
const props = defineProps<{ course: WorkshopCourse }>()
const store = useWorkshopStore(),
  now = useLearningClock()
const current = computed(() => props.course)
const { selected, answer, busy, notice, markRead, submit } = useLessonSession(current)
const progress = computed(() => lessonJourney(props.course, store.state, now.value))
const labs = computed(() =>
  props.course.labs.flatMap((id) => {
    const lab = terminalLabs.find((value) => value.id === id)
    return lab ? [lab] : []
  }),
)
const stages = computed(() => [
  { title: 'Материал', done: progress.value.read },
  { title: 'Понимание', done: progress.value.understood },
  { title: 'Практика', done: progress.value.independent },
  { title: 'Новая причина', done: progress.value.causes >= 2 },
])
</script>

<template>
  <article class="lesson-workspace" aria-labelledby="lesson-title">
    <header class="lesson-heading">
      <div>
        <span class="eyebrow">ЗАНЯТИЕ · УЧИМСЯ НА ПРАКТИКЕ</span>
        <h2 id="lesson-title">{{ course.title }}</h2>
      </div>
      <span class="lesson-chip">{{
        progress.independent ? 'Есть самостоятельное решение' : 'От материала к решению'
      }}</span>
    </header>
    <ol class="lesson-stepper" aria-label="Этапы занятия">
      <li v-for="(stage, index) in stages" :key="stage.title" :class="{ done: stage.done }">
        <span
          ><Check v-if="stage.done" :size="15" /><template v-else>{{ index + 1 }}</template></span
        >
        {{ stage.title }}<small>{{ stage.done ? 'Подтверждено в журнале' : 'Предстоит' }}</small>
      </li>
    </ol>
    <section class="panel lesson-section">
      <span class="lesson-section-number">01</span>
      <h3>Что нужно понять</h3>
      <p v-for="paragraph in course.paragraphs" :key="paragraph">{{ paragraph }}</p>
      <details class="lesson-details">
        <summary>План диагностического процесса</summary>
        <ol>
          <li v-for="step in course.steps" :key="step">{{ step }}</li>
        </ol>
      </details>
      <MaterialCard :id="course.id" :source="course.source" />
      <button
        class="button secondary"
        :disabled="busy || !store.ready || progress.read"
        @click="markRead"
      >
        {{ progress.read ? 'Материал отмечен' : 'Я разобрался с материалом' }}
      </button>
    </section>
    <section class="panel lesson-section">
      <span class="lesson-section-number">02</span>
      <h3>Проверьте понимание</h3>
      <p>{{ course.question }}</p>
      <fieldset class="lesson-options" :disabled="busy || answer !== undefined || !store.ready">
        <legend>Выберите обоснованный ответ</legend>
        <label
          v-for="(option, index) in course.options"
          :key="index"
          :class="{ selected: selected === index }"
          ><input
            v-model="selected"
            type="radio"
            :name="`lesson-${course.id}`"
            :value="index"
          /><span>{{ option }}</span></label
        >
      </fieldset>
      <button
        class="button primary"
        :disabled="busy || selected === undefined || answer !== undefined || !store.ready"
        @click="submit"
      >
        Проверить ответ <ArrowRight :size="16" />
      </button>
      <div v-if="answer !== undefined" class="lesson-feedback" role="status">
        <strong>{{
          answer === course.correct ? 'Вывод обоснован.' : 'Разберём, что стоит уточнить.'
        }}</strong>
        <p>{{ course.why }}</p>
        <p v-if="answer !== course.correct">
          Обоснованный ответ: {{ course.options[course.correct] }}. Вернитесь к материалу и
          проверьте этот принцип в лаборатории.
        </p>
      </div>
      <p class="muted">
        Первый ответ фиксируется для этой сессии занятия. Один вопрос проверяет часть темы; освоение
        подтверждается самостоятельной практикой и повторением.
      </p>
    </section>
    <section class="panel lesson-section">
      <span class="lesson-section-number">03</span>
      <h3>Примените знания</h3>
      <p>
        Начните с подсказками, затем решите самостоятельно. Команды работают в виртуальной среде:
        исходный отказ, изменения и повторные проверки связаны одним состоянием.
      </p>
      <div v-if="labs.length" class="lesson-labs">
        <article v-for="(lab, index) in labs" :key="lab.id">
          <span class="eyebrow">{{ index === 0 ? 'ПЕРВАЯ ПРАКТИКА' : 'ДРУГАЯ СИТУАЦИЯ' }}</span>
          <h4>{{ lab.title }}</h4>
          <p>{{ lab.brief }}</p>
          <div class="button-row">
            <RouterLink
              class="button"
              :class="progress.guided || index > 0 ? 'secondary' : 'primary'"
              :to="`/terminal?lab=${lab.id}&mode=guided`"
              ><Terminal :size="16" /> С подсказками</RouterLink
            ><RouterLink
              class="button"
              :class="progress.guided || index > 0 ? 'primary' : 'secondary'"
              :to="`/terminal?lab=${lab.id}&mode=practice`"
              >Самостоятельно <ArrowRight :size="16"
            /></RouterLink>
          </div>
        </article>
      </div>
      <p v-else>
        Для этой темы продолжение проходит на собственном разрешённом стенде. Отчёт стенда
        отмечается как самостоятельная запись, а не автоматическая аттестация.
      </p>
      <RouterLink
        v-if="!labs.length"
        class="button secondary"
        to="/learning?view=workshop&workshop=stand"
        >Перейти к своему стенду</RouterLink
      >
    </section>
    <section class="panel lesson-section lesson-reflection">
      <span class="lesson-section-number">04</span>
      <h3>Объясните решение и вернитесь к теме</h3>
      <p>
        После лаборатории сформулируйте: что наблюдали, какую гипотезу проверили, почему выбрали
        изменение и что подтверждает свежая проверка. Терминальный разбор покажет недостающие
        действия; ручная рубрика поможет уточнить объяснение.
      </p>
      <div class="button-row">
        <RouterLink class="button secondary" to="/learning?view=workshop&workshop=portfolio"
          ><FileText :size="16" /> Мои отчёты</RouterLink
        ><RouterLink class="button ghost" to="/learning?view=progress"
          >Посмотреть прогресс и повторение</RouterLink
        >
      </div>
      <p class="muted">
        Баллы модели, собственное объяснение и проверка на настоящей системе — разные результаты.
        Повтор после перерыва назначается общими правилами учебного маршрута.
      </p>
    </section>
    <p v-if="notice" role="status" class="lesson-feedback">{{ notice }}</p>
  </article>
</template>
