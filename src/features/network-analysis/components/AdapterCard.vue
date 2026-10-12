<script setup lang="ts">
import { computed } from 'vue'
import { Cable, Wifi, Network, ChevronRight } from '@lucide/vue'
import type { Adapter } from '../../../domain/types/network'
import type { EvidenceRange } from '../../../domain/types/diagnostic'
import { displayAddress } from '../../../domain/diagnostics/redact'

const props = defineProps<{ adapter: Adapter; revealed: boolean; index: number }>()
const emit = defineEmits<{ evidence: [range: EvidenceRange] }>()
const icon = computed(() =>
  /wi-fi|wireless|беспровод/i.test(props.adapter.displayName)
    ? Wifi
    : /vpn|tunnel|virtual/i.test(props.adapter.displayName)
      ? Network
      : Cable,
)
function select(field: string) {
  const lines = props.adapter.fieldLines[field]
  if (lines?.length) emit('evidence', { startLine: lines[0]!, endLine: lines.at(-1)! })
  else emit('evidence', props.adapter.sourceRange)
}
</script>

<template>
  <article class="adapter-card" data-testid="adapter-card">
    <div class="adapter-heading">
      <div class="adapter-icon"><component :is="icon" :size="19" /></div>
      <div>
        <h3>{{ adapter.displayName }}</h3>
        <span class="adapter-state" :class="{ connected: adapter.mediaState === 'connected' }"
          ><span class="status-dot" />
          {{
            adapter.mediaState === 'disconnected'
              ? 'Не подключён'
              : adapter.mediaState === 'connected'
                ? 'Адрес назначен'
                : 'Статус не определён'
          }}</span
        >
      </div>
      <span class="adapter-index">{{ String(index + 1).padStart(2, '0') }}</span>
    </div>
    <div class="adapter-fields">
      <button
        v-for="ip in adapter.ipv4"
        :key="`${ip.line}-${ip.address}`"
        class="field-row"
        @click="emit('evidence', { startLine: ip.line, endLine: ip.maskLine ?? ip.line })"
      >
        <span>IPv4 / префикс</span
        ><code
          >{{ displayAddress(ip.address, revealed)
          }}{{ ip.prefixLength === undefined ? '' : `/${ip.prefixLength}` }}</code
        ><ChevronRight :size="12" /></button
      ><button
        v-for="ip in adapter.ipv6"
        :key="ip.line"
        class="field-row"
        @click="emit('evidence', { startLine: ip.line, endLine: ip.line })"
      >
        <span>IPv6</span><code>{{ displayAddress(ip.address, revealed) }}</code
        ><ChevronRight :size="12" /></button
      ><button v-if="adapter.ipv4.length" class="field-row" @click="select('mask')">
        <span>Маска</span
        ><code>{{ adapter.ipv4.map((ip) => ip.mask ?? 'Не распознана').join(', ') }}</code
        ><ChevronRight :size="12" /></button
      ><button class="field-row" @click="select('gateways')">
        <span>Шлюз</span
        ><code>{{
          adapter.gateways.map((entry) => displayAddress(entry.value, revealed)).join(', ') ||
          'Не обнаружен'
        }}</code
        ><ChevronRight :size="12" /></button
      ><button
        class="field-row"
        aria-label="Показать исходные строки DNS"
        @click="select('dnsServers')"
      >
        <span>DNS</span
        ><span class="field-values"
          ><code v-for="entry in adapter.dnsServers" :key="entry.line">{{
            displayAddress(entry.value, revealed)
          }}</code
          ><code v-if="!adapter.dnsServers.length">Не обнаружены</code></span
        ><ChevronRight :size="12" /></button
      ><button class="field-row" @click="select('dhcpEnabled')">
        <span>DHCP</span
        ><code>{{
          adapter.dhcpEnabled === undefined
            ? 'Не определён'
            : adapter.dhcpEnabled
              ? 'Включён'
              : 'Выключен'
        }}</code
        ><ChevronRight :size="12" /></button
      ><button v-if="adapter.dhcpServer" class="field-row" @click="select('dhcpServer')">
        <span>DHCP-сервер</span><code>{{ displayAddress(adapter.dhcpServer, revealed) }}</code
        ><ChevronRight :size="12" /></button
      ><button v-if="adapter.macAddress" class="field-row" @click="select('macAddress')">
        <span>MAC</span><code>{{ revealed ? adapter.macAddress : '••-••-••-••-••-••' }}</code
        ><ChevronRight :size="12" />
      </button>
    </div>
    <button class="adapter-source" @click="emit('evidence', adapter.sourceRange)">
      Исходный блок · строки {{ adapter.sourceRange.startLine }}–{{ adapter.sourceRange.endLine }}
      <ChevronRight :size="13" />
    </button>
  </article>
</template>
