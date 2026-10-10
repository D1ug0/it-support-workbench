<script setup lang="ts">
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { ref, watch } from 'vue'
import { customCourseSchema, type CustomCourse } from './customCourses'
import { skills } from './skills'
import { tracks } from './courses'
import { terminalLabs } from '../terminal/catalog'
import { useWorkshopStore } from './useWorkshopStore'
const text = defineModel<string>({ required: true }),
  store = useWorkshopStore()
const draft = ref<CustomCourse>(customCourseSchema.parse(JSON.parse(text.value)))
watch(text, (value) => {
  try {
    const raw: unknown = JSON.parse(value)
    // Our own form update may contain a space while the user is still typing.
    if (JSON.stringify(raw) === JSON.stringify(draft.value)) return
    const next = customCourseSchema.safeParse(raw)
    if (next.success && JSON.stringify(next.data) !== JSON.stringify(draft.value))
      draft.value = next.data
  } catch {
    /* Preserve the form while JSON is being edited. */
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
function removeOption(index: number) {
  draft.value.options.splice(index, 1)
  if (draft.value.correct === index) draft.value.correct = 0
  else if (draft.value.correct > index) draft.value.correct--
}
function moveStep(index: number) {
  const previous = draft.value.steps[index - 1]!
  draft.value.steps[index - 1] = draft.value.steps[index]!
  draft.value.steps[index] = previous
}
</script>
<template>
  <div class="workshop-item">
    <h4>Конструктор курса</h4>
    <label
      >Название авторского курса<input v-model="draft.title" class="text-input" maxlength="160"
    /></label>
    <label
      >Навык курса<AppSelect v-model="draft.skill" class="text-input">
        <AppSelectOption v-for="s in skills" :key="s.id" :value="s.id">{{
          s.title
        }}</AppSelectOption>
      </AppSelect></label
    >
    <fieldset>
      <legend>Направления курса</legend>
      <label v-for="t in tracks" :key="t.id" class="checkbox-label"
        ><input v-model="draft.tracks" type="checkbox" :value="t.id" />{{ t.title }}</label
      >
    </fieldset>
    <fieldset>
      <legend>Материал курса</legend>
      <div v-for="(_, i) in draft.paragraphs" :key="i">
        <label
          >Абзац {{ i + 1
          }}<textarea
            v-model="draft.paragraphs[i]"
            class="text-input"
            rows="3"
            maxlength="4000"
          /></label
        ><button
          class="button ghost small"
          :disabled="draft.paragraphs.length <= 1"
          @click="draft.paragraphs.splice(i, 1)"
        >
          Удалить абзац {{ i + 1 }}
        </button>
      </div>
      <button
        class="button secondary small"
        :disabled="draft.paragraphs.length >= 12"
        @click="draft.paragraphs.push('Новый учебный абзац: опишите факты и способ проверки.')"
      >
        Добавить абзац
      </button>
    </fieldset>
    <fieldset>
      <legend>Шаги практики</legend>
      <div v-for="(_, i) in draft.steps" :key="i">
        <label
          >Шаг курса {{ i + 1 }}<input v-model="draft.steps[i]" class="text-input" maxlength="1000"
        /></label>
        <div class="button-row">
          <button class="button ghost small" :disabled="i === 0" @click="moveStep(i)">
            Шаг {{ i + 1 }} выше</button
          ><button
            class="button ghost small"
            :disabled="draft.steps.length <= 2"
            @click="draft.steps.splice(i, 1)"
          >
            Удалить шаг {{ i + 1 }}
          </button>
        </div>
      </div>
      <button
        class="button secondary small"
        :disabled="draft.steps.length >= 10"
        @click="draft.steps.push('Проверьте результат и запишите вывод.')"
      >
        Добавить шаг курса
      </button>
    </fieldset>
    <label
      >Вопрос курса<textarea v-model="draft.question" class="text-input" maxlength="500" />
    </label>
    <fieldset>
      <legend>Ответы курса</legend>
      <div v-for="(_, i) in draft.options" :key="i">
        <label
          >Ответ курса {{ i + 1
          }}<input v-model="draft.options[i]" class="text-input" maxlength="500" /></label
        ><button
          class="button ghost small"
          :disabled="draft.options.length <= 2"
          @click="removeOption(i)"
        >
          Удалить ответ {{ i + 1 }}
        </button>
      </div>
      <button
        class="button secondary small"
        :disabled="draft.options.length >= 5"
        @click="draft.options.push(`Новый вариант ${draft.options.length + 1}`)"
      >
        Добавить ответ</button
      ><label
        >Правильный ответ курса<AppSelect v-model="draft.correct" class="text-input">
          <AppSelectOption v-for="(_, i) in draft.options" :key="i" :value="i">
            {{ i + 1 }} · {{ draft.options[i] }}
          </AppSelectOption>
        </AppSelect></label
      >
    </fieldset>
    <label
      >Объяснение ответа<textarea
        v-model="draft.why"
        class="text-input"
        rows="3"
        maxlength="2000"
      />
    </label>
    <fieldset>
      <legend>Лаборатории курса (до 8)</legend>
      <label
        v-for="lab in [...terminalLabs, ...store.customLabs]"
        :key="lab.id"
        class="checkbox-label"
        ><input
          v-model="draft.labs"
          type="checkbox"
          :value="lab.id"
          :disabled="!draft.labs.includes(lab.id) && draft.labs.length >= 8"
        />{{ lab.title }}</label
      >
    </fieldset>
    <label
      >Источник курса HTTPS<input
        v-model="draft.source"
        class="text-input"
        type="url"
        maxlength="500"
    /></label>
  </div>
</template>
