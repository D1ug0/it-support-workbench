<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Network,
  ScanLine,
  Download,
  Eye,
  EyeOff,
  ShieldCheck,
  CircleCheck,
  CircleAlert,
  Terminal,
  ArrowRight,
  FlaskConical,
} from '@lucide/vue'
import AnalyzerInput from '../features/network-analysis/components/AnalyzerInput.vue'
import OutputCard from '../features/network-analysis/components/OutputCard.vue'
import AdapterCard from '../features/network-analysis/components/AdapterCard.vue'
import FindingCard from '../features/network-analysis/components/FindingCard.vue'
import EvidenceViewer from '../features/network-analysis/components/EvidenceViewer.vue'
import ReportPreview from '../features/network-analysis/components/ReportPreview.vue'
import ResultPagination from '../shared/components/ResultPagination.vue'
import AddToSession from '../features/sessions/AddToSession.vue'
import PlainSummary from '../features/network-analysis/components/PlainSummary.vue'
import GlossaryPanel from '../features/knowledge/GlossaryPanel.vue'
import CopyCommand from '../shared/components/CopyCommand.vue'
import { useAnalysisStore } from '../features/network-analysis/model/useAnalysisStore'
import { examples, outputExamples } from '../fixtures'
import type { EvidenceRange, CommandKind } from '../domain/types/diagnostic'

