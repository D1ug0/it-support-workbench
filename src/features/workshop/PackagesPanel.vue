<script setup lang="ts">
import { computed, ref } from 'vue'
import { learningPackages } from './packages'
import { useWorkshopStore } from './useWorkshopStore'
const workshop = useWorkshopStore(),
  selected = ref(learningPackages[0]!.id),
  value = ref(''),
  notice = ref('')
const packet = computed(() => learningPackages.find((p) => p.id === selected.value)!)
function resetAnswers() {
  value.value = ''
  notice.value = ''
}
async function check(form: 'choice' | 'calculation' | 'contradiction', answer: number) {
  const p = packet.value,
    correct =
      answer ===
      (form === 'choice' ? p.correct : form === 'calculation' ? p.answer : p.contradictionCorrect)
  const result = await workshop.recordTheory({
    taskId: `PACK-${p.id}-${form}`,
    skill: p.skill,
    form,
    correct,
    at: new Date().toISOString(),
  })
  await workshop.addEvent({
    attemptId: globalThis.crypto.randomUUID(),
    module: 'course',
    taskId: `PACK-${p.id}-${form}`,
    skill: p.skill,
    at: new Date().toISOString(),
    score: correct ? 100 : 0,
    outcome: correct ? 'completed' : 'failed',
    errors: correct
      ? []
      : [form === 'choice' ? p.question : form === 'calculation' ? p.calculation : p.contradiction],
  })
  notice.value = `${correct ? 'Верно.' : 'Ошибка: повторите связанный материал и шаг проверки.'} ${result.status === 'saved' ? 'Результат сохранён.' : result.status === 'failed' ? result.error : 'Результат в памяти.'}`
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Углублённые тематические пакеты</h3>
    <label
      >Пакет<select v-model="selected" class="text-input" @change="resetAnswers">
        <option v-for="p in learningPackages" :key="p.id" :value="p.id">{{ p.title }}</option>
      </select></label
    >
    <h4>{{ packet.title }}</h4>
    <p>
      Предпосылки: {{ packet.requires }}. От теории и постепенных проверок — к незнакомому
      инциденту.
    </p>
    <ol>
      <li v-for="s in packet.steps" :key="s">{{ s }}</li>
    </ol>
    <div class="button-row">
      <RouterLink
        v-for="id in packet.lessons"
        :key="id"
        class="button secondary"
        :to="`/learning?view=workshop&lesson=${id}`"
        >Материал {{ id }}</RouterLink
      >
    </div>
    <h4>Выбор гипотезы</h4>
    <p>{{ packet.question }}</p>
    <button
      v-for="(o, i) in packet.options"
      :key="i"
      class="button secondary"
      @click="check('choice', i)"
    >
      {{ o }}
    </button>
    <h4>Расчёт</h4>
    <p>{{ packet.calculation }}</p>
    <label>Числовой ответ<input v-model="value" type="number" class="text-input" /></label
    ><button
      class="button secondary"
      :disabled="!value.trim()"
      @click="check('calculation', Number(value))"
    >
      Проверить расчёт
    </button>
    <h4>Объяснение противоречия</h4>
    <p>{{ packet.contradiction }}</p>
    <button
      v-for="(o, i) in packet.choices"
      :key="i"
      class="button secondary"
      @click="check('contradiction', i)"
    >
      {{ o }}
    </button>
    <p role="status">{{ notice }}</p>
    <RouterLink
      class="button primary"
      :to="
        packet.final === 'stand'
          ? '/learning?view=workshop&workshop=stand'
          : `/learning?view=workshop&workshop=professional&incident=${packet.final}`
      "
      >Незнакомая итоговая работа</RouterLink
    >
    <p>
      ARP/NAT/VLAN, SNI/proxy, AD/Kerberos, systemd и Git проверяются в своей ОС по инструкции
      стенда; условные флаги симулятора не воспроизводят весь стек.
    </p>
  </section>
</template>
