<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAnalysisStore } from '../network-analysis/model/useAnalysisStore'
import { selectIPv4Routes } from '../../domain/routeSelection'
import { isIPv4 } from '../../domain/network'
import { createAddressRedactor } from '../../infrastructure/export/redact'
const store = useAnalysisStore()
const target = ref('192.0.2.20')
const revealed = ref(false)
const routes = computed(() =>
  store.result?.parse.value?.kind === 'route' ? store.result.parse.value : undefined,
)
const selection = computed(() =>
  routes.value && isIPv4(target.value) ? selectIPv4Routes(routes.value, target.value) : undefined,
)
const redact = computed(() => {
  void routes.value
  return createAddressRedactor()
})
const address = (value: string) =>
  revealed.value || value === 'on-link' ? value : redact.value(value)
function source(line: number) {
  store.selectedRange = { startLine: line, endLine: line }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Какой IPv4-маршрут подходит к цели?</h2>
    <p>
      Используется последний разобранный route print из анализатора. Сначала выбирается длиннейший
      подходящий префикс, затем минимальная опубликованная метрика. Это кандидат из предоставленной
      таблицы, а не проверка реальной сети.
    </p>
    <RouterLink v-if="!routes" class="button secondary small" to="/analyzer"
      >Разобрать route print</RouterLink
    ><template v-else
      ><div class="form-grid">
        <label>IPv4-адрес назначения<input v-model="target" class="text-input mono-input" /></label
        ><label class="checkbox-label"
          ><input v-model="revealed" type="checkbox" /> Показать адреса маршрутов</label
        >
      </div>
      <p v-if="!isIPv4(target)" class="form-error" role="alert">
        Введите корректный IPv4-адрес цели.
      </p>
      <template v-if="selection"
        ><p v-if="!selection.candidates.length" role="status">
          Подходящий активный IPv4-маршрут не найден в данном выводе.
        </p>
        <p v-if="selection.ambiguous" class="form-error" role="status">
          Несколько равных кандидатов. По этой таблице нельзя выбрать один однозначно.
        </p>
        <article
          v-for="route in selection.candidates"
          :key="route.line"
          class="session-observation"
        >
          <code
            >{{ address(route.destination) }}/{{ route.prefix }} →
            {{ address(route.gateway) }}</code
          >
          <p>Метрика: {{ route.metric }} · интерфейс {{ address(route.interface) }}</p>
          <RouterLink to="/analyzer" @click="source(route.line)"
            >Смотреть строку {{ route.line }}</RouterLink
          >
        </article>
        <p>
          Подходящих строк: {{ selection.matches.length }}. Нужны актуальные интерфейсы, семейство
          адресов и контекст VPN. IPv6 и дополнительные политики здесь не моделируются.
        </p></template
      ></template
    >
  </section>
</template>
