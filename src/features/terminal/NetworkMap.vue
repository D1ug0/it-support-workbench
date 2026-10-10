<script setup lang="ts">
import { computed, ref } from 'vue'
import { routeTo, type NetworkState } from './networkModel'
const props = defineProps<{ state: NetworkState; exam: boolean }>()
const selected = ref('client')
const path = computed(() => routeTo(props.state, props.state.definition.server))
const nodes = computed(() => [
  {
    id: 'client',
    name: 'TRAINING-PC',
    address: `${props.state.client}/${props.state.prefix}`,
    detail: `DNS: ${props.state.dns}; аренда: ${props.state.lease ? 'получена' : 'нет'}`,
  },
  {
    id: 'gateway',
    name: 'Маршрутизатор',
    address: props.state.definition.gateway,
    detail: 'Соединяет локальный сегмент с сетью сервера',
  },
  {
    id: 'dns',
    name: 'DNS-сервер',
    address: props.state.definition.dns,
    detail: `Зона: ${props.state.definition.target}`,
  },
  {
    id: 'server',
    name: 'Учебный сервер',
    address: props.state.definition.server,
    detail: 'Целевой портал; TCP 443, учебные TLS/HTTP',
  },
])
const node = computed(() => nodes.value.find((n) => n.id === selected.value)!)
</script>
<template>
  <section class="panel feature-section network-map" aria-label="Карта учебной сети">
    <h2>Карта учебной сети</h2>
    <p>Выберите узел. Карта и команды используют одно состояние. Это модель лаборатории.</p>
    <div class="network-nodes">
      <button
        v-for="n in nodes"
        :key="n.id"
        class="button secondary network-node"
        :aria-pressed="selected === n.id"
        @click="selected = n.id"
      >
        <strong>{{ n.name }}</strong
        ><code>{{ n.address }}</code>
      </button>
    </div>
    <p>
      <strong>{{ node.name }}:</strong> {{ node.detail }}
    </p>
    <template v-if="!exam"
      ><p :class="path.reachable ? 'network-ok' : 'network-fail'">
        {{ path.reachable ? 'Путь к серверу доступен' : 'Путь к серверу недоступен' }} ·
        {{ path.reason }}
      </p>
      <p v-if="path.hops.length">{{ state.client }} → {{ path.hops.join(' → ') }}</p></template
    >
    <p v-else>В проверочной работе путь исследуется командами; подсветка решения скрыта.</p>
    <p class="network-time">
      Время: {{ state.clock }} с · состояние {{ state.revision }}. <code>wait 120</code> продвигает
      учебное время.
    </p>
  </section>
</template>
