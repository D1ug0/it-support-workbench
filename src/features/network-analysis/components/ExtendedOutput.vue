<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedDnsRecords, ParsedPowerShell } from '../../../domain/types/outputs'
import type { EvidenceRange } from '../../../domain/types/diagnostic'
import { createAddressRedactor } from '../../../infrastructure/export/redact'
const props = defineProps<{
  output: ParsedDnsRecords | ParsedPowerShell
  revealed: boolean
  page: number
}>()
defineEmits<{ evidence: [range: EvidenceRange] }>()
const redact = computed(() => createAddressRedactor())
const address = (value: string | undefined) =>
  value ? (props.revealed ? value : redact.value(value)) : '—'
</script>
<template>
  <div v-if="output.kind === 'dns-records'" class="extended-records">
    <p>
      {{
        output.format === 'nslookup' ? 'Структурированные блоки nslookup' : 'JSON Resolve-DnsName'
      }}
      · {{ output.records.length }} записей. Имена и содержимое TXT скрыты до явного показа
      чувствительных значений.
    </p>
    <article
      v-for="(record, index) in output.records.slice(page * 80, (page + 1) * 80)"
      :key="index"
      class="extended-record"
    >
      <span class="tag">{{ record.type }} {{ record.section ?? 'секция не указана' }}</span
      ><strong>{{ revealed ? record.name : 'Имя скрыто' }}</strong>
      <p v-if="record.address">Адрес: {{ address(record.address) }}</p>
      <p v-if="record.target">Target: {{ revealed ? record.target : 'Имя скрыто' }}</p>
      <p v-if="record.preference !== undefined">
        MX preference: {{ record.preference }} (меньшее значение предпочтительнее)
      </p>
      <p v-if="record.type === 'SRV'">
        Priority: {{ record.priority }} · Weight: {{ record.weight }} · Port: {{ record.port }}
      </p>
      <p v-if="record.ttl !== undefined">TTL: {{ record.ttl }} секунд</p>
      <pre v-if="record.type === 'TXT'">{{
        revealed ? record.text?.join('') : 'Текст TXT скрыт'
      }}</pre>
      <button
        class="button ghost small"
        @click="$emit('evidence', { startLine: record.line, endLine: record.line })"
      >
        Строка записи {{ record.line }}
      </button>
    </article>
  </div>
  <template v-else-if="output.cmdlet === 'Test-NetConnection'">
    <p>
      TCP {{ output.connection.remotePort }}:
      <strong>{{
        output.connection.tcpSucceeded ? 'соединение установлено' : 'соединение не подтверждено'
      }}</strong>
    </p>
    <p>
      Цель: {{ address(output.connection.remoteAddress) }} · Источник:
      {{ address(output.connection.sourceAddress) }}
    </p>
    <p>
      TCP не проверяет TLS, HTTP и права доступа. Отказ TCP не устанавливает единственную причину.
    </p>
    <button
      class="button ghost small"
      @click="
        $emit('evidence', { startLine: output.connection.line, endLine: output.connection.line })
      "
    >
      Источник TCP-проверки
    </button>
  </template>
  <template v-else
    ><article
      v-for="item in output.interfaces.slice(page * 80, (page + 1) * 80)"
      :key="item.index"
      class="extended-record"
    >
      <strong>Интерфейс {{ item.index }} · {{ revealed ? item.alias : 'Имя скрыто' }}</strong>
      <p>IPv4: {{ item.ipv4.map(address).join(', ') || 'не указан' }}</p>
      <p>IPv6: {{ item.ipv6.map(address).join(', ') || 'не указан' }}</p>
      <p>Шлюз: {{ item.gateways.map(address).join(', ') || 'не указан' }}</p>
      <p>DNS: {{ item.dns.map(address).join(', ') || 'не указан' }}</p>
      <button
        class="button ghost small"
        @click="$emit('evidence', { startLine: item.line, endLine: item.line })"
      >
        Источник интерфейса
      </button>
    </article></template
  >
</template>
