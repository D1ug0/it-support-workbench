<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TerminalAssessment } from './assessment'
import type { LabState } from './engine'
import type { TerminalMode } from './checkpoint'
import { terminalLearningDebrief } from './learningDebrief'
import { useWorkshopStore } from '../workshop/model/index'
import { useLearningClock } from '../learning/useLearningClock'
const props = defineProps<{
  assessment: TerminalAssessment
  state: LabState
  mode: TerminalMode
  hints: number
  finished: boolean
}>()
const emit = defineEmits<{ focusRecords: []; repeat: [mode: TerminalMode] }>()
const workshop = useWorkshopStore()
const now = useLearningClock()
const debrief = computed(() =>
  terminalLearningDebrief(
    props.assessment,
    props.state,
    props.mode,
    props.hints,
    workshop.state,
    now.value,
  ),
)
// Deliberately local: a short process exercise is separate from the lab grade and journals.
const selected = ref<number>()
const answer = ref<number>()
function submit() {
  if (selected.value !== undefined && answer.value === undefined) answer.value = selected.value
}
</script>
<template>
  <div class="terminal-debrief">
    <h3>
      {{
        assessment.complete ? 'Что подтверждено и как продолжить' : 'Что дополнить в расследовании'
      }}
    </h3>
    <ul class="terminal-checks">
      <li v-for="check in assessment.checks" :key="check.id">
        <span :class="{ accent: check.met }">{{
          check.met ? '✓ Выполнено' : '○ Не подтверждено'
        }}</span>
        · {{ check.label }}
      </li>
    </ul>
    <div v-if="debrief.gaps.length" class="terminal-debrief-steps">
      <article v-for="gap in debrief.gaps" :key="gap.id">
        <h4>{{ gap.label }}</h4>
        <p>{{ gap.action }}</p>
        <p v-if="gap.restartRecommended">
          Этот шаг удобнее выполнить в новой попытке с исходным состоянием среды.
        </p>
      </article>
    </div>
    <p
      v-if="
        debrief.processCost && (debrief.processCost.regressions || debrief.processCost.unnecessary)
      "
    >
      Аудит действий модели: изменений с новыми проблемами — {{ debrief.processCost.regressions }},
      без уменьшения найденных проблем — {{ debrief.processCost.unnecessary }}, откатов —
      {{ debrief.processCost.rollbacks }}. Эти действия уже учтены в баллах. Разберите их
      обоснование в отчёте.
    </p>
    <div class="button-row">
      <button class="button ghost" @click="emit('focusRecords')">
        Вернуться к доказательствам
      </button>
      <RouterLink v-if="debrief.course" class="button ghost" :to="debrief.course.url"
        >Материал: {{ debrief.course.title }}</RouterLink
      >
      <button
        v-if="finished && !assessment.complete"
        class="button secondary"
        @click="emit('repeat', 'guided')"
      >
        Разобрать заново с подсказками
      </button>
      <button
        v-if="!finished && debrief.gaps.some((gap) => gap.restartRecommended)"
        class="button secondary"
        @click="emit('repeat', mode)"
      >
        Вернуться к исходному состоянию
      </button>
    </div>
    <details class="terminal-process-drill">
      <summary>Короткая тренировка · {{ debrief.drill.title }} · 2 минуты</summary>
      <p>{{ debrief.drill.prompt }}</p>
      <fieldset :disabled="answer !== undefined">
        <legend>Выберите обоснованное действие или вывод</legend>
        <label v-for="(option, index) in debrief.drill.options" :key="index" class="checkbox-label">
          <input v-model="selected" type="radio" name="terminal-process-drill" :value="index" />{{
            option
          }}
        </label>
      </fieldset>
      <button
        class="button secondary"
        :disabled="selected === undefined || answer !== undefined"
        @click="submit"
      >
        Проверить рассуждение
      </button>
      <div v-if="answer !== undefined" role="status">
        <p>
          <strong>{{
            answer === debrief.drill.correct ? 'Обоснованно.' : 'Есть более обоснованный вывод.'
          }}</strong>
          {{ debrief.drill.explanation }}
        </p>
        <p>Подходящий ответ: {{ debrief.drill.options[debrief.drill.correct] }}</p>
      </div>
      <p class="terminal-origin">
        Упражнение остаётся в памяти этого разбора. Оно не меняет оценку лаборатории и карту
        навыков.
      </p>
    </details>
    <div v-if="finished && debrief.next" class="terminal-next-step">
      <h4>Следующий шаг</h4>
      <p>{{ debrief.next.reason }}</p>
      <RouterLink class="button primary" :to="debrief.next.url">{{
        debrief.next.title
      }}</RouterLink>
    </div>
  </div>
</template>
