<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Monitor, Network, Globe, Server, CircleCheck, CircleAlert, Clock } from '@lucide/vue'
import { routeTo, type NetworkState } from './networkModel'
const props = defineProps<{ state: NetworkState; exam: boolean }>()
const selected = ref('client')
watch(
  () => props.state.definition.id,
  () => {
    selected.value = 'client'
  },
)
const path = computed(() =>
  routeTo(
    props.state,
    props.state.definition.additionalHosts?.find(
      (h) => h.id === selected.value && h.role === 'server',
    )?.address ?? props.state.definition.server,
  ),
)
const nodes = computed(() => [
  {
    id: 'client',
    icon: Monitor,
    name: 'TRAINING-PC',
    address: `${props.state.client}/${props.state.prefix}`,
    detail: `DNS: ${props.state.dns}; аренда: ${props.state.lease ? 'получена' : 'нет'}`,
  },
  {
    id: 'gateway',
    icon: Network,
    name: 'Маршрутизатор',
    address: props.state.definition.gateway,
    detail: 'Соединяет локальный сегмент с сетью сервера',
  },
  {
    id: 'dns',
    icon: Globe,
    name: 'DNS-сервер',
    address: props.state.definition.dns,
    detail: `Зона: ${props.state.definition.target}`,
  },
  {
    id: 'server',
    icon: Server,
    name: 'Учебный сервер',
    address: props.state.definition.server,
    detail: 'Целевой портал; TCP 443, учебные TLS/HTTP',
  },
  ...(props.state.definition.additionalHosts ?? []).map((h) => ({
    id: h.id,
    icon: h.role === 'client' ? Monitor : Server,
    name: h.title,
    address: h.address,
    detail: `${h.role === 'client' ? 'Дополнительный клиент' : 'Дополнительный сервер'} · ${h.name}. Исследуйте lab inspect ${h.id} и lab probe.`,
  })),
])
const node = computed(() => nodes.value.find((n) => n.id === selected.value) ?? nodes.value[0]!)
</script>
<template>
  <section class="panel feature-section terminal-network-map" aria-label="Карта учебной сети">
    <div class="terminal-map-heading">
      <span class="eyebrow">ВИРТУАЛЬНАЯ СРЕДА</span>
      <h2>Карта учебной сети</h2>
      <p>Выберите узел, чтобы посмотреть детали. Карта отражает состояние лаборатории.</p>
    </div>
    <div class="network-nodes">
      <button
        v-for="n in nodes"
        :key="n.id"
        class="button secondary network-node"
        :aria-pressed="selected === n.id"
        @click="selected = n.id"
      >
        <component :is="n.icon" :size="20" aria-hidden="true" />
        <span
          ><strong>{{ n.name }}</strong
          ><code>{{ n.address }}</code></span
        >
      </button>
    </div>
    <div class="terminal-node-detail">
      <strong>{{ node.name }}</strong>
      <p>{{ node.detail }}</p>
    </div>
    <div
      v-if="!exam"
      class="terminal-network-path"
      :class="path.reachable ? 'network-ok' : 'network-fail'"
    >
      <div>
        <CircleCheck v-if="path.reachable" :size="17" aria-hidden="true" /><CircleAlert
          v-else
          :size="17"
          aria-hidden="true"
        />
        <strong>{{
          path.reachable ? 'Путь к серверу доступен' : 'Путь к серверу недоступен'
        }}</strong>
      </div>
      <p>{{ path.reason }}</p>
      <code v-if="path.hops.length">{{ state.client }} → {{ path.hops.join(' → ') }}</code>
    </div>
    <p v-else class="terminal-node-detail">
      В проверочной работе путь исследуется командами; подсветка решения скрыта.
    </p>
    <p class="network-time">
      <Clock :size="14" aria-hidden="true" /><span
        >Время: {{ state.clock }} с · состояние {{ state.revision }}.
        <code>wait 120</code> продвигает учебное время.</span
      >
    </p>
  </section>
</template>
