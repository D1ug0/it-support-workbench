<script setup lang="ts">
import { computed, ref } from 'vue'
import { subnetExercises, getSubnetExercise, checkSubnetAnswer } from './subnetPractice'
const cursor = ref(0)
const answer = ref('')
const feedback = ref<ReturnType<typeof checkSubnetAnswer>>()
const correctIds = ref<string[]>([])
const attempts = ref(0)
const exercise = computed(() => getSubnetExercise(subnetExercises[cursor.value]!.id))
function check() {
  if (feedback.value?.valid) return
  feedback.value = checkSubnetAnswer(exercise.value.id, answer.value)
  if (!feedback.value.valid) return
  attempts.value++
  if (feedback.value.correct && !correctIds.value.includes(exercise.value.id))
    correctIds.value.push(exercise.value.id)
}
function resetAnswer() {
  answer.value = ''
  feedback.value = undefined
}
function next() {
  cursor.value = (cursor.value + 1) % subnetExercises.length
  resetAnswer()
}
</script>
<template>
  <section
    id="subnet-practice"
    class="panel feature-section subnet-practice"
    tabindex="-1"
    aria-labelledby="practice-title"
  >
    <div class="section-heading">
      <div>
        <span class="eyebrow">ПРАКТИКА · {{ cursor + 1 }} / {{ subnetExercises.length }}</span>
        <h2 id="practice-title">Проверьте себя на подсетях</h2>
      </div>
      <span class="tag">{{ correctIds.length }} / {{ subnetExercises.length }} РЕШЕНО</span>
    </div>
    <p>
      Решите задачу сами, затем сравните ответ с объяснением. Все адреса учебные. Попытки остаются в
      памяти этого раздела.
    </p>
    <form class="practice-form" @submit.prevent="check">
      <div>
        <h3>
          {{ exercise.label }} для <code>{{ exercise.address }}/{{ exercise.prefix }}</code
          >?
        </h3>
        <label for="subnet-answer"
          >Ответ на задание<input
            id="subnet-answer"
            v-model="answer"
            class="text-input mono-input"
            :readonly="feedback?.valid"
            :inputmode="exercise.field === 'hosts' ? 'numeric' : 'text'"
            autocomplete="off"
            spellcheck="false"
            :placeholder="exercise.field === 'hosts' ? 'Число адресов' : 'x.x.x.x'"
            :aria-invalid="feedback && !feedback.valid ? true : undefined"
            :aria-describedby="feedback ? 'practice-feedback' : undefined"
        /></label>
      </div>
      <button class="button primary" :disabled="feedback?.valid" type="submit">
        Проверить ответ
      </button>
    </form>
    <div
      v-if="feedback"
      id="practice-feedback"
      :role="feedback.valid ? 'status' : 'alert'"
      class="practice-feedback"
      :class="{ success: feedback.correct }"
    >
      <strong>{{
        !feedback.valid ? 'Уточните формат' : feedback.correct ? 'Верно' : 'Разберём ошибку'
      }}</strong>
      <p>{{ feedback.message }}</p>
    </div>
    <div class="button-row">
      <template v-if="feedback?.valid"
        ><button class="button secondary small" @click="next">Следующее задание</button
        ><button class="button ghost small" @click="resetAnswer">Решить ещё раз</button></template
      ><RouterLink to="/learning?topic=Подсети">Изучить тему «Подсети»</RouterLink>
    </div>
    <small
      >Проверенных попыток: {{ attempts }}. Решённое задание учитывается один раз; счётчик не
      является оценкой профессионального уровня.</small
    >
  </section>
</template>
