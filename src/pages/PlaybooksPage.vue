<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { playbooks, exportChecklist } from '../features/playbooks/catalog'
import { downloadText } from '../infrastructure/export/exportReport'
const id = ref(playbooks[0]!.id)
const route = useRoute()
watch(
  () => route.query.id,
  (value) => {
    if (typeof value === 'string' && playbooks.some((item) => item.id === value)) id.value = value
  },
  { immediate: true },
)
const done = ref<Record<string, string[]>>({})
const selected = computed(() => playbooks.find((p) => p.id === id.value)!)
const checked = computed(() => done.value[id.value] ?? [])
function toggle(value: string) {
  const values = checked.value
  done.value = {
    ...done.value,
    [id.value]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value],
  }
}
function reset() {
  done.value = { ...done.value, [id.value]: [] }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ПОШАГОВЫЕ ЧЕК-ЛИСТЫ</span>
      <h1>Последовательность вместо спешки<span class="accent">.</span></h1>
      <p>Практические чек-листы с командами, ограничениями и первичными источниками.</p>
    </div>
    <span class="tag">{{ playbooks.length }} АЛГОРИТМОВ</span>
  </div>
  <div class="filter-chips" aria-label="Выбор чек-листа">
    <button
      v-for="item in playbooks"
      :key="item.id"
      :aria-pressed="id === item.id"
      :class="{ active: id === item.id }"
      @click="id = item.id"
    >
      {{ item.title }}
    </button>
  </div>
  <section class="panel feature-section">
    <div class="section-heading">
      <div>
        <h2>{{ selected.title }}</h2>
        <p>{{ selected.brief }}</p>
      </div>
      <span class="tag">{{ checked.length }} / {{ selected.steps.length }}</span>
    </div>
    <progress
      :value="checked.length"
      :max="selected.steps.length"
      aria-label="Выполненные пункты чек-листа"
    />
    <p>
      Отметки хранятся в памяти вкладки. Выполнение пункта не означает, что проверка была успешной.
      Команды не запускаются приложением; сетевые цели выбирайте по согласованию.
    </p>
    <ol class="playbook-steps">
      <li v-for="step in selected.steps" :key="step.id">
        <label class="checkbox-label"
          ><input
            type="checkbox"
            :checked="checked.includes(step.id)"
            @change="toggle(step.id)"
          /><strong>{{ step.label }}</strong></label
        ><code v-if="step.command">{{ step.command }}</code>
        <details>
          <summary>Ограничение и источник</summary>
          <p>{{ step.limitation }}</p>
          <a :href="step.source.url" target="_blank" rel="noopener noreferrer">{{
            step.source.title
          }}</a>
        </details>
      </li>
    </ol>
    <div class="button-row">
      <button
        class="button primary small"
        @click="downloadText(exportChecklist(id, checked), 'workbench-checklist.md')"
      >
        Скачать чек-лист</button
      ><button class="button secondary small" @click="reset">Сбросить отметки</button
      ><RouterLink class="button secondary small" to="/sessions">Открыть рабочую сессию</RouterLink>
    </div>
  </section>
</template>
