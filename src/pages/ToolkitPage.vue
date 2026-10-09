<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { Calculator, Copy, Check, Network, ArrowRight } from '@lucide/vue'
import { calculateSubnet, isIPv4 } from '../domain/network'
import { knowledgeEntries } from '../features/knowledge/catalog'
import RouteLookup from '../features/toolkit/RouteLookup.vue'
import SubnetPractice from '../features/toolkit/SubnetPractice.vue'
import { ports } from '../features/toolkit/ports'
const portQuery = ref('')
const filteredPorts = computed(() =>
  ports.filter((p) =>
    `${p.port} ${p.service} ${p.purpose}`
      .toLowerCase()
      .includes(portQuery.value.toLowerCase().trim()),
  ),
)
const ip = ref('192.0.2.10')
const prefix = ref(24)
const result = computed(() =>
  isIPv4(ip.value) && Number.isInteger(prefix.value) && prefix.value >= 0 && prefix.value <= 32
    ? calculateSubnet(ip.value, prefix.value)
    : undefined,
)
const copied = ref('')
const error = ref('')
const commands = knowledgeEntries.filter((e) => e.command)
const route = useRoute()
watch(
  () => route.query.practice,
  async (value) => {
    if (value === 'subnet') {
      await nextTick()
      document.getElementById('subnet-practice')?.focus()
    }
  },
  { immediate: true },
)
const fields = computed(() =>
  result.value
    ? [
        { label: 'Сеть / CIDR', value: `${result.value.network}/${result.value.prefix}` },
        { label: 'Маска подсети', value: result.value.mask },
        { label: 'Wildcard', value: result.value.wildcard },
        {
          label: prefix.value < 31 ? 'Broadcast' : 'Последний адрес',
          value: result.value.broadcast,
        },
        { label: 'Первый доступный адрес', value: result.value.firstHost },
        { label: 'Последний доступный адрес', value: result.value.lastHost },
      ]
    : [],
)
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    setTimeout(() => (copied.value = ''), 1800)
  } catch {
    error.value = 'Не удалось скопировать. Выделите значение вручную.'
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">РАСЧЁТЫ И КОМАНДЫ</span>
      <h1>Меньше рутины<span class="accent">.</span></h1>
      <p>Калькулятор подсетей и команды для осмысленной диагностики.</p>
    </div>
    <span class="tag">ЛОКАЛЬНЫЕ ВЫЧИСЛЕНИЯ</span>
  </div>
  <section class="panel subnet-calculator">
    <div class="panel-heading">
      <div>
        <Calculator :size="19" />
        <h2>IPv4 / CIDR калькулятор</h2>
      </div>
      <span class="tag">/0 — /32</span>
    </div>
    <div class="subnet-layout">
      <div class="subnet-input">
        <label for="subnet-ip">IPv4-адрес</label
        ><input
          id="subnet-ip"
          v-model="ip"
          class="text-input mono-input"
          spellcheck="false"
          placeholder="192.0.2.10"
        /><label for="subnet-prefix">Префикс</label>
        <div class="prefix-row">
          <input
            id="subnet-prefix"
            v-model.number="prefix"
            class="text-input"
            type="number"
            min="0"
            max="32"
          /><span>/{{ prefix }}</span>
        </div>
        <input
          v-model.number="prefix"
          class="prefix-slider"
          type="range"
          min="0"
          max="32"
          aria-label="Длина префикса"
        />
        <div class="prefix-shortcuts">
          <button
            v-for="value in [8, 16, 24, 30, 31, 32]"
            :key="value"
            :class="{ active: prefix === value }"
            @click="prefix = value"
          >
            /{{ value }}
          </button>
        </div>
        <p v-if="!result" class="inline-error" role="alert">
          Введите корректные IPv4 и префикс от 0 до 32.
        </p>
        <div v-else class="subnet-hosts">
          <Network :size="20" /><strong>{{ result.hosts.toLocaleString('ru-RU') }}</strong
          ><span
            >{{ prefix >= 31 ? 'адреса' : 'доступных адресов'
            }}<small>{{ result.size.toLocaleString('ru-RU') }} всего</small></span
          >
        </div>
      </div>
      <div v-if="result" class="subnet-results">
        <button v-for="field in fields" :key="field.label" @click="copy(field.value)">
          <span>{{ field.label }}</span
          ><code>{{ field.value }}</code
          ><Check v-if="copied === field.value" :size="14" /><Copy v-else :size="14" />
        </button>
        <p>
          {{
            prefix === 31
              ? 'Два адреса для point-to-point по RFC 3021. Обычного broadcast нет.'
              : prefix === 32
                ? 'Один адрес: host route. Адреса сети и broadcast не резервируются.'
                : 'Адреса сети и broadcast исключены из доступных адресов.'
          }}
        </p>
      </div>
    </div>
  </section>
  <p v-if="error" class="inline-error" role="status">{{ error }}</p>
  <SubnetPractice />
  <section class="section-block">
    <div class="section-heading">
      <div>
        <span class="eyebrow">БИБЛИОТЕКА КОМАНД</span>
        <h2>Следующий шаг — осознанно</h2>
      </div>
      <RouterLink class="text-link" to="/knowledge"
        >Открыть справочник <ArrowRight :size="14"
      /></RouterLink>
    </div>
    <div class="command-library">
      <article v-for="entry in commands" :key="entry.id" class="panel command-card">
        <div class="command-card-top">
          <span class="tag">{{ entry.shell }}</span
          ><span class="eyebrow">{{ entry.category }}</span>
        </div>
        <h3>{{ entry.title }}</h3>
        <p>{{ entry.summary }}</p>
        <button class="command-copy" @click="copy(entry.command!)">
          <code>{{ entry.command }}</code
          ><Check v-if="copied === entry.command" :size="15" /><Copy v-else :size="15" /></button
        ><small>{{
          entry.id === 'tcp' || entry.id === 'ping' || entry.id === 'tracert' || entry.id === 'dns'
            ? 'Отправляет сетевые запросы. Только разрешённые адреса.'
            : 'Чтение конфигурации. Приложение команду не запускает.'
        }}</small>
      </article>
    </div>
  </section>
  <RouteLookup />
  <section class="panel feature-section">
    <h2>Порты и назначение сервисов</h2>
    <label
      >Поиск порта или сервиса<input
        v-model="portQuery"
        class="text-input"
        placeholder="443, DNS, SMB…"
    /></label>
    <p>
      Справочные назначения не доказывают, что сервис использует этот порт. TCP-проверка не
      проверяет UDP; HTTPS также может использовать QUIC/UDP. Проверяйте конфигурацию и разрешения.
    </p>
    <div class="port-grid">
      <article v-for="port in filteredPorts" :key="port.port">
        <strong>{{ port.port }}</strong
        ><span class="tag">{{ port.transport }}</span>
        <h3>{{ port.service }}</h3>
        <p>{{ port.purpose }}</p>
      </article>
    </div>
    <p v-if="!filteredPorts.length" role="status">Порты не найдены.</p>
    <a
      href="https://www.iana.org/assignments/service-names-port-numbers"
      target="_blank"
      rel="noopener noreferrer"
      >IANA · Service Name and Transport Protocol Port Number Registry</a
    >
  </section>
</template>
