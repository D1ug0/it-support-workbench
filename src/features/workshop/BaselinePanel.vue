<script setup lang="ts">
import { ref } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { saveNotice } from '../../shared/persistence'
import { onBeforeUnmount } from 'vue'
import { workshopCourses } from './courses'
const store = useWorkshopStore()
const notice = ref('')
const baseline = ref<typeof workshopCourses>([]),
  baselineIndex = ref(0),
  baselineFeedback = ref(''),
  busy = ref(false)
let generation = 0
onBeforeUnmount(() => generation++)
function startBaseline() {
  if (busy.value) return
  generation++
  baseline.value = workshopCourses.filter(
    (c, i, all) =>
      c.tracks.includes(store.state.track) &&
      all.findIndex(
        (other) => other.skill === c.skill && other.tracks.includes(store.state.track),
      ) === i,
  )
  baselineIndex.value = 0
  baselineFeedback.value = ''
}
async function baselineAnswer(index?: number) {
  const current = baseline.value[baselineIndex.value],
    position = baselineIndex.value,
    ticket = generation
  if (busy.value || !current) return
  busy.value = true
  try {
    const result = await store.setAssessment(current.skill, index === current.correct)
    if (ticket !== generation || position !== baselineIndex.value) return
    baselineFeedback.value = `${current.title}: ${index === undefined ? 'пропущено' : index === current.correct ? 'верно' : 'тема для изучения'}. ${current.why}`
    notice.value = saveNotice(result, 'Результат проверки сохранён.')
    baselineIndex.value++
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Стартовая проверка понимания</h3>
    <p>
      Короткие вопросы выбранного направления. Результат помогает выбрать тему; это проверка основ,
      самостоятельное владение определяется практикой.
    </p>
    <button class="button primary" :disabled="busy" @click="startBaseline">
      Начать проверку направления</button
    ><template v-if="baseline[baselineIndex]"
      ><p>
        Вопрос {{ baselineIndex + 1 }} из {{ baseline.length }} ·
        {{ baseline[baselineIndex]!.title }}
      </p>
      <p>{{ baseline[baselineIndex]!.question }}</p>
      <div class="workshop-choices">
        <button
          v-for="(option, i) in baseline[baselineIndex]!.options"
          :key="i"
          class="button secondary"
          :disabled="busy"
          @click="baselineAnswer(i)"
        >
          {{ option }}</button
        ><button class="button ghost" :disabled="busy" @click="baselineAnswer()">
          Пока не знаю
        </button>
      </div></template
    >
    <p v-else-if="baseline.length">
      Проверка завершена. Откройте карту навыков и рекомендуемую тему.
    </p>
    <p role="status">{{ baselineFeedback }}</p>
  </section>

  <p v-if="notice" role="status">{{ notice }}</p>
</template>
