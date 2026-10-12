<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Activity, ChevronRight, Route, Server } from '@lucide/vue'
import type { ParsedOutput } from '../../../domain/types/outputs'
import type { EvidenceRange } from '../../../domain/types/diagnostic'
import { createAddressRedactor } from '../../../domain/diagnostics/redact'
import ResultPagination from '../../../shared/components/ResultPagination.vue'
import ExtendedOutput from './ExtendedOutput.vue'

const props = defineProps<{
  output: Exclude<ParsedOutput, { kind: 'ipconfig' }>
  revealed: boolean
}>()
const pageSize = 80
const page = ref(0)
const ipv6Page = ref(0)
watch(
  () => props.output,
  () => {
    page.value = 0
    ipv6Page.value = 0
  },
)
const total = computed(() => {
  const output = props.output
  if (output.kind === 'ping') return output.replies.length
  if (output.kind === 'nslookup') return output.addresses.length
  if (output.kind === 'tracert') return output.hops.length
  if (output.kind === 'dns-records') return output.records.length
  if (output.kind === 'powershell')
    return output.cmdlet === 'Test-NetConnection' ? 1 : output.interfaces.length
  return output.ipv4Routes.length
})
function visible<T>(items: T[], currentPage = page.value): T[] {
  return items.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
}
defineEmits<{ evidence: [range: EvidenceRange] }>()
const redact = computed(() => createAddressRedactor())
const address = (value?: string) => (value ? (props.revealed ? value : redact.value(value)) : '—')
const labels = {
  ping: 'Ответы ICMP',
  nslookup: 'Ответ DNS',
  tracert: 'Переходы маршрута',
  route: 'Таблица маршрутов',
  'dns-records': 'Записи DNS',
  powershell: 'Результат PowerShell',
}
const loss = computed(() =>
  props.output.kind === 'ping' && props.output.sent !== undefined
    ? Math.round(((props.output.lost ?? 0) / props.output.sent) * 100)
    : undefined,
)
</script>

