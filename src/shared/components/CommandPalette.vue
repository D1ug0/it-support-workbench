<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, X } from '@lucide/vue'
import { knowledgeEntries } from '../../features/knowledge/catalog'
import { glossary } from '../../features/knowledge/glossary'
const router = useRouter()
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const query = ref('')
const index = ref(0)
const pages = [
  ['Обзор', '/'],
  ['Помощник диагностики', '/guide'],
  ['Анализатор', '/analyzer'],
  ['Рабочие сессии', '/sessions'],
  ['Инструменты', '/toolkit'],
  ['Справочник', '/knowledge'],
  ['Чек-листы', '/playbooks'],
  ['Тренажёр', '/simulator'],
  ['Учебный центр', '/learning'],
  ['Локальные кейсы', '/cases'],
  ['Настройки', '/settings'],
  ['О проекте', '/about'],
]
const entries = [
  ...pages.map(([label, path]) => ({ label: label!, path: path!, kind: 'Раздел' })),
  ...knowledgeEntries.map((entry) => ({
    label: entry.title,
    path: `/knowledge?q=${encodeURIComponent(entry.title)}`,
    kind: entry.category,
  })),
  ...glossary.map((entry) => ({
    label: entry.term,
    path: `/knowledge?term=${encodeURIComponent(entry.term)}`,
    kind: 'Термин',
  })),
]
const results = computed(() =>
  entries
    .filter((entry) =>
      `${entry.label} ${entry.kind}`.toLowerCase().includes(query.value.toLowerCase().trim()),
    )
    .slice(0, 20),
)
watch(query, () => (index.value = 0))
function open() {
  query.value = ''
  dialog.value?.showModal()
  input.value?.focus()
}
function select(position = index.value) {
  const item = results.value[position]
  if (!item) return
  dialog.value?.close()
  void router.push(item.path)
}
function move(delta: number) {
  if (results.value.length)
    index.value = (index.value + delta + results.value.length) % results.value.length
}
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (dialog.value?.open) dialog.value.close()
    else open()
  }
}
onMounted(() => window.addEventListener('keydown', shortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', shortcut))
</script>
<template>
  <button
    class="button secondary small quick-search-trigger"
    aria-label="Быстрый поиск (Ctrl или Command K)"
    @click="open"
  >
    <Search :size="15" /><span>Поиск</span><kbd>⌘ K</kbd>
  </button>
  <dialog ref="dialog" class="search-dialog" aria-labelledby="quick-search-title">
    <div class="dialog-heading">
      <h2 id="quick-search-title">Быстрый поиск</h2>
      <button class="icon-button" aria-label="Закрыть быстрый поиск" @click="dialog?.close()">
        <X :size="18" />
      </button>
    </div>
    <label class="sr-only" for="quick-search-input">Поиск разделов и знаний</label
    ><input
      id="quick-search-input"
      ref="input"
      v-model="query"
      class="text-input"
      placeholder="DNS, VPN, учебный центр…"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="select()"
    />
    <p class="search-help">↑ ↓ выбрать · Enter открыть · Escape закрыть</p>
    <p v-if="!results.length" role="status">Ничего не найдено.</p>
    <p class="sr-only" role="status">{{ results[index]?.label }}</p>
    <ul>
      <li v-for="(item, position) in results" :key="item.path">
        <button :class="{ selected: index === position }" @click="select(position)">
          <span>{{ item.label }}</span
          ><span class="tag">{{ item.kind }}</span>
        </button>
      </li>
    </ul>
  </dialog>
</template>
