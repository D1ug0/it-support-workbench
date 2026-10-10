<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSessionStore } from './useSessionStore'
import { createArchive, archiveJson, parseArchive, type SessionArchive } from './archive'
import { listArchives, saveArchive, deleteArchive } from './archiveRepository'
import { downloadText } from '../../infrastructure/export/exportReport'
const session = useSessionStore(),
  items = ref<SessionArchive[]>([]),
  draft = ref<SessionArchive>(),
  preview = ref(''),
  consent = ref(false),
  busy = ref(false),
  error = ref(''),
  status = ref('')
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message.slice(0, 1000) : 'Не удалось обработать архив.'
async function refresh() {
  items.value = await listArchives()
}
onMounted(async () => {
  try {
    await refresh()
  } catch {
    error.value = 'Хранилище архивов недоступно. JSON можно скачать без сохранения.'
  }
})
function inspect(value: SessionArchive) {
  draft.value = value
  preview.value = archiveJson(value)
  consent.value = false
  error.value = ''
}
function prepare() {
  try {
    inspect(createArchive(session.records))
    status.value = 'Обезличенный архив подготовлен. Проверьте предпросмотр.'
  } catch (cause) {
    error.value = message(cause)
  }
}
async function save() {
  if (!draft.value || !consent.value || busy.value) return
  busy.value = true
  try {
    await saveArchive(draft.value)
    await refresh()
    status.value = 'Архив сохранён в этом браузере.'
    error.value = ''
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}
function restore(value: SessionArchive) {
  if (
    session.active &&
    !window.confirm(
      'Заменить рабочую сессию обезличенным архивом? Несохранённые исходники текущей сессии будут потеряны.',
    )
  )
    return
  session.restore(value)
  status.value = 'Архив открыт для просмотра и сравнения. Исходники не сохранялись.'
  error.value = ''
}
async function remove(id: string) {
  if (!window.confirm('Удалить архив из этого браузера?')) return
  try {
    await deleteArchive(id)
    await refresh()
    if (draft.value?.id === id) {
      draft.value = undefined
      preview.value = ''
    }
    status.value = 'Архив удалён.'
  } catch (cause) {
    error.value = message(cause)
  }
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  draft.value = undefined
  preview.value = ''
  error.value = ''
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Файл превышает 2 MiB.')
    inspect(parseArchive(await file.text()))
    status.value = 'Импорт проверен. Сохраните архив или откройте для просмотра.'
  } catch (cause) {
    error.value = message(cause)
  } finally {
    input.value = ''
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Архив рабочих сессий</h2>
    <p>
      Сохранение только по вашему действию: исходные выводы, MAC, реальные имена, названия сессии и
      содержимое TXT исключаются. Адреса заменяются стабильными метками внутри архива; учебные
      адреса остаются. Лимит — 20 архивов, 10 MiB всего, 2 MiB на файл.
    </p>
    <p>
      После перезагрузки можно восстановить последовательность проверок и сравнение. Архив
      открывается для просмотра: для новых измерений создайте новую рабочую сессию, поскольку
      исходные адреса были удалены.
    </p>
    <div class="button-row">
      <button class="button secondary" :disabled="!session.records.length || busy" @click="prepare">
        Подготовить архив сессии</button
      ><label class="editor-field"
        >Импорт архива JSON<input
          type="file"
          accept=".json,application/json"
          :disabled="busy"
          @change="readFile"
      /></label>
    </div>
    <template v-if="draft"
      ><h3>Предпросмотр архива — {{ draft.records.length }} проверок</h3>
      <pre class="text-preview" tabindex="0" role="region" aria-label="JSON обезличенного архива">{{
        preview
      }}</pre>
      <label class="checkbox-label"
        ><input v-model="consent" type="checkbox" /> Проверил обезличенный архив и хочу сохранить
        его в браузере</label
      >
      <div class="button-row">
        <button class="button primary small" :disabled="!consent || busy" @click="save">
          Сохранить архив</button
        ><button
          class="button secondary small"
          @click="downloadText(preview, 'workbench-session.json', 'application/json')"
        >
          Скачать архив JSON</button
        ><button class="button secondary small" @click="restore(draft)">Открыть архив</button>
      </div></template
    >
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <p v-if="status" role="status">{{ status }}</p>
    <h3>Сохранённые архивы — {{ items.length }} / 20</h3>
    <p v-if="!items.length">
      Архивов пока нет. Рабочая сессия автоматически не записывается на диск.
    </p>
    <article v-for="item in items" :key="item.id" class="session-observation">
      <p>
        {{ new Date(item.savedAt).toLocaleString('ru-RU') }} · {{ item.records.length }} проверок
      </p>
      <div class="button-row">
        <button class="button secondary small" @click="inspect(item)">Посмотреть JSON</button
        ><button class="button secondary small" @click="restore(item)">Восстановить сессию</button
        ><button class="button ghost small" @click="remove(item.id)">Удалить архив</button>
      </div>
    </article>
  </section>
</template>
