<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AcademyCourse } from './catalog'
import { answerLab, createLabAttempt, exportLab, revealLabHint, summarizeLab } from './lab'
import { useLearningStore } from '../learning/useLearningStore'
import { downloadText } from '../../infrastructure/export/exportReport'
const props = defineProps<{ course: AcademyCourse }>()
const store = useLearningStore()
const attempt = ref(createLabAttempt(props.course))
const result = computed(() => summarizeLab(props.course, attempt.value))
const cursor = ref(0)
const question = computed(() => props.course.lab.questions[cursor.value])
const selected = computed(() =>
  question.value ? attempt.value.answers[question.value.id] : undefined,
)
const saving = ref(false)
const completed = ref(false)
const error = ref('')
async function answer(index: number) {
  if (!question.value || selected.value !== undefined || saving.value || !store.ready) return
  const q = question.value
  attempt.value = answerLab(props.course, attempt.value, q.id, index)
  saving.value = true
  try {
    await store.answer(q.id, index === q.correct)
    if (result.value.complete && !completed.value) {
      await store.complete(`LAB-${props.course.id}`, result.value.score)
      completed.value = true
    }
  } catch {
    error.value = 'Не удалось обновить прогресс. Разбор попытки можно скачать.'
  } finally {
    saving.value = false
  }
}
function restart() {
  attempt.value = createLabAttempt(props.course)
  cursor.value = 0
  completed.value = false
  error.value = ''
}
</script>
<template>
  <section class="panel feature-section academy-lab" :aria-label="`Лабораторная: ${course.title}`">
    <span class="eyebrow">СИНТЕТИЧЕСКАЯ ЛАБОРАТОРНАЯ</span>
    <h2>Примените знания: {{ course.title }}</h2>
    <p>{{ course.lab.briefing }}</p>
    <pre class="academy-evidence" aria-label="Учебные свидетельства">{{ course.lab.evidence }}</pre>
    <div v-if="question" class="quiz-section">
      <span class="tag">РЕШЕНИЕ {{ cursor + 1 }} / {{ course.lab.questions.length }}</span>
      <h3 class="quiz-prompt">{{ question.prompt }}</h3>
      <div class="quiz-options">
        <button
          v-for="(option, index) in question.choices"
          :key="index"
          :disabled="selected !== undefined || saving || !store.ready"
          :class="{
            correct: selected !== undefined && index === question.correct,
            incorrect: selected === index && index !== question.correct,
          }"
          @click="answer(index)"
        >
          {{ option }}
        </button>
      </div>
      <button
        v-if="selected === undefined && !attempt.hints.includes(question.id)"
        class="button ghost small"
        @click="attempt = revealLabHint(course, attempt, question.id)"
      >
        Показать подсказку
      </button>
      <p v-if="attempt.hints.includes(question.id)" class="finding-limit" role="status">
        {{ question.hint }}
      </p>
      <div v-if="selected !== undefined" class="quiz-explanation" role="status">
        <strong>{{ selected === question.correct ? 'Верно' : 'Разберём решение' }}</strong>
        <p>{{ question.explanation }}</p>
        <a :href="question.source.url" target="_blank" rel="noopener noreferrer">{{
          question.source.title
        }}</a>
        <button class="button primary small" :disabled="saving" @click="cursor++">
          {{
            cursor + 1 === course.lab.questions.length
              ? 'Показать итог лабораторной'
              : 'Следующее решение'
          }}
        </button>
      </div>
    </div>
    <div v-else class="academy-summary" role="status">
      <h3>Лабораторная завершена</h3>
      <p>
        Верных решений: {{ result.correct }} / {{ result.total }}. Подсказок: {{ result.hints }}.
      </p>
      <p>
        Вернитесь к объяснениям ошибок. Баллы относятся к этой попытке; подсказки отмечены в
        разборе.
      </p>
      <ul>
        <li
          v-for="q in course.lab.questions.filter((q) => attempt.answers[q.id] !== q.correct)"
          :key="q.id"
        >
          {{ q.prompt }} — {{ q.explanation }}
        </li>
      </ul>
      <div class="button-row">
        <button
          class="button primary small"
          @click="
            downloadText(
              exportLab(course, attempt),
              `workbench-lab-${course.id}.md`,
              'text/markdown',
            )
          "
        >
          Скачать разбор лабораторной
        </button>
        <button class="button secondary small" :disabled="saving" @click="restart">
          Пройти лабораторную заново
        </button>
      </div>
    </div>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </section>
</template>