const store = useAnalysisStore()
const route = useRoute()
const commandHelp: Array<{ kind: CommandKind; command: string; purpose: string }> = [
  { kind: 'ipconfig', command: 'ipconfig /all', purpose: 'Адреса и настройки подключений' },
  { kind: 'ping', command: 'ping example.com', purpose: 'Ответы ICMP' },
  { kind: 'nslookup', command: 'nslookup example.com', purpose: 'Поиск адреса по имени' },
  { kind: 'tracert', command: 'tracert example.com', purpose: 'Ответы переходов на пути' },
  { kind: 'route', command: 'route print', purpose: 'Таблица маршрутов' },
]
const requestedCommand = computed(() =>
  commandHelp.find((item) => item.kind === route.query.command),
)
const requestedExample = computed(() => outputExamples.find((item) => item.id === route.query.demo))
watch(
  requestedCommand,
  (command) => {
    if (command && !store.input) store.mode = command.kind
  },
  { immediate: true },
)
function loadRequestedExample() {
  if (
    !requestedExample.value ||
    (store.input && !window.confirm('Заменить текущий вывод учебным примером?'))
  )
    return
  store.mode = 'auto'
  store.setInput(requestedExample.value.text, `Пример: ${requestedExample.value.name}`)
}
const reportOpen = ref(false)
const adapterPage = ref(0)
const findingPage = ref(0)
const adapterPageSize = 12
const findingPageSize = 20
watch(
  () => store.result,
  () => {
    reportOpen.value = false
    adapterPage.value = 0
    findingPage.value = 0
  },
)
const tab = ref<'adapters' | 'findings'>('adapters')
const adapters = computed(() =>
  store.result?.parse.value?.kind === 'ipconfig' ? store.result.parse.value.adapters : [],
)
const otherOutput = computed(() =>
  store.result?.parse.value && store.result.parse.value.kind !== 'ipconfig'
    ? store.result.parse.value
    : undefined,
)
const findings = computed(() => store.result?.findings ?? [])
const visibleAdapters = computed(() =>
  adapters.value.slice(
    adapterPage.value * adapterPageSize,
    (adapterPage.value + 1) * adapterPageSize,
  ),
)
const visibleFindings = computed(() =>
  findings.value.slice(
    findingPage.value * findingPageSize,
    (findingPage.value + 1) * findingPageSize,
  ),
)
const warnings = computed(() => store.result?.parse.warnings ?? [])
const status = computed(() =>
  store.busy
    ? 'Обработка текста…'
    : store.result
      ? {
          ok: 'Разбор завершён',
          partial: 'Частичный разбор',
          invalid: 'Проверьте ввод',
          unsupported: 'Формат не поддерживается',
        }[store.result.parse.status]
      : 'Готов к анализу',
)
function evidence(range: EvidenceRange) {
  store.selectedRange = { ...range }
}
function demo() {
  store.setInput(examples[0]!.text, 'Пример: Обычная конфигурация')
}
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">РАЗБОР ВЫВОДА КОМАНД WINDOWS</span>
      <h1>Анализ сетевой конфигурации<span class="accent">.</span></h1>
      <p>
        Вставьте результат команды. Получите понятное объяснение, исходные строки и следующую
        проверку.
      </p>
    </div>
    <span class="tag privacy-tag"><ShieldCheck :size="14" /> ТОЛЬКО В БРАУЗЕРЕ</span>
  </div>
  <section
    v-if="requestedCommand || requestedExample"
    class="panel feature-section analyzer-request"
  >
    <template v-if="requestedCommand"
      ><h2>
        Следующая проверка: <code>{{ requestedCommand.command }}</code>
      </h2>
      <p>
        Выполните команду вручную и вставьте её полный вывод ниже. Если текст уже введён, он
        сохранён; при необходимости выберите тип команды в поле «Формат».
      </p></template
    >
    <template v-if="requestedExample"
      ><h2>Учебный пример: {{ requestedExample.name }}</h2>
      <p>
        {{ requestedExample.description }} Пример загружается по кнопке; текущий текст автоматически
        не заменяется.
      </p>
      <button class="button secondary small" @click="loadRequestedExample">
        Загрузить предложенный пример
      </button></template
    >
  </section>
  <details class="panel command-help">
    <summary>Как получить вывод команды в Windows?</summary>
    <div class="command-help-content">
      <ol>
        <li>Нажмите Win + R, введите <code>cmd</code> и нажмите Enter.</li>
        <li>
          Выполните одну команду из списка. Для сетевых запросов замените example.com на разрешённый
          ресурс своей задачи.
        </li>
        <li>
          Скопируйте весь результат, включая заголовок и итог, вставьте ниже и нажмите
          «Проанализировать».
        </li>
      </ol>
      <div class="command-help-grid">
        <div v-for="item in commandHelp" :key="item.kind">
          <strong>{{ item.purpose }}</strong
          ><CopyCommand :command="item.command" />
        </div>
      </div>
      <p>
        Приложение команды не запускает. Если не знаете, что проверять,
        <RouterLink to="/guide">начните с помощника по симптому</RouterLink>.
      </p>
    </div>
  </details>
  <GlossaryPanel compact />
  <div class="analyzer-layout">
    <AnalyzerInput />
    <div class="results-column">
      <div class="result-top">
        <div class="analysis-status" role="status" aria-live="polite">
          <span class="status-dot" :class="{ pulse: store.busy }" /> {{ status }}
        </div>
        <button
          v-if="store.result?.parse.value"
          class="button secondary small"
          @click="reportOpen = true"
        >
          <Download :size="15" /> Отчёт
        </button>
      </div>
      <p v-if="store.error" class="form-error" role="alert">{{ store.error }}</p>
      <div v-if="!store.result" class="panel analyzer-empty">
        <span class="empty-icon"><ScanLine :size="34" /></span
        ><span class="eyebrow">СНАЧАЛА ИСХОДНЫЕ ДАННЫЕ</span>
        <h2>Вставьте результат<br />команды Windows</h2>
        <p>
          Добавьте полный вывод в поле слева.<br />Workbench объяснит результат и покажет,<br
            class="desktop-only"
          />
          что можно проверить дальше.
        </p>
        <button class="button secondary" @click="demo">
          <FlaskConical :size="16" /> Загрузить демопример <ArrowRight :size="15" />
        </button>
        <div class="empty-footnote">
          <Terminal :size="14" /> ipconfig · ping · nslookup · tracert · route
        </div>
      </div>
      <template v-else
        ><PlainSummary :result="store.result" @evidence="evidence" />
        <div v-if="adapters.length" class="result-summary">
          <div>
            <Network :size="17" /><strong>{{ adapters.length }}</strong
            ><span>адаптера</span>
          </div>
          <div>
            <CircleCheck :size="17" /><strong>{{
              adapters.filter((a) => a.mediaState === 'connected').length
            }}</strong
            ><span>с адресами</span>
          </div>
          <div>
            <CircleAlert :size="17" /><strong>{{ findings.length }}</strong
            ><span>наблюдения</span>
          </div>
        </div>
        <div v-if="warnings.length" class="warning-banner">
          <CircleAlert :size="19" />
          <div>
            <strong>{{
              store.result.parse.status === 'partial'
                ? 'Есть ограничения разбора'
                : 'Не удалось разобрать вывод'
            }}</strong>
            <p>{{ warnings[0]?.message }}</p>
            <details v-if="warnings.length > 1">
              <summary>Все предупреждения ({{ warnings.length }})</summary>
              <ul>
                <li v-for="(warning, index) in warnings.slice(0, 30)" :key="index">
                  <button v-if="warning.range" @click="evidence(warning.range)">
                    Строка {{ warning.range.startLine }}
                  </button>
                  {{ warning.message }}
                </li>
              </ul>
              <p v-if="warnings.length > 30">Показаны первые 30 предупреждений.</p>
            </details>
          </div>
        </div>
        <div v-if="store.result.parse.value" class="results-tabs">
          <div>
            <button :class="{ selected: tab === 'adapters' }" @click="tab = 'adapters'">
              {{ otherOutput ? 'Результат' : 'Адаптеры' }}
              <span v-if="!otherOutput">{{ adapters.length }}</span></button
            ><button :class="{ selected: tab === 'findings' }" @click="tab = 'findings'">
              Наблюдения <span>{{ findings.length }}</span>
            </button>
          </div>
          <button
            class="icon-button small"
            :aria-label="store.revealed ? 'Скрыть идентификаторы' : 'Показать идентификаторы'"
            :aria-pressed="store.revealed"
            @click="store.revealed = !store.revealed"
          >
            <Eye v-if="!store.revealed" :size="17" /><EyeOff v-else :size="17" />
          </button>
        </div>
        <OutputCard
          v-if="tab === 'adapters' && otherOutput"
          :output="otherOutput"
          :revealed="store.revealed"
          @evidence="evidence"
        />
        <div v-else-if="tab === 'adapters'" class="adapter-grid">
          <AdapterCard
            v-for="(adapter, index) in visibleAdapters"
            :key="adapter.id"
            :adapter="adapter"
            :index="index + adapterPage * adapterPageSize"
            :revealed="store.revealed"
            @evidence="evidence"
          />
        </div>
        <div v-else class="findings-list">
          <FindingCard
            v-for="finding in visibleFindings"
            :key="finding.id"
            :finding="finding"
            :adapter-label="
              adapters.find((a) => a.id === finding.evidence[0]?.adapterId)?.displayName
            "
            @evidence="evidence"
          />
          <p v-if="!findings.length" class="panel no-findings">
            Правила не обнаружили дополнительных признаков. Это не подтверждает доступность сети.
          </p>
        </div>
        <ResultPagination
          v-if="tab === 'adapters' && !otherOutput"
          v-model:page="adapterPage"
          :total="adapters.length"
          :page-size="adapterPageSize"
          label="Страницы адаптеров"
        />
        <ResultPagination
          v-if="tab === 'findings'"
          v-model:page="findingPage"
          :total="findings.length"
          :page-size="findingPageSize"
          label="Страницы наблюдений"
        />
        <div v-if="adapters.length" class="analysis-limitation">
          <ShieldCheck :size="17" />
          <p>
            Конфигурация обнаружена. По одному <code>ipconfig</code> нельзя подтвердить доступность
            шлюза, исправность DNS или работу VPN.
          </p>
        </div>
        <AddToSession
          v-if="store.result.parse.value"
          :key="store.result.createdAt"
          :analysis="store.result"
          :source="store.input"
        />
      </template>
    </div>
  </div>
  <EvidenceViewer
    v-if="store.result && store.input"
    :text="store.input"
    :range="store.selectedRange"
  />
  <div class="analyzer-bottom-note">
    Workbench читает текст. Приложение не выполняет команды на вашем ПК, не сканирует сеть и не
    сохраняет ввод между обновлениями страницы.
  </div>
  <ReportPreview
    v-if="reportOpen && store.result"
    :result="store.result"
    :raw="store.input"
    @close="reportOpen = false"
  />
</template>
