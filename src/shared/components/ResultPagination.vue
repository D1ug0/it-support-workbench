<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
const props = defineProps<{ page: number; total: number; pageSize: number; label: string }>()
const emit = defineEmits<{ 'update:page': [page: number] }>()
const pages = computed(() => Math.ceil(props.total / props.pageSize))
</script>
<template>
  <nav v-if="pages > 1" class="result-pagination" :aria-label="label">
    <span role="status">
      {{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, total) }} из {{ total }}
    </span>
    <div>
      <button
        class="button secondary small"
        :disabled="page === 0"
        @click="emit('update:page', page - 1)"
      >
        <ChevronLeft :size="14" /> Назад
      </button>
      <button
        class="button secondary small"
        :disabled="page + 1 >= pages"
        @click="emit('update:page', page + 1)"
      >
        Далее <ChevronRight :size="14" />
      </button>
    </div>
  </nav>
</template>
