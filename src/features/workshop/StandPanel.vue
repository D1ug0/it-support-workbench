<script setup lang="ts">
import { confirmDiscardForms, useUnsavedChanges } from '../../shared/unsavedChanges'
import { drafts, draftSchema, saveDraft } from './drafts'
import { loadCollection } from './collectionLoader'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { standTasks, standAttemptSchema, standMarkdown, type StandAttempt } from './stand'
import { useWorkshopStore } from './useWorkshopStore'
import { workshopCourses } from './courses'
import { saveStandAttempt, standAttempts } from './backupRepository'
import { downloadText } from '../../infrastructure/export/exportReport'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { detectCommand } from '../../infrastructure/parser/detectCommand'
import { compareOutputs, formatDifference } from '../sessions/session'
import type { ParsedOutput } from '../../domain/types/outputs'
const taskId = ref(standTasks[0]!.id),
  task = computed(() => standTasks.find((t) => t.id === taskId.value)!)
const own = ref(false),
  isolated = ref(false),
  snapshot = ref(false),
  consent = ref(false),
  busy = ref(false),
  error = ref(''),
  notice = ref('')
const notes = ref({
  platform: '',
  symptom: '',
  hypothesis: '',
  change: '',
  verification: '',
  answer: '',
  completedSteps: [] as number[],
})
const draftId = ref<string>(globalThis.crypto.randomUUID()),
  attemptId = ref<string>(globalThis.crypto.randomUUID()),
  previousTask = ref(taskId.value)
const { markSaved } = useUnsavedChanges(() => JSON.stringify(notes.value))
const savedDrafts = ref<import('./drafts').LearningDraft[]>([])
const saved = ref<StandAttempt[]>([]),
  revealed = ref(false)
const captures = ref<{ before?: ParsedOutput; after?: ParsedOutput }>({}),
  captureNotice = ref('')
