<script setup lang="ts">
import FormatSupport from '../features/workshop/ui/FormatSupport.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search, ArrowUpRight, BookOpen, ChevronDown, Copy, Check } from '@lucide/vue'
import { knowledgeEntries, categories } from '../features/knowledge/catalog'
import GlossaryPanel from '../features/knowledge/GlossaryPanel.vue'
const query = ref('')
const route = useRoute()
watch(
  () => route.query.q,
  (value) => (query.value = typeof value === 'string' ? value : ''),
  { immediate: true },
)
const category = ref('Все')
const expanded = ref<string[]>([])
const copied = ref('')
const error = ref('')
const entries = computed(() =>
  knowledgeEntries.filter(
    (e) =>
      (category.value === 'Все' || e.category === category.value) &&
      `${e.title} ${e.summary} ${e.category} ${e.command ?? ''}`
        .toLowerCase()
        .includes(query.value.toLowerCase().trim()),
  ),
)
function toggle(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((v) => v !== id)
    : [...expanded.value, id]
}
function resetSearch() {
  query.value = ''
  category.value = 'Все'
}
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    setTimeout(() => (copied.value = ''), 1800)
  } catch {
    error.value = 'Не удалось скопировать. Выделите команду вручную.'
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">СПРАВОЧНИК И ТЕРМИНЫ</span>
      <h1>Знания под рукой<span class="accent">.</span></h1>
      <p>Алгоритмы, ограничения и первичные источники для следующей проверки.</p>
    </div>
    <span class="tag">{{ knowledgeEntries.length }} КАРТОЧЕК</span>
  </div>
  <FormatSupport />

  <GlossaryPanel compact />
  <div class="knowledge-search">
    <Search :size="18" /><label class="sr-only" for="knowledge-query">Поиск по справочнику</label
    ><input
      id="knowledge-query"
      v-model="query"
      placeholder="DNS, VPN, маска, принтер…"
      class="text-input"
    />
  </div>
  <div class="filter-chips" aria-label="Категории">
    <button
      v-for="item in categories"
      :key="item"
      :class="{ active: category === item }"
      :aria-pressed="category === item"
      @click="category = item"
    >
      {{ item }}
    </button>
  </div>
  <div class="knowledge-count" role="status">Найдено: {{ entries.length }}</div>
  <p v-if="error" class="inline-error" role="status">{{ error }}</p>
  <div class="knowledge-grid">
    <article v-for="entry in entries" :key="entry.id" class="panel knowledge-card">
      <div class="command-card-top">
        <span class="tag">{{ entry.category }}</span
        ><BookOpen :size="18" />
      </div>
      <h2>{{ entry.title }}</h2>
      <p>{{ entry.summary }}</p>
      <RouterLink
        v-if="entry.courseId"
        class="button secondary small"
        :to="{ path: '/learning', query: { course: entry.courseId } }"
        >Урок и лабораторная</RouterLink
      >
      <button v-if="entry.command" class="command-copy" @click="copy(entry.command)">
        <code>{{ entry.command }}</code
        ><Check v-if="copied === entry.command" :size="14" /><Copy v-else :size="14" /></button
      ><button
        class="knowledge-expand"
        :aria-expanded="expanded.includes(entry.id)"
        @click="toggle(entry.id)"
      >
        Алгоритм и ограничения
        <ChevronDown :size="15" :class="{ rotated: expanded.includes(entry.id) }" />
      </button>
      <div v-if="expanded.includes(entry.id)" class="knowledge-detail">
        <ol>
          <li v-for="check in entry.checks" :key="check">{{ check }}</li>
        </ol>
        <div class="finding-limit">{{ entry.limitation }}</div>
      </div>
      <a :href="entry.source.url" target="_blank" rel="noopener noreferrer" class="knowledge-source"
        >{{ entry.source.title }} <ArrowUpRight :size="14" /></a
      ><small
        >Редакционная отметка {{ entry.reviewedAt }} · версия 1. Подтверждения на реальной ОС
        нет.</small
      >
    </article>
  </div>
  <div v-if="!entries.length" class="panel search-empty">
    <Search :size="25" />
    <h2>Ничего не найдено</h2>
    <p>Попробуйте другую фразу или категорию.</p>
    <button class="button secondary" @click="resetSearch">Сбросить поиск</button>
  </div>
</template>
