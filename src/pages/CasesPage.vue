<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import {
  FolderOpen,
  Download,
  FileUp,
  Trash2,
  ShieldCheck,
  ChevronRight,
  X,
  Columns2,
} from '@lucide/vue'
import {
  listCases,
  importCases,
  deleteCase,
  deleteAllCases,
  renameCase,
} from '../features/cases/repository'
import { createCaseExports } from '../features/cases/exportBundle'
import { parseCaseBundle } from '../features/cases/schema'
import type { LocalCase } from '../features/cases/schema'
import { downloadText } from '../infrastructure/export/exportReport'
const cases = ref<LocalCase[]>([])
const preview = ref<LocalCase>()
const imported = ref<LocalCase[]>([])
const error = ref('')
const status = ref('')
const selected = ref<string[]>([])
const comparison = computed(() => cases.value.filter((c) => selected.value.includes(c.id)))
const comparing = ref(false)
const importGeneration = ref(0)
const importInput = ref<HTMLInputElement>()
const importBusy = ref(false)
const query = ref('')
const command = ref('Все')
const sort = ref('newest')
const editing = ref('')
const newTitle = ref('')
const exportParts = ref<ReturnType<typeof createCaseExports>>([])
const filtered = computed(() =>
  cases.value
    .filter(
      (item) =>
        (command.value === 'Все' || item.command === command.value) &&
        item.title.toLowerCase().includes(query.value.toLowerCase().trim()),
    )
    .sort((a, b) =>
      sort.value === 'title'
        ? a.title.localeCompare(b.title, 'ru')
        : sort.value === 'oldest'
          ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
          : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
)
async function rename(item: LocalCase) {
  try {
    await renameCase(item.id, newTitle.value)
    editing.value = ''
    await refresh()
  } catch {
    error.value = 'Не удалось переименовать кейс. Название должно содержать 1–100 символов.'
  }
}
function edit(item: LocalCase) {
  editing.value = item.id
  newTitle.value = item.title
}
let readVersion = 0
onBeforeUnmount(() => readVersion++)
async function refresh() {
  try {
    cases.value = await listCases()
  } catch {
    error.value = 'Локальное хранилище недоступно. Проверьте разрешения браузера.'
  }
}
onMounted(refresh)
function exported() {
  try {
    const parts = createCaseExports(cases.value)
    if (parts.length === 1) {
      exportParts.value = []
      downloadText(parts[0]!.text, parts[0]!.name, 'application/json;charset=utf-8')
    } else exportParts.value = parts
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось экспортировать кейсы.'
  }
}
async function readImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const version = ++readVersion
  imported.value = []
  error.value = ''
  status.value = ''
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Файл превышает 2 MiB.')
    const bundle = parseCaseBundle(await file.text())
    if (version === readVersion) imported.value = bundle
  } catch (cause: unknown) {
    if (version === readVersion)
      error.value = cause instanceof Error ? cause.message : 'Не удалось прочитать кейсы.'
  }
}
function cancelImport() {
  readVersion++
  imported.value = []
  importGeneration.value++
}
async function confirmImport() {
  if (importBusy.value || !imported.value.length) return
  const batch = [...imported.value]
  importBusy.value = true
  try {
    await importCases(batch)
    status.value = `Импортировано: ${batch.length}`
    imported.value = []
    if (importInput.value) importInput.value.value = ''
    await refresh()
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось сохранить кейсы.'
  } finally {
    importBusy.value = false
  }
}
async function remove(item: LocalCase) {
  if (!window.confirm(`Удалить локальный кейс «${item.title}»?`)) return
  try {
    await deleteCase(item.id)
    selected.value = selected.value.filter((id) => id !== item.id)
    if (preview.value?.id === item.id) preview.value = undefined
    await refresh()
  } catch {
    error.value = 'Не удалось удалить кейс.'
  }
}
async function clearAll() {
  if (!window.confirm('Удалить все сохранённые кейсы на этом устройстве?')) return
  try {
    await deleteAllCases()
    preview.value = undefined
    selected.value = []
    await refresh()
  } catch {
    error.value = 'Не удалось очистить кейсы.'
  }
}
function toggle(id: string) {
  if (selected.value.includes(id)) selected.value = selected.value.filter((v) => v !== id)
  else if (selected.value.length < 2) selected.value.push(id)
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">LOCAL CASES / 05</span>
      <h1>Работа, которую стоит сохранить<span class="accent">.</span></h1>
      <p>Выбранные отчёты на вашем устройстве. Импорт, экспорт и сравнение.</p>
    </div>
    <span class="tag">INDEXEDDB · OPT-IN</span>
  </div>
  <div class="cases-toolbar">
    <label class="button secondary file-label"
      ><FileUp :size="15" /> Импорт JSON<input
        :key="importGeneration"
        ref="importInput"
        type="file"
        :disabled="importBusy"
        accept=".json"
        aria-label="Импортировать файл кейсов"
        @change="readImport" /></label
    ><button class="button secondary" :disabled="!cases.length" @click="exported">
      <Download :size="15" /> Экспорт кейсов</button
    ><button class="button secondary" :disabled="selected.length !== 2" @click="comparing = true">
      <Columns2 :size="15" /> Сравнить {{ selected.length ? `(${selected.length}/2)` : '' }}</button
    ><button class="button ghost" :disabled="!cases.length" @click="clearAll">
      <Trash2 :size="15" /> Удалить всё
    </button>
  </div>
  <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  <p v-if="status" class="case-status" role="status">{{ status }}</p>
  <section v-if="exportParts.length" class="panel feature-section">
    <h2>Экспорт разбит на {{ exportParts.length }} частей</h2>
    <p>Каждый JSON укладывается в лимит импорта 2 MiB. Скачайте и импортируйте части по очереди.</p>
    <div class="button-row">
      <button
        v-for="part in exportParts"
        :key="part.name"
        class="button secondary small"
        @click="downloadText(part.text, part.name, 'application/json;charset=utf-8')"
      >
        {{ part.name }} · {{ part.count }} кейсов
      </button>
    </div>
  </section>
  <section v-if="imported.length" class="panel import-preview">
    <h2>Предпросмотр импорта · {{ imported.length }} кейсов</h2>
    <p>
      JSON проверен по схеме. Его содержимое может включать чувствительные значения — просмотрите
      отчёты. Совпадающие ID будут заменены.
    </p>
    <details v-for="item in imported" :key="item.id">
      <summary>{{ item.title }} · {{ item.command }}</summary>
      <pre tabindex="0" role="region" :aria-label="`Импортируемый отчёт: ${item.title}`">{{
        item.report
      }}</pre>
    </details>
    <div class="import-actions">
      <button class="button primary" :disabled="importBusy" @click="confirmImport">
        {{ importBusy ? 'Сохранение…' : 'Сохранить на этом устройстве' }}</button
      ><button class="button secondary" :disabled="importBusy" @click="cancelImport">Отмена</button>
    </div>
  </section>
  <div v-if="!cases.length && !imported.length" class="panel cases-empty">
    <FolderOpen :size="42" />
    <h2>Пока нет сохранённых кейсов</h2>
    <p>
      Откройте отчёт в анализаторе и нажмите<br />«Сохранить локальный кейс». Сохранение — явное
      действие.
    </p>
    <RouterLink class="button primary" to="/analyzer"
      >Перейти в анализатор <ChevronRight :size="16"
    /></RouterLink>
  </div>
  <div v-if="cases.length" class="panel feature-section">
    <div class="form-grid">
      <label
        >Поиск кейсов<input
          v-model="query"
          class="text-input"
          placeholder="Название проверки" /></label
      ><label
        >Тип команды<select v-model="command" class="text-input">
          <option>Все</option>
          <option
            v-for="kind in [
              'ipconfig',
              'ping',
              'nslookup',
              'tracert',
              'route',
              'dns-records',
              'powershell',
            ]"
            :key="kind"
          >
            {{ kind }}
          </option>
        </select></label
      ><label
        >Порядок кейсов<select v-model="sort" class="text-input">
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
          <option value="title">По названию</option>
        </select></label
      >
    </div>
    <p role="status">Найдено: {{ filtered.length }} / {{ cases.length }}</p>
  </div>
  <div class="cases-grid">
    <article v-for="item in filtered" :key="item.id" class="panel case-card">
      <div class="command-card-top">
        <span class="tag">{{ item.command }}</span
        ><label class="checkbox-label"
          ><input
            type="checkbox"
            :checked="selected.includes(item.id)"
            :disabled="!selected.includes(item.id) && selected.length >= 2"
            :aria-label="`Выбрать для сравнения: ${item.title}`"
            @change="toggle(item.id)"
          />
          Сравнить</label
        >
      </div>
      <h2>{{ item.title }}</h2>
      <form v-if="editing === item.id" @submit.prevent="rename(item)">
        <label
          >Новое название кейса<input
            v-model="newTitle"
            class="text-input"
            maxlength="100"
            required
        /></label>
        <div class="button-row">
          <button class="button secondary small">Сохранить название</button
          ><button class="button ghost small" type="button" @click="editing = ''">
            Отменить переименование
          </button>
        </div>
      </form>
      <p>{{ new Date(item.createdAt).toLocaleString('ru-RU') }}</p>
      <div class="case-actions">
        <button
          class="button ghost small"
          :aria-label="`Переименовать кейс: ${item.title}`"
          @click="edit(item)"
        >
          Переименовать
        </button>
        <button class="button secondary small" @click="preview = item">
          Открыть отчёт <ChevronRight :size="14" /></button
        ><button
          class="icon-button small"
          :aria-label="`Удалить кейс: ${item.title}`"
          @click="remove(item)"
        >
          <Trash2 :size="15" />
        </button>
      </div>
    </article>
  </div>
  <section v-if="preview" class="panel case-report">
    <div class="panel-heading">
      <div>
        <h2>{{ preview.title }}</h2>
      </div>
      <div>
        <button
          class="icon-button"
          aria-label="Скачать сохранённый отчёт"
          @click="downloadText(preview.report, 'workbench-saved-report.md')"
        >
          <Download :size="17" /></button
        ><button
          class="icon-button"
          aria-label="Закрыть сохранённый отчёт"
          @click="preview = undefined"
        >
          <X :size="17" />
        </button>
      </div>
    </div>
    <pre tabindex="0" role="region" aria-label="Текст сохранённого отчёта">{{
      preview.report
    }}</pre>
  </section>
  <section v-if="comparing && comparison.length === 2" class="panel case-comparison">
    <div class="panel-heading">
      <div>
        <Columns2 :size="17" />
        <h2>Сопоставление выбранных проверок</h2>
      </div>
      <button class="icon-button small" aria-label="Закрыть сравнение" @click="comparing = false">
        <X :size="17" />
      </button>
    </div>
    <p>
      Убедитесь, что оба отчёта относятся к одному устройству и согласованному контексту. Workbench
      не объединяет разные компьютеры автоматически.
    </p>
    <div class="comparison-columns">
      <div v-for="item in comparison" :key="item.id">
        <h3>{{ item.title }}</h3>
        <span>{{ new Date(item.createdAt).toLocaleString('ru-RU') }}</span>
        <pre tabindex="0" role="region" :aria-label="`Сравниваемый отчёт: ${item.title}`">{{
          item.report
        }}</pre>
      </div>
    </div>
  </section>
  <div class="training-note">
    <ShieldCheck :size="18" />
    <p>
      Ввод анализатора не сохраняется автоматически. При сохранении кейса записывается только
      обезличенный отчёт. Кейсы остаются до удаления; очистка анализатора их не удаляет.
      Экспортированные файлы и копии браузера удаляются отдельно.
    </p>
  </div>
</template>
