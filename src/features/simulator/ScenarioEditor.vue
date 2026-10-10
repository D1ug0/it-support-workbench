<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Scenario } from './engine'
import {
  newScenario,
  newStep,
  customScenarioSchema,
  parseScenarioBundle,
  scenarioBundle,
} from './custom'
import { readScenarios, saveScenarios, deleteScenario } from './customRepository'
import { scenarios } from './scenarios'
import { downloadText } from '../../infrastructure/export/exportReport'
const emit = defineEmits<{ updated: [values: Scenario[]] }>()
const draft = ref(newScenario()),
  items = ref<Scenario[]>([]),
  incoming = ref<Scenario[]>([]),
  consent = ref(false),
  error = ref(''),
  status = ref(''),
  busy = ref(false)
const importConsent = ref(false)
const templateId = ref(scenarios[0]!.id)
function message(cause: unknown) {
  return cause instanceof Error ? cause.message.slice(0, 1500) : 'Не удалось обработать сценарий.'
}
async function refresh() {
  const loaded = await readScenarios()
  items.value = loaded.valid
  if (loaded.problems.length)
    error.value = `Не прочитано записей: ${loaded.problems.length}. ${loaded.problems.map((p) => `${p.id}: ${p.reason}`).join('; ')}. Исходные записи можно экспортировать в настройках.`
  emit('updated', items.value)
}
onMounted(async () => {
  try {
    await refresh()
  } catch {
    error.value = 'Хранилище недоступно. Можно подготовить и скачать сценарий без сохранения.'
  }
})
function edit(value: Scenario) {
  draft.value = JSON.parse(JSON.stringify(value)) as Scenario
  consent.value = false
  error.value = ''
  status.value = ''
}
function blank() {
  edit(newScenario())
}
function fromTemplate() {
  const source = scenarios.find((s) => s.id === templateId.value)!
  edit({ ...source, id: `USR-${globalThis.crypto.randomUUID()}`, title: `Копия: ${source.title}` })
}
function addStep() {
  if (draft.value.steps.length < 10) {
    let n = 1
    while (draft.value.steps.some((s) => s.id === `step-${n}`)) n++
    draft.value.steps.push(newStep(n))
  }
}
function move(index: number, direction: number) {
  const other = index + direction
  if (other < 0 || other >= draft.value.steps.length) return
  const [step] = draft.value.steps.splice(index, 1)
  draft.value.steps.splice(other, 0, step!)
}
function addChoice(index: number) {
  const step = draft.value.steps[index]!
  if (step.choices.length >= 5) return
  let n = 1
  while (step.choices.some((c) => c.id === `action-${n}`)) n++
  step.choices.push({
    id: `action-${n}`,
    label: 'Новая проверка',
    result: 'Учебный результат.',
    explanation: 'Объясните пользу или ошибку действия.',
    safe: true,
  })
}
function removeChoice(index: number, choiceId: string) {
  const step = draft.value.steps[index]!
  if (step.choices.length <= 2) return
  step.choices = step.choices.filter((c) => c.id !== choiceId)
  if (step.recommendedId === choiceId)
    step.recommendedId = step.choices.find((c) => c.safe)?.id ?? ''
}
function validated() {
  if (!consent.value) throw new Error('Подтвердите использование только учебных данных.')
  const parsed = customScenarioSchema.safeParse(draft.value)
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'))
  return parsed.data
}
async function save() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const value = validated()
    await saveScenarios([value])
    await refresh()
    status.value = 'Сценарий сохранён. Откройте «Проходить инциденты», чтобы проверить его.'
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}
function download() {
  try {
    downloadText(scenarioBundle([validated()]), 'workbench-scenario.json', 'application/json')
    error.value = ''
  } catch (cause) {
    error.value = message(cause)
  }
}
async function readFile(event: Event) {
  error.value = ''
  incoming.value = []
  importConsent.value = false
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Файл превышает 2 MiB.')
    incoming.value = parseScenarioBundle(await file.text()).scenarios
    status.value = 'Проверьте импортируемые сценарии перед сохранением.'
  } catch (cause) {
    error.value = message(cause)
  } finally {
    input.value = ''
  }
}
async function importAll() {
  if (!importConsent.value || busy.value) return
  busy.value = true
  try {
    await saveScenarios(incoming.value)
    await refresh()
    incoming.value = []
    status.value = 'Сценарии импортированы.'
    error.value = ''
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}
async function remove(id: string) {
  if (
    !window.confirm(
      'Удалить этот пользовательский сценарий из браузера? Учебный прогресс останется.',
    )
  )
    return
  try {
    await deleteScenario(id)
    await refresh()
    status.value = 'Сценарий удалён.'
  } catch (cause) {
    error.value = message(cause)
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Редактор учебных инцидентов</h2>
    <p>
      Создайте последовательность из 1–10 этапов с 2–5 действиями. Обоснованный безопасный ответ
      переводит к следующему этапу; ошибка оставляет на текущем. Это линейная учебная модель:
      реальные команды не выполняются.
    </p>
    <p>
      Тексты сохраняются только по кнопке в этом браузере. Используйте вымышленные имена и адреса:
      свободный текст сценария автоматически не обезличивается. Лимит — 20 сценариев, 64 KiB на
      один, 1 MiB всего.
    </p>
    <div class="button-row">
      <button class="button secondary small" @click="blank">Новый сценарий</button
      ><label
        >Шаблон<select v-model="templateId" class="text-input">
          <option v-for="s in scenarios" :key="s.id" :value="s.id">{{ s.title }}</option>
        </select></label
      ><button class="button secondary small" @click="fromTemplate">Взять за основу</button>
    </div>
    <form @submit.prevent="save">
      <div class="form-grid feature-section">
        <label
          >Название сценария<input
            v-model="draft.title"
            required
            maxlength="120"
            class="text-input"
        /></label>
        <label
          >Категория<input v-model="draft.category" required maxlength="60" class="text-input"
        /></label>
        <label
          >Сложность<select v-model="draft.difficulty" class="text-input">
            <option>Начальный</option>
            <option>Средний</option>
          </select></label
        >
      </div>
      <label class="editor-field"
        >Симптом и цель<textarea
          v-model="draft.brief"
          required
          maxlength="2000"
          class="text-input"
          rows="3"
        />
      </label>
      <label class="editor-field"
        >Исходные учебные данные<textarea
          v-model="draft.context"
          required
          maxlength="8000"
          class="text-input"
          rows="4"
        />
      </label>
      <label class="editor-field"
        >Итог и критерий восстановления<textarea
          v-model="draft.resolution"
          required
          maxlength="2000"
          class="text-input"
          rows="3"
        />
      </label>
      <fieldset v-for="(step, index) in draft.steps" :key="step.id" class="editor-step">
        <legend>Этап {{ index + 1 }}</legend>
        <div class="button-row">
          <button
            type="button"
            class="button ghost small"
            :disabled="index === 0"
            @click="move(index, -1)"
          >
            Выше</button
          ><button
            type="button"
            class="button ghost small"
            :disabled="index === draft.steps.length - 1"
            @click="move(index, 1)"
          >
            Ниже</button
          ><button
            type="button"
            class="button ghost small"
            :disabled="draft.steps.length === 1"
            @click="draft.steps.splice(index, 1)"
          >
            Удалить этап
          </button>
        </div>
        <label class="editor-field"
          >Вопрос этапа<textarea
            v-model="step.question"
            required
            maxlength="2000"
            class="text-input"
            rows="2"
          />
        </label>
        <label class="editor-field"
          >Обоснованное действие<select v-model="step.recommendedId" class="text-input">
            <option v-for="c in step.choices" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select></label
        >
        <div v-for="(choice, ci) in step.choices" :key="choice.id" class="editor-choice">
          <h3>Действие {{ ci + 1 }}</h3>
          <label class="editor-field"
            >Формулировка<input v-model="choice.label" required maxlength="2000" class="text-input"
          /></label>
          <label class="editor-field"
            >Синтетический результат<textarea
              v-model="choice.result"
              required
              maxlength="2000"
              class="text-input"
              rows="2"
            />
          </label>
          <label class="editor-field"
            >Объяснение<textarea
              v-model="choice.explanation"
              required
              maxlength="2000"
              class="text-input"
              rows="2"
            />
          </label>
          <label class="checkbox-label"
            ><input v-model="choice.safe" type="checkbox" /> Действие безопасно в условиях
            сценария</label
          >
          <button
            type="button"
            class="button ghost small"
            :disabled="step.choices.length <= 2"
            @click="removeChoice(index, choice.id)"
          >
            Удалить действие
          </button>
        </div>
        <button
          type="button"
          class="button secondary small"
          :disabled="step.choices.length >= 5"
          @click="addChoice(index)"
        >
          Добавить действие
        </button>
      </fieldset>
      <button
        type="button"
        class="button secondary small"
        :disabled="draft.steps.length >= 10"
        @click="addStep"
      >
        Добавить этап
      </button>
      <label class="checkbox-label feature-section"
        ><input v-model="consent" type="checkbox" /> Подтверждаю, что использованы только учебные
        данные</label
      >
      <div class="button-row">
        <button class="button primary" :disabled="!consent || busy">Сохранить сценарий</button
        ><button
          type="button"
          class="button secondary"
          :disabled="!consent || busy"
          @click="download"
        >
          Скачать сценарий JSON
        </button>
      </div>
    </form>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="status" role="status">{{ status }}</p>
  </section>
  <section class="panel feature-section">
    <h2>Мои сценарии — {{ items.length }} / 20</h2>
    <p v-if="!items.length">Сохранённые сценарии появятся здесь и в тренажёре.</p>
    <article v-for="s in items" :key="s.id" class="session-observation">
      <h3>{{ s.title }}</h3>
      <p>Этапов: {{ s.steps.length }} · {{ s.category }}</p>
      <div class="button-row">
        <button class="button secondary small" @click="edit(s)">Редактировать</button
        ><RouterLink
          class="button secondary small"
          :to="{ path: '/simulator', query: { scenario: s.id } }"
          >Пройти</RouterLink
        ><button class="button ghost small" @click="remove(s.id)">Удалить</button>
      </div>
    </article>
    <label class="editor-field"
      >Импорт сценариев JSON<input
        type="file"
        accept=".json,application/json"
        :disabled="busy"
        @change="readFile"
    /></label>
    <template v-if="incoming.length"
      ><h3>Предпросмотр импорта</h3>
      <p>Совпадающие пользовательские ID будут обновлены. Встроенные сценарии изменить нельзя.</p>
      <ul>
        <li v-for="s in incoming" :key="s.id">{{ s.title }} — Этапов: {{ s.steps.length }}</li>
      </ul>
      <label class="checkbox-label"
        ><input v-model="importConsent" type="checkbox" /> Подтверждаю учебные данные импортируемых
        сценариев</label
      >
      <button class="button primary small" :disabled="!importConsent || busy" @click="importAll">
        Импортировать сценарии ({{ incoming.length }})
      </button>
    </template>
  </section>
</template>
