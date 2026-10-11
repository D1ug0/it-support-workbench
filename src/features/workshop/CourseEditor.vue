<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { workshopCourses } from './courses'
import { customCourseSchema, parseCustomCourses, type CustomCourse } from './customCourses'
import { downloadText } from '../../infrastructure/export/exportReport'
import CourseForm from './CourseForm.vue'
import { confirmDiscardForms, useUnsavedChanges } from '../../shared/unsavedChanges'
import type { MaterialTokens } from './materialsRepository'
const store = useWorkshopStore()
const text = ref(''),
  consent = ref(false),
  error = ref(''),
  notice = ref(''),
  busy = ref(false),
  pending = ref<CustomCourse[]>()
const { markSaved } = useUnsavedChanges(() => text.value)
const expected = ref<MaterialTokens>({}),
  pendingTokens = ref<MaterialTokens>({})
function newTemplate(initial = false) {
  if (!initial && (busy.value || !confirmDiscardForms())) return
  text.value = JSON.stringify(
    {
      ...workshopCourses[0],
      schemaVersion: 1,
      id: `COURSE-${globalThis.crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
      title: 'Мой курс по адресации',
    },
    null,
    2,
  )
  notice.value = ''
  expected.value = {}
  markSaved()
}
newTemplate(true)
function edit(course: CustomCourse) {
  if (busy.value || !confirmDiscardForms()) return
  text.value = JSON.stringify(course, null, 2)
  expected.value = store.tokensFor('courses', [course.id])
  consent.value = false
  notice.value = ''
  markSaved()
}
const valid = computed(() => {
  if (new globalThis.TextEncoder().encode(text.value).length > 131072) return undefined
  try {
    return customCourseSchema.safeParse(JSON.parse(text.value))
  } catch {
    return undefined
  }
})
async function save(values?: CustomCourse[]) {
  if (busy.value) return
  error.value = ''
  notice.value = ''
  if (!consent.value) {
    error.value = 'Подтвердите авторский учебный материал перед сохранением.'
    return
  }
  if (!values && !valid.value?.success) {
    error.value = 'Исправьте JSON по схеме шаблона.'
    return
  }
  busy.value = true
  const before = text.value
  try {
    const draft = valid.value?.success ? valid.value.data : undefined,
      submitted = values ?? [customCourseSchema.parse(JSON.parse(before))],
      tokens = values ? pendingTokens.value : expected.value
    const stored = await store.saveCourses(submitted, tokens)
    if (draft && submitted.some((value) => JSON.stringify(value) === JSON.stringify(draft))) {
      expected.value = { ...expected.value, ...stored }
      markSaved(before)
    }
    pending.value = undefined
    notice.value = 'Авторские курсы сохранены. Откройте их в новых курсах своего направления.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Сохранение недоступно.'
  } finally {
    busy.value = false
  }
}
function exportCourses(values?: CustomCourse[]) {
  const courses = values ?? (valid.value?.success ? [valid.value.data] : [])
  if (!courses.length) return
  downloadText(
    JSON.stringify({ schemaVersion: 1, courses }, null, 2),
    'workbench-authored-courses.json',
    'application/json;charset=utf-8',
  )
}
let generation = 0
onBeforeUnmount(() => generation++)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const current = ++generation
  pending.value = undefined
  error.value = ''
  try {
    if (file.size > 131072) throw new Error('Лимит пакета курсов: 128 KiB.')
    const courses = parseCustomCourses(await file.text())
    if (current === generation) {
      pending.value = courses
      pendingTokens.value = store.tokensFor(
        'courses',
        courses.map((c) => c.id),
      )
    }
  } catch (e) {
    if (current === generation) error.value = e instanceof Error ? e.message : 'Ошибка импорта.'
  } finally {
    input.value = ''
  }
}
async function remove(id: string) {
  if (
    busy.value ||
    !window.confirm('Удалить этот авторский курс с устройства? Экспортированные файлы останутся.')
  )
    return
  busy.value = true
  try {
    await store.removeCourse(id)
  } catch {
    error.value = 'Удаление курса не удалось.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Редактор авторских курсов</h3>
    <p>
      Добавьте собственную тему, материал, шаги, вопрос с объяснением и HTTPS-источник. ID создаётся
      шаблоном; встроенные курсы не перезаписываются. До 20 курсов, пакет до 128 KiB. При переносе
      сначала импортируйте указанные авторские лаборатории.
    </p>
    <p>
      Материал автора показывается с отдельной отметкой. Его вопрос помогает самопроверке и не
      повышает встроенную оценку навыка. Текст и источник проверяет автор; HTML не исполняется.
    </p>
    <button class="button secondary" :disabled="busy" @click="newTemplate()">
      Новый шаблон курса
    </button>
    <CourseForm v-model="text" />
    <details>
      <summary>Расширенное редактирование JSON курса</summary>
      <label
        >Авторский курс JSON<textarea
          v-model="text"
          class="text-input"
          rows="18"
          spellcheck="false"
          maxlength="131072"
        />
      </label>
    </details>
    <p v-if="!valid?.success" role="status">
      {{
        valid && !valid.success
          ? valid.error.issues[0]?.message
          : 'Нужен корректный JSON до 128 KiB.'
      }}
    </p>
    <details v-if="valid?.success">
      <summary>Предпросмотр авторского курса</summary>
      <h4>{{ valid.data.title }}</h4>
      <p v-for="(p, i) in valid.data.paragraphs" :key="i">{{ p }}</p>
      <p>{{ valid.data.question }}</p>
      <ol>
        <li v-for="(o, i) in valid.data.options" :key="i">{{ o }}</li>
      </ol>
    </details>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Подтверждаю авторский учебный материал без
      чувствительных данных</label
    >
    <div class="button-row">
      <button class="button primary" :disabled="busy || !valid?.success" @click="save()">
        Сохранить авторский курс</button
      ><button class="button secondary" :disabled="!valid?.success" @click="exportCourses()">
        Экспорт черновика курса
      </button>
    </div>
    <label
      >Импорт авторских курсов<input type="file" accept=".json,application/json" @change="read"
    /></label>
    <div v-if="pending" class="terminal-checkpoint-preview">
      <p>
        Курсов: {{ pending.length }}. {{ pending.map((c) => c.title).join('; ') }}. Совпадающие
        COURSE-ID обновляются после подтверждения.
      </p>
      <button class="button secondary" :disabled="busy" @click="save(pending)">
        Подтвердить импорт курсов</button
      ><button class="button ghost" @click="pending = undefined">Отмена импорта курсов</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <h4>Сохранённые авторские курсы ({{ store.customCourses.length }}/20)</h4>
    <div v-for="c in store.customCourses" :key="c.id" class="workshop-item">
      <strong>{{ c.title }}</strong>
      <div class="button-row">
        <RouterLink class="button secondary" :to="`/learning?view=workshop&lesson=${c.id}`"
          >Изучить авторский курс</RouterLink
        ><button class="button secondary" @click="edit(c)">Редактировать курс</button
        ><button class="button ghost" @click="exportCourses([c])">Экспорт курса</button
        ><button class="button ghost" :disabled="busy" @click="remove(c.id)">
          Удалить авторский курс
        </button>
      </div>
    </div>
  </section>
</template>