<template>
  <section class="panel output-card" data-testid="output-card">
    <div class="panel-heading">
      <div>
        <Activity v-if="output.kind === 'ping'" :size="18" /><Server
          v-else-if="output.kind === 'nslookup'"
          :size="18"
        /><Route v-else :size="18" />
        <h2>{{ labels[output.kind] }}</h2>
      </div>
      <span class="tag">{{ output.kind.toUpperCase() }}</span>
    </div>
    <ExtendedOutput
      v-if="output.kind === 'dns-records' || output.kind === 'powershell'"
      :output="output"
      :revealed="revealed"
      :page="page"
      @evidence="$emit('evidence', $event)"
    />
    <template v-if="output.kind === 'ping'"
      ><div class="output-metrics">
        <div>
          <strong>{{ output.sent ?? '—' }}</strong
          ><span>отправлено</span>
        </div>
        <div>
          <strong>{{ output.received ?? '—' }}</strong
          ><span>получено</span>
        </div>
        <div>
          <strong>{{ loss === undefined ? '—' : `${loss}%` }}</strong
          ><span>потери ICMP</span>
        </div>
        <div>
          <strong>{{ output.average === undefined ? '—' : `${output.average} ms` }}</strong
          ><span>средний RTT</span>
        </div>
      </div>
      <div class="output-list">
        <button
          v-for="reply in visible(output.replies)"
          :key="reply.line"
          @click="$emit('evidence', { startLine: reply.line, endLine: reply.line })"
        >
          <span class="tag">{{
            reply.outcome === 'reply'
              ? 'ECHO REPLY'
              : reply.outcome === 'timeout'
                ? 'TIMEOUT'
                : 'UNREACHABLE'
          }}</span
          ><code>{{
            reply.timeMs === undefined
              ? 'Без успешного эхо-ответа'
              : `${reply.lessThan ? '<' : ''}${reply.timeMs} ms`
          }}</code
          ><span>Строка {{ reply.line }}</span
          ><ChevronRight :size="13" />
        </button></div></template
    ><template v-else-if="output.kind === 'nslookup'"
      ><div class="dns-summary">
        <span>Сервер DNS</span><code>{{ address(output.serverAddress) }}</code
        ><span>Имя запроса</span><code>{{ revealed ? (output.queryName ?? '—') : 'Скрыто' }}</code
        ><span>Результат</span
        ><strong>{{
          output.outcome === 'answer' ? 'Адреса в ответе' : output.outcome.toUpperCase()
        }}</strong>
      </div>
      <div class="output-list">
        <button
          v-for="entry in visible(output.addresses)"
          :key="entry.line"
          @click="$emit('evidence', { startLine: entry.line, endLine: entry.line })"
        >
          <span class="tag">DNS ANSWER</span><code>{{ address(entry.value) }}</code
          ><span>Строка {{ entry.line }}</span
          ><ChevronRight :size="13" />
        </button></div></template
    ><template v-else-if="output.kind === 'tracert'"
      ><div class="output-metrics">
        <div>
          <strong>{{ output.hops.length }}</strong
          ><span>переходов</span>
        </div>
        <div>
          <strong>{{ output.hops.filter((h) => h.times.some((t) => t === null)).length }}</strong
          ><span>с тайм-аутами</span>
        </div>
        <div>
          <strong>{{ output.completed ? 'Есть' : 'Нет' }}</strong
          ><span>маркер завершения</span>
        </div>
      </div>
      <div class="output-list trace-list">
        <button
          v-for="hop in visible(output.hops)"
          :key="hop.line"
          @click="$emit('evidence', { startLine: hop.line, endLine: hop.line })"
        >
          <span class="hop-number">{{ String(hop.hop).padStart(2, '0') }}</span
          ><span class="hop-times"
            ><code v-for="(time, index) in hop.times" :key="index">{{
              time === null ? '*' : `${hop.lessThan[index] ? '<' : ''}${time} ms`
            }}</code></span
          ><code>{{ address(hop.address) }}</code
          ><ChevronRight :size="13" />
        </button></div></template
    ><template v-else-if="output.kind === 'route'"
      ><div class="route-table-scroll">
        <table class="route-table">
          <caption>
            Активные маршруты IPv4
          </caption>
          <thead>
            <tr>
              <th>Сеть / префикс</th>
              <th>Шлюз</th>
              <th>Интерфейс</th>
              <th>Метрика</th>
              <th>Источник</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in visible(output.ipv4Routes)" :key="entry.line">
              <td>
                <code
                  >{{ entry.prefix === 0 ? '0.0.0.0' : address(entry.destination) }}/{{
                    entry.prefix
                  }}</code
                >
              </td>
              <td>
                <code>{{ entry.gateway === 'on-link' ? 'On-link' : address(entry.gateway) }}</code>
              </td>
              <td>
                <code>{{ address(entry.interface) }}</code>
              </td>
              <td>{{ entry.metric }}</td>
              <td>
                <button @click="$emit('evidence', { startLine: entry.line, endLine: entry.line })">
                  {{ entry.line }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <ResultPagination
          v-model:page="page"
          :total="total"
          :page-size="pageSize"
          label="Страницы маршрутов IPv4"
        />
        <table v-if="output.ipv6Routes.length" class="route-table">
          <caption>
            Активные маршруты IPv6
          </caption>
          <thead>
            <tr>
              <th>Сеть / префикс</th>
              <th>Шлюз</th>
              <th>If</th>
              <th>Метрика</th>
              <th>Источник</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in visible(output.ipv6Routes, ipv6Page)" :key="entry.line">
              <td>
                <code
                  >{{ entry.prefix === 0 ? '::' : address(entry.destination) }}/{{
                    entry.prefix
                  }}</code
                >
              </td>
              <td>
                <code>{{ entry.gateway === 'on-link' ? 'On-link' : address(entry.gateway) }}</code>
              </td>
              <td>{{ entry.interfaceIndex }}</td>
              <td>{{ entry.metric }}</td>
              <td>
                <button @click="$emit('evidence', { startLine: entry.line, endLine: entry.line })">
                  {{ entry.line }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <ResultPagination
          v-model:page="ipv6Page"
          :total="output.ipv6Routes.length"
          :page-size="pageSize"
          label="Страницы маршрутов IPv6"
        /></div
    ></template>
    <ResultPagination
      v-if="output.kind !== 'route'"
      v-model:page="page"
      :total="total"
      :page-size="pageSize"
      label="Страницы результатов команды"
    />
  </section>
</template>
