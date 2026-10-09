<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { glossary } from './glossary'
import { knowledgeEntries } from './catalog'
defineProps<{ compact?: boolean }>()
const route = useRoute()
const query = ref('')
watch(
  () => route.query.term,
  (value) => {
    query.value = typeof value === 'string' ? value : ''
  },
  { immediate: true },
)
const items = computed(() =>
  glossary.filter((item) =>
    `${item.term} ${item.meaning}`.toLowerCase().includes(query.value.toLowerCase().trim()),
  ),
)
</script>
<template>
  <details class="panel glossary-panel" :open="!compact || Boolean(route.query.term)">
    <summary>
      Сетевые термины простыми словами <span class="tag">{{ glossary.length }}</span>
    </summary>
    <div class="glossary-content">
      <label
        >Найти термин<input v-model="query" class="text-input" placeholder="DNS, шлюз, RTT…"
      /></label>
      <p v-if="!items.length" role="status">Термин не найден. Попробуйте другую формулировку.</p>
      <div class="glossary-grid">
        <article v-for="item in items" :key="item.id">
          <h3>{{ item.term }}</h3>
          <p>{{ item.meaning }}</p>
          <small>{{ item.example }}</small
          ><RouterLink
            :to="{
              path: '/knowledge',
              query: { q: knowledgeEntries.find((e) => e.id === item.entry)?.title },
            }"
            >Подробнее с источником</RouterLink
          >
        </article>
      </div>
    </div>
  </details>
</template>