const differences = computed(() =>
  captures.value.before && captures.value.after
    ? compareOutputs(captures.value.before, captures.value.after)
    : [],
)
let generation = 0
onBeforeUnmount(() => generation++)
onMounted(async () => {
  try {
    const loaded = loadCollection(
      'standAttempts',
      await standAttempts.toArray(),
      standAttemptSchema,
    )
    saved.value = loaded.valid
    if (loaded.problems.length)
      error.value = `Проблемные отчёты: ${loaded.problems.length}; исходные записи доступны в настройках.`
    savedDrafts.value = loadCollection('drafts', await drafts.toArray(), draftSchema).valid.filter(
      (d) => d.kind === 'stand',
    )
  } catch {
    error.value = 'Отчёты стенда недоступны; можно экспортировать черновик.'
  }
})
function changeTask() {
  if (busy.value || !confirmDiscardForms()) {
    taskId.value = previousTask.value
    return
  }
  previousTask.value = taskId.value
  draftId.value = globalThis.crypto.randomUUID()
  attemptId.value = globalThis.crypto.randomUUID()
  generation++
  notes.value = {
    platform: '',
    symptom: '',
    hypothesis: '',
    change: '',
    verification: '',
    answer: '',
    completedSteps: [],
  }
  captures.value = {}
  captureNotice.value = ''
  notice.value = ''
  consent.value = false
  markSaved()
}
function clearCaptures() {
  generation++
  captures.value = {}
  captureNotice.value = ''
}
function draft(): StandAttempt {
  return standAttemptSchema.parse({
    ...notes.value,
    taskId: task.value.id,
    id: draftId.value,
    at: new Date().toISOString(),
  })
}
async function save() {
  if (busy.value || !own.value || !isolated.value || !snapshot.value || !consent.value) return
  busy.value = true
  error.value = ''
  const before = JSON.stringify(notes.value),
    id = attemptId.value
  try {
    const value = draft()
    await saveStandAttempt(value)
    await useWorkshopStore().addEvent({
      attemptId: id,
      module: 'stand',
      taskId: value.taskId,
      skill: standTasks.find((t) => t.id === value.taskId)!.skill,
      at: value.at,
      score: null,
      outcome: 'self-reported',
    })
    saved.value = [...saved.value.filter((a) => a.id !== value.id), value]
    markSaved(before)
    notice.value =
      'Отчёт стенда сохранён. Это ваша запись о практике, без автоматической аттестации навыка.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось сохранить отчёт.'
  } finally {
    busy.value = false
  }
}
function exportDraft() {
  try {
    downloadText(standMarkdown(draft()), 'workbench-stand-report.md')
  } catch {
    error.value = 'Заполните ОС, четыре поля разбора и самостоятельное объяснение.'
  }
}
async function read(event: Event, side: 'before' | 'after') {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const current = ++generation
  captures.value = { ...captures.value, [side]: undefined }
  captureNotice.value = ''
  try {
    if (file.size > 262144) throw new Error('Лимит учебного вывода: 256 KiB.')
    const text = await file.text(),
      detected = detectCommand(text)
    if (detected.kind === 'unknown')
      throw new Error(
        'Этот формат не разбирается автоматически. Опишите наблюдения в отчёте; команды стенда выполняются вручную.',
      )
    const result = analyzeOutput(text, detected.kind)
    if (!result.parse.value)
      throw new Error('Вывод не распознан полностью. Проверьте формат и обезличивание.')
    const other = captures.value[side === 'before' ? 'after' : 'before']
    if (
      other &&
      (other.kind !== result.parse.value.kind ||
        (other.kind === 'powershell' &&
          result.parse.value.kind === 'powershell' &&
          other.cmdlet !== result.parse.value.cmdlet))
    )
      throw new Error('Для сравнения выберите выводы одной команды.')
    if (current === generation) {
      captures.value = { ...captures.value, [side]: result.parse.value }
      captureNotice.value = `Разобран ${detected.kind}. Вывод находится только в памяти; в отчёт и копию не попадёт.`
    }
  } catch (e) {
    if (current === generation)
      error.value = e instanceof Error ? e.message : 'Вывод не поддерживается.'
  } finally {
    input.value = ''
  }
}
async function remove(id: string) {
  if (!window.confirm('Удалить сохранённый отчёт стенда?')) return
  try {
    await standAttempts.delete(id)
    saved.value = saved.value.filter((a) => a.id !== id)
  } catch {
    error.value = 'Удаление не удалось.'
  }
}
async function saveNotes() {
  if (!consent.value || busy.value) return
  busy.value = true
  const before = JSON.stringify(notes.value)
  try {
    const value = draftSchema.parse({
      id: draftId.value,
      attemptId: attemptId.value,
      kind: 'stand',
      taskId: taskId.value,
      at: new Date().toISOString(),
      notes: { ...notes.value, completedSteps: JSON.stringify(notes.value.completedSteps) },
    })
    await saveDraft(value)
    savedDrafts.value = [...savedDrafts.value.filter((d) => d.id !== value.id), value]
    markSaved(before)
    notice.value = 'Учебный черновик стенда сохранён без исходных файлов.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Черновик не сохранён.'
  } finally {
    busy.value = false
  }
}
function resumeDraft(id: string) {
  if (busy.value || !confirmDiscardForms()) return
  const d = savedDrafts.value.find((d) => d.id === id)
  if (!d) return
  draftId.value = d.id
  attemptId.value = d.attemptId
  taskId.value = d.taskId
  previousTask.value = d.taskId
  notes.value = {
    platform: d.notes.platform ?? '',
    symptom: d.notes.symptom ?? '',
    hypothesis: d.notes.hypothesis ?? '',
    change: d.notes.change ?? '',
    verification: d.notes.verification ?? '',
    answer: d.notes.answer ?? '',
    completedSteps: [],
  }
  // Notes are untrusted imports; malformed step JSON cannot block restoring the text.
  try {
    const steps = JSON.parse(d.notes.completedSteps ?? '[]')
    if (Array.isArray(steps) && steps.every((i) => Number.isInteger(i) && i >= 0 && i < 4))
      notes.value.completedSteps = [...new Set(steps)]
  } catch {
    /* continue with text */
  }
  consent.value = false
  captures.value = {}
  markSaved()
}
</script>
<template>
  <section class="workshop-item">
    <h4>Пошаговая практика на своей ОС</h4>
    <p>
      Выполняйте команды вручную в собственном стенде. Здесь отмечаются шаги и ваши выводы;
      результат не повышает оценку самостоятельного владения в симуляторе.
    </p>
    <label
      >Задание настоящего стенда<select v-model="taskId" class="text-input" @change="changeTask">
        <option v-for="t in standTasks" :key="t.id" :value="t.id">{{ t.title }}</option>
      </select></label
    >
    <label
      >Продолжить черновик стенда<select
        class="text-input"
        @change="resumeDraft(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Выберите черновик</option>
        <option v-for="d in savedDrafts" :key="d.id" :value="d.id">
          {{ d.taskId }} · {{ d.at }}
        </option>
      </select></label
    >
    <p>{{ task.objective }} · {{ task.platform }}</p>
    <RouterLink
      class="text-link"
      :to="`/learning?view=workshop&lesson=${workshopCourses.find((c) => c.skill === task.skill)?.id ?? 'ADDRESS'}`"
      >Повторить материал перед заданием</RouterLink
    >
    <label class="checkbox-label"
      ><input v-model="own" type="checkbox" />Работаю в собственном разрешённом учебном
      окружении</label
    >
    <label class="checkbox-label"
      ><input v-model="isolated" type="checkbox" />Учебное окружение изолировано от рабочих
      систем</label
    >
    <label class="checkbox-label"
      ><input v-model="snapshot" type="checkbox" />Подготовил снимок или копию и способ
      восстановления</label
    >
    <p>
      В командах замените прописные обозначения своими учебными значениями. Автоматического
      выполнения нет.
    </p>
    <pre v-if="task.commands.length" class="workshop-report-preview" tabindex="0">{{
      task.commands.join('\n')
    }}</pre>
    <fieldset>
      <legend>Шаги задания</legend>
      <label v-for="(step, i) in task.steps" :key="step" class="checkbox-label"
        ><input v-model="notes.completedSteps" type="checkbox" :value="i" />{{ step }}</label
      >
    </fieldset>
    <details>
      <summary>Сравнить обезличенный вывод до и после в памяти</summary>
      <p>
        Поддерживаются форматы анализатора. Linux journal, Git и другие произвольные логи описывайте
        вручную. Значения при сравнении скрыты; raw не сохраняется.
      </p>
      <label
        >Учебный вывод до<input
          type="file"
          accept=".txt,.json,text/plain,application/json"
          @change="read($event, 'before')" /></label
      ><label
        >Учебный вывод после<input
          type="file"
          accept=".txt,.json,text/plain,application/json"
          @change="read($event, 'after')"
      /></label>
      <p role="status">{{ captureNotice }}</p>
      <ul>
        <li v-for="(d, i) in differences" :key="i">
          {{ d.scope }} · {{ d.field }}: {{ formatDifference(d.before) }} →
          {{ formatDifference(d.after) }}
        </li>
      </ul>
      <p v-if="captures.before && captures.after && !differences.length">
        Различий в поддерживаемых полях не найдено.
      </p>
      <button class="button ghost" @click="clearCaptures">Очистить учебные выводы</button>
    </details>
    <label
      >ОС, версия и локаль стенда<input v-model="notes.platform" class="text-input" maxlength="160"
    /></label>
    <label
      >Симптом стенда<textarea v-model="notes.symptom" class="text-input" maxlength="1200" /></label
    ><label
      >Гипотеза стенда<textarea
        v-model="notes.hypothesis"
        class="text-input"
        maxlength="1200"
      /></label
    ><label
      >Изменение на стенде<textarea
        v-model="notes.change"
        class="text-input"
        maxlength="1200"
      /></label
    ><label
      >Повторная проверка на стенде<textarea
        v-model="notes.verification"
        class="text-input"
        maxlength="1200"
      />
    </label>
    <p>{{ task.question }}</p>
    <label
      >Самостоятельное объяснение<textarea
        v-model="notes.answer"
        class="text-input"
        maxlength="1800"
      />
    </label>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Проверил отчёт стенда: только обезличенные учебные
      заметки</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="!consent || busy" @click="saveNotes">
        Сохранить черновик стенда
      </button>
      <button
        class="button primary"
        :disabled="busy || !own || !isolated || !snapshot || !consent"
        @click="save"
      >
        Сохранить отчёт стенда</button
      ><button class="button secondary" :disabled="!consent" @click="exportDraft">
        Скачать черновик отчёта стенда
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <details>
      <summary @click="revealed = true">Отчёты стенда ({{ saved.length }}/50)</summary>
      <template v-if="revealed"
        ><article v-for="a in saved" :key="a.id" class="workshop-item">
          <h5>{{ standTasks.find((t) => t.id === a.taskId)?.title }} · {{ a.at }}</h5>
          <pre class="workshop-report-preview" tabindex="0">{{ standMarkdown(a) }}</pre>
          <button
            class="button secondary"
            @click="downloadText(standMarkdown(a), 'workbench-stand-report.md')"
          >
            Экспорт отчёта стенда</button
          ><button class="button ghost" @click="remove(a.id)">Удалить отчёт стенда</button>
        </article></template
      >
    </details>
  </section>
</template>
