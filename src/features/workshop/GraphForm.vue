<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { graphSchema, type IncidentGraph } from './graph'
const text = defineModel<string>({ required: true })
const draft = ref<IncidentGraph>(graphSchema.parse(JSON.parse(text.value))),
  selected = ref(draft.value.start)
watch(text, (value) => {
  try {
    const raw: unknown = JSON.parse(value)
    if (JSON.stringify(raw) === JSON.stringify(draft.value)) return
    const next = graphSchema.safeParse(raw)
    if (next.success && JSON.stringify(next.data) !== JSON.stringify(draft.value)) {
      draft.value = next.data
      if (!next.data.nodes.some((n) => n.id === selected.value)) selected.value = next.data.start
    }
  } catch {
    /* JSON edits are validated by the parent. */
  }
})
watch(
  draft,
  (value) => {
    const next = JSON.stringify(value, null, 2)
    if (text.value !== next) text.value = next
  },
  { deep: true },
)
const node = computed(
  () => draft.value.nodes.find((n) => n.id === selected.value) ?? draft.value.nodes[0]!,
)
function addNode() {
  let n = 1
  while (draft.value.nodes.some((node) => node.id === `step-${n}`)) n++
  const id = `step-${n}`
  const previousTarget = node.value.choices[0]!.to
  node.value.choices[0]!.to = id
  draft.value.nodes.push({
    id,
    prompt: 'Какая проверка обоснована полученными данными?',
    choices: [
      {
        label: 'Собрать доказательства и проверить результат',
        to: previousTarget,
        useful: true,
        explanation: 'Проверка помогает подтвердить причину и результат изменения.',
      },
      {
        label: 'Изменить настройки без проверки',
        to: draft.value.start,
        useful: false,
        explanation: 'Изменение без доказательств может добавить новую неисправность.',
      },
    ],
  })
  selected.value = id
}
function removeNode() {
  const removed = node.value.id
  draft.value.nodes = draft.value.nodes.filter((n) => n.id !== removed)
  if (draft.value.start === removed) draft.value.start = draft.value.nodes[0]!.id
  for (const n of draft.value.nodes) for (const c of n.choices) if (c.to === removed) c.to = 'END'
  selected.value = draft.value.start
}
</script>
<template>
  <div class="workshop-item">
    <h3>Конструктор развилок</h3>
    <label
      >Название расследования<input v-model="draft.title" class="text-input" maxlength="160"
    /></label>
    <label
      >Начальный этап<select v-model="draft.start" class="text-input">
        <option v-for="n in draft.nodes" :key="n.id" :value="n.id">
          {{ n.id }} · {{ n.prompt.slice(0, 70) }}
        </option>
      </select></label
    >
    <nav class="graph-overview" aria-label="Схема переходов">
      <button
        v-for="n in draft.nodes"
        :key="n.id"
        class="button secondary graph-node"
        :aria-pressed="node.id === n.id"
        @click="selected = n.id"
      >
        <strong>{{ n.id }}{{ n.id === draft.start ? ' · начало' : '' }}</strong
        ><span>{{ n.prompt }}</span
        ><span v-for="(c, i) in n.choices" :key="i"
          >{{ i + 1 }} → {{ c.to === 'END' ? 'Завершение' : c.to }}</span
        >
      </button>
    </nav>
    <p>
      Выберите этап на схеме и отредактируйте его. Новый этап подключается первым действием
      выбранного этапа. Каждый этап должен быть достижим и иметь путь к завершению.
    </p>
    <div class="button-row">
      <button class="button secondary" :disabled="draft.nodes.length >= 40" @click="addNode">
        Добавить этап расследования</button
      ><button class="button ghost" :disabled="draft.nodes.length <= 1" @click="removeNode">
        Удалить выбранный этап
      </button>
    </div>
    <fieldset>
      <legend>Этап {{ node.id }}</legend>
      <label
        >Условие этапа<textarea
          v-model="node.prompt"
          class="text-input"
          rows="3"
          maxlength="1200"
        />
      </label>
      <fieldset v-for="(c, i) in node.choices" :key="i">
        <legend>Действие {{ i + 1 }}</legend>
        <label
          >Название действия {{ i + 1
          }}<input v-model="c.label" class="text-input" maxlength="180" /></label
        ><label
          >Переход действия {{ i + 1
          }}<select v-model="c.to" class="text-input">
            <option value="END">Завершение</option>
            <option v-for="n in draft.nodes" :key="n.id" :value="n.id">{{ n.id }}</option>
          </select></label
        ><label class="checkbox-label"
          ><input v-model="c.useful" type="checkbox" />Действие {{ i + 1 }} обосновано</label
        ><label
          >Объяснение действия {{ i + 1
          }}<textarea v-model="c.explanation" class="text-input" maxlength="700" /></label
        ><button
          class="button ghost small"
          :disabled="node.choices.length <= 2"
          @click="node.choices.splice(i, 1)"
        >
          Удалить действие {{ i + 1 }}
        </button>
      </fieldset>
      <button
        class="button secondary small"
        :disabled="node.choices.length >= 5"
        @click="
          node.choices.push({
            label: 'Новая диагностическая проверка',
            to: 'END',
            useful: true,
            explanation: 'Объясните, какие данные даст выбранная проверка.',
          })
        "
      >
        Добавить действие
      </button>
    </fieldset>
  </div>
</template>
<style scoped>
.graph-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 12px;
  margin: 16px 0;
}
.graph-node {
  display: flex;
  flex-direction: column;
  align-items: start;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.graph-node[aria-pressed='true'] {
  outline: 2px solid var(--accent);
}
</style>
