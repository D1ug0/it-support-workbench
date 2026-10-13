<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { readDrafts, deleteDraft, draftSchema } from '../../infrastructure/draftRepository'
import { loadCollection } from '../../../../shared/persistence/collectionLoader'
import { downloadText } from '../../../../infrastructure/export/exportReport'
const origin = window.location.origin,
  usage = ref<number>(),
  quota = ref<number>(),
  persistent = ref<boolean>(),
  error = ref(''),
  lastExport = ref('не было'),
  items = ref<import('../../infrastructure/draftRepository').LearningDraft[]>([])
const mib = (bytes?: number) =>
  bytes === undefined ? 'недоступно' : `${(bytes / 1024 / 1024).toFixed(2)} MiB`
async function refresh() {
  try {
    const estimate = await navigator.storage?.estimate()
    usage.value = estimate?.usage
    quota.value = estimate?.quota
    persistent.value = await navigator.storage?.persisted()
    lastExport.value = globalThis.localStorage.getItem('it-workbench-last-export') ?? 'не было'
    items.value = loadCollection('drafts', await readDrafts(), draftSchema).valid
  } catch {
    error.value = 'Оценка хранилища недоступна; сохранённые записи не изменены.'
  }
}
onMounted(refresh)
async function persist() {
  try {
    persistent.value = await navigator.storage?.persist()
    if (!persistent.value)
      error.value = 'Браузер не предоставил persistent storage. Скачивайте копии вручную.'
  } catch {
    error.value = 'Запрос persistent storage недоступен.'
  }
}
async function remove(id: string) {
  if (!window.confirm('Удалить только выбранный учебный черновик?')) return
  try {
    await deleteDraft(id)
    await refresh()
  } catch {
    error.value = 'Удаление не удалось.'
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Место хранения и устойчивость данных</h2>
    <p>
      Origin: <code>{{ origin }}</code
      >. Учебные данные относятся к этому origin и профилю браузера; другой браузер или адрес сайта
      имеет отдельное хранилище.
    </p>
    <p>
      Используется около {{ mib(usage) }} из {{ mib(quota) }}. Оценка браузера приблизительная и
      включает все данные origin.
    </p>
    <p>
      Persistent storage:
      {{
        persistent === undefined
          ? 'состояние недоступно'
          : persistent
            ? 'предоставлено браузером'
            : 'best-effort: браузер может освободить данные'
      }}. Последний экспорт общей учебной копии: {{ lastExport }}.
    </p>
    <button class="button secondary" @click="persist">Явно запросить устойчивое хранение</button
    ><button class="button ghost" @click="refresh">Обновить оценку</button>
    <p>
      Перезагрузка удаляет ввод и несохранённые заметки. Ручные черновики и контрольные точки
      продолжаются после reload. Очистка данных сайта удаляет IndexedDB, предпочтения и
      офлайн-пакет; скачанные JSON остаются в файловой системе. Обновление офлайн-пакета ждёт
      закрытия вкладок.
    </p>
    <h3>Выбранные учебные черновики ({{ items.length }}/50)</h3>
    <article v-for="d in items" :key="d.id" class="workshop-item">
      {{ d.kind }} · {{ d.taskId }} · {{ d.at }}
      <details>
        <summary>Предпросмотр заметок</summary>
        <pre>{{ JSON.stringify(d.notes, null, 2) }}</pre>
      </details>
      <button
        class="button secondary"
        @click="downloadText(JSON.stringify(d), 'workbench-draft.json', 'application/json')"
      >
        Экспорт выбранного черновика</button
      ><button class="button ghost" @click="remove(d.id)">Удалить выбранный черновик</button>
    </article>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
