<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Compass, ArrowRight, ArrowLeft, Check } from '@lucide/vue'
import { symptoms, scopes, buildGuidePlan, exportGuidePlan } from '../features/guide/catalog'
import type { SymptomId } from '../features/guide/catalog'
import { useGuideStore } from '../features/guide/useGuideStore'
import { downloadText } from '../infrastructure/export/exportReport'
import CopyCommand from '../shared/components/CopyCommand.vue'
const store = useGuideStore()
const { selected, scope, detail, plan, done } = storeToRefs(store)
const error = ref('')
const heading = ref<HTMLElement>()
const symptom = computed(() => symptoms.find((item) => item.id === selected.value))
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
function select(id: SymptomId) {
  selected.value = id
  scope.value = undefined
  detail.value = ''
  plan.value = undefined
  done.value = []
  error.value = ''
  void focusHeading()
}
function prepare() {
  if (!selected.value || !scope.value || !detail.value) {
    error.value = 'Ответьте на оба вопроса. Если не знаете ответ, выберите «Пока не знаю».'
    return
  }
  plan.value = buildGuidePlan(selected.value, scope.value, detail.value)
  done.value = []
  error.value = ''
  void focusHeading()
}
function toggle(id: string) {
  done.value = done.value.includes(id)
    ? done.value.filter((value) => value !== id)
    : [...done.value, id]
}
function reset() {
  store.clear()
  error.value = ''
  void focusHeading()
}
function editAnswers() {
  plan.value = undefined
  done.value = []
  void focusHeading()
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">НАЧНИТЕ С СИМПТОМА</span>
      <h1>Разберём проблему по шагам<span class="accent">.</span></h1>
      <p>Выберите ситуацию, уточните два факта и получите понятный порядок проверок.</p>
    </div>
    <span class="tag"><Compass :size="14" /> ПОМОЩНИК ДИАГНОСТИКИ</span>
  </div>
  <ol class="guide-progress" aria-label="Этапы помощника">
    <li :aria-current="!selected ? 'step' : undefined">1. Ситуация</li>
    <li :aria-current="selected && !plan ? 'step' : undefined">2. Уточнение</li>
    <li :aria-current="plan ? 'step' : undefined">3. План проверки</li>
  </ol>
  <section v-if="!selected" class="section-block">
    <h2 ref="heading" tabindex="-1" class="focus-heading">Что случилось?</h2>
    <div class="guide-symptoms">
      <button
        v-for="item in symptoms"
        :key="item.id"
        class="panel guide-choice"
        @click="select(item.id)"
      >
        <strong>{{ item.title }}</strong
        ><span>{{ item.brief }}</span
        ><ArrowRight :size="19" />
      </button>
    </div>
    <p class="muted">
      Уже есть вывод команды? <RouterLink to="/analyzer">Перейдите сразу к анализатору.</RouterLink>
    </p>
  </section>
  <form v-else-if="!plan" class="panel feature-section guide-questions" @submit.prevent="prepare">
    <button type="button" class="button ghost small" @click="reset">
      <ArrowLeft :size="14" />Выбрать другую ситуацию
    </button>
    <h2 ref="heading" tabindex="-1" class="focus-heading">{{ symptom?.title }}</h2>
    <fieldset>
      <legend>Кого затронула проблема?</legend>
      <label v-for="item in scopes" :key="item.id" class="guide-option"
        ><input v-model="scope" type="radio" name="guide-scope" :value="item.id" />{{
          item.label
        }}</label
      >
    </fieldset>
    <fieldset>
      <legend>{{ symptom?.question }}</legend>
      <label v-for="option in symptom?.options" :key="option[0]" class="guide-option"
        ><input v-model="detail" type="radio" name="guide-detail" :value="option[0]" />{{
          option[1]
        }}</label
      >
    </fieldset>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <button class="button primary">Показать план проверки <ArrowRight :size="16" /></button>
  </form>
  <template v-else
    ><section class="panel feature-section guide-plan-intro">
      <div class="section-heading">
        <div>
          <h2 ref="heading" tabindex="-1" class="focus-heading">План: {{ plan.symptom.title }}</h2>
          <p>{{ plan.scopeLabel }} · {{ plan.detailLabel }}</p>
        </div>
        <span class="tag">{{ done.length }} / {{ plan.steps.length }} ОТМЕТОК</span>
      </div>
      <p>
        Это порядок действий по вашим ответам. Для вывода о причине нужны результаты проверок.
        Выполняйте команды в Windows вручную; для сетевых примеров замените example.com и порт 443
        на разрешённые для задачи.
      </p>
      <div class="button-row">
        <button class="button secondary small" @click="editAnswers">Изменить ответы</button
        ><button class="button ghost small" @click="reset">Начать заново</button>
      </div>
    </section>
    <ol class="guide-plan">
      <li v-for="(step, index) in plan.steps" :key="step.id" class="panel feature-section">
        <span class="guide-step-number"
          ><Check v-if="done.includes(step.id)" :size="18" /><template v-else>{{
            index + 1
          }}</template></span
        >
        <h3>{{ step.title }}</h3>
        <p>{{ step.why }}</p>
        <div class="guide-lookfor">
          <strong>На что обратить внимание</strong>
          <p>{{ step.lookFor }}</p>
        </div>
        <CopyCommand v-if="step.command" :command="step.command" />
        <div class="button-row">
          <RouterLink
            v-if="step.kind"
            class="button secondary small"
            :to="{ path: '/analyzer', query: { command: step.kind } }"
            >Разобрать вывод этой команды <ArrowRight :size="14" /></RouterLink
          ><RouterLink
            v-if="step.knowledgeTitle"
            class="text-link"
            :to="{ path: '/knowledge', query: { q: step.knowledgeTitle } }"
            >Пояснение в справочнике</RouterLink
          >
        </div>
        <p v-if="step.command && !step.kind" class="muted">
          Этот вывод пока разбирается вручную по справочнику.
        </p>
        <label class="checkbox-label"
          ><input type="checkbox" :checked="done.includes(step.id)" @change="toggle(step.id)" />Этот
          шаг я выполнил</label
        ><a v-if="step.source" :href="step.source.url" target="_blank" rel="noopener noreferrer">{{
          step.source.title
        }}</a>
      </li>
    </ol>
    <section class="panel feature-section">
      <h2>
        {{
          done.length === plan.steps.length
            ? 'Проверки отмечены. Сопоставьте результаты.'
            : 'Сохраните план или потренируйтесь'
        }}
      </h2>
      <p>
        Отметка фиксирует ваше действие, а не успешный результат. Все ответы и отметки остаются в
        памяти вкладки.
      </p>
      <div class="button-row">
        <button
          class="button primary small"
          @click="downloadText(exportGuidePlan(plan, done), 'workbench-diagnostic-plan.md')"
        >
          Скачать план</button
        ><RouterLink
          class="button secondary small"
          :to="{ path: '/playbooks', query: { id: plan.symptom.playbook } }"
          >Полный чек-лист</RouterLink
        ><RouterLink
          class="button secondary small"
          :to="{ path: '/simulator', query: { scenario: plan.symptom.scenario } }"
          >Учебный пример ситуации</RouterLink
        ><RouterLink
          class="button ghost small"
          :to="{ path: '/learning', query: { topic: plan.symptom.topic } }"
          >Проверить знания</RouterLink
        >
      </div>
    </section></template
  >
</template>
