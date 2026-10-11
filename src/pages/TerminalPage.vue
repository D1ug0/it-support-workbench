<script setup lang="ts">
import AppSelect from '../shared/components/AppSelect.vue'
import AppSelectOption from '../shared/components/AppSelectOption.vue'
import { confirmDiscardForms } from '../shared/unsavedChanges'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '../features/terminal/terminal.css'
import { useRoute, useRouter } from 'vue-router'
import { terminalLabs, labIds } from '../features/terminal/catalog'
import { useTerminalStore } from '../features/terminal/useTerminalStore'
import TerminalConsole from '../features/terminal/TerminalConsole.vue'
import CommandCatalog from '../features/terminal/CommandCatalog.vue'
import TerminalWorkspaceGuide from '../features/terminal/TerminalWorkspaceGuide.vue'
import TerminalRecordsPanel from '../features/terminal/TerminalRecordsPanel.vue'
import InvestigationPanel from '../features/workshop/InvestigationPanel.vue'
import NetworkMap from '../features/terminal/NetworkMap.vue'
import { supportedCommands } from '../features/terminal/commandRegistry'
import { extendedLabs } from '../features/terminal/labDefinitions'
import { useWorkshopStore } from '../features/workshop/useWorkshopStore'
import { createNetwork } from '../features/terminal/networkModel'
import {
  parseCheckpoint,
  type Checkpoint,
  type TerminalMode,
} from '../features/terminal/checkpoint'
import { useLearningStore } from '../features/learning/useLearningStore'
import { compareOutputs, formatDifference } from '../features/sessions/session'
import { downloadText } from '../infrastructure/export/exportReport'
import PlainSummary from '../features/network-analysis/components/PlainSummary.vue'
import OutputCard from '../features/network-analysis/components/OutputCard.vue'
import AdapterCard from '../features/network-analysis/components/AdapterCard.vue'
import EvidenceViewer from '../features/network-analysis/components/EvidenceViewer.vue'
import type { EvidenceRange } from '../domain/types/diagnostic'
const store = useTerminalStore(),
  learning = useLearningStore(),
  route = useRoute(),
  router = useRouter()
const consoleView = ref<InstanceType<typeof TerminalConsole>>()
const workshop = useWorkshopStore()
const allLabs = computed(() => [...terminalLabs, ...workshop.customLabs])
const resetKey = ref(0)
const search = ref('')
const seed = ref(store.variantSeed)
const visibleLabs = computed(() =>
  allLabs.value.filter((l) =>
    `${l.title} ${l.topic} ${l.brief}`.toLowerCase().includes(search.value.toLowerCase()),
  ),
)
const commands = computed(() => supportedCommands(store.environment.network))
const platform = computed(() =>
  store.environment.network?.definition.skill === 'linux'
    ? ('Linux' as const)
    : ('Windows' as const),
)
const knowledgeTopic = computed(() => {
  const skill = store.environment.network?.definition.skill
  const topics: Record<string, string> = {
    addressing: 'DHCP',
    routing: 'маршрут',
    dns: 'DNS',
    transport: 'TCP',
    tls: 'TLS',
    windows: 'служба',
    identity: 'SMB',
    linux: 'Linux',
    ipv6: 'IPv6',
    wifi: 'Wi-Fi',
  }
  return skill
    ? (topics[skill] ?? store.lab.topic)
    : store.lab.id === 'TERM-ICMP-TCP'
      ? 'ICMP'
      : 'DNS'
})
const mapState = computed(
  () =>
    store.environment.network ?? {
      ...createNetwork({
        ...extendedLabs[0]!,
        id: store.lab.id,
        title: store.lab.title,
        fault: 'dns',
        server: '192.0.2.20',
      }),
      dns: store.environment.dns,
      clock: store.environment.clock ?? 0,
      revision: store.environment.revision,
    },
)
const selectedMode = ref<TerminalMode>(store.mode)
const error = ref(''),
  notice = ref(''),
  busy = ref(false)
const evidence = ref<EvidenceRange>()
const pending = ref<Checkpoint>()
const consent = ref(false)
const beforeId = ref(''),
  afterId = ref('')
const analyzable = computed(() => store.records.filter((r) => r.kind))
const model = computed(() => store.analyzed?.result.parse.value)
const differences = computed(() => {
  const a = analyzable.value.find((r) => String(r.id) === beforeId.value)
  const b = analyzable.value.find((r) => String(r.id) === afterId.value)
  if (!a || !b) return { error: '', values: [] }
  if (a.id === b.id || a.kind !== b.kind)
    return { error: 'Выберите разные проверки одной команды.', values: [] }
  // Pure existing analysis and semantic diff; no writes to live diagnostic stores.
  const left = analyzeOutput(a.output, a.kind),
    right = analyzeOutput(b.output, b.kind)
  if (!left.parse.value || !right.parse.value)
    return { error: 'Для сравнения нужны два структурированных результата.', values: [] }
  if (
    left.parse.value.kind === 'powershell' &&
    right.parse.value.kind === 'powershell' &&
    left.parse.value.cmdlet !== right.parse.value.cmdlet
  )
    return { error: 'Выберите один и тот же cmdlet PowerShell.', values: [] }
  return { error: '', values: compareOutputs(left.parse.value, right.parse.value) }
})
import { analyzeOutput } from '../features/network-analysis/application/analyzeOutput'
watch(
  () => [route.query.lab, workshop.customLabs] as const,
  ([id]) => {
    const lab = allLabs.value.find((l) => l.id === id)
    // Router has already confirmed this navigation. A second prompt would desynchronise the URL.
    if (lab && lab.id !== store.lab.id) restart(lab.id, true)
  },
  { immediate: true },
)
watch(
  () => store.analyzed?.record.id,
  () => {
    evidence.value = undefined
  },
)
function restart(id = store.lab.id, navigationConfirmed = false) {
  if (!navigationConfirmed && !confirmDiscardForms()) return
  const definition =
    workshop.customLabs.find((l) => l.id === id) ??
    (id === store.lab.id && id.startsWith('USR-')
      ? store.environment.network?.definition
      : undefined)
  store.start(id, selectedMode.value, definition, seed.value)
  resetKey.value++
  evidence.value = undefined
  beforeId.value = ''
  afterId.value = ''
  pending.value = undefined
  error.value = ''
  notice.value = ''
}
function run(command: string) {
  const value = store.run(command)
  if (value) consoleView.value?.output(value.record.output, value.clear)
}
async function analyzeRecord(id: number) {
  store.analyze(id)
  await nextTick()
  document.getElementById('terminal-analysis')?.focus()
}
function focusWorkspace(id: string) {
  const element = document.getElementById(id)
  element?.scrollIntoView({ block: 'start' })
  element?.focus({ preventScroll: true })
}
function showHint() {
  if (store.hints < store.lab.hints.length) store.hints++
}
async function reloadJournals() {
  try {
    await Promise.all([learning.reloadSaved(), workshop.reloadSaved()])
  } catch {
    error.value = 'Перечитывание не удалось; текущая попытка доступна для экспорта.'
  }
}
async function finish() {
  await store.finish()
}
async function local(action: 'save' | 'load' | 'delete') {
  if (busy.value) return
  if (action === 'save' && !consent.value) {
    error.value = 'Подтвердите сохранение состояния учебной среды.'
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  const id = store.lab.id,
    snapshot = store.checkpoint()
  try {
    const repository = await import('../features/terminal/repository')
    if (action === 'save') {
      await repository.saveCheckpoint(snapshot)
      notice.value = 'Контрольная точка сохранена. Команды и вывод не записывались.'
    } else if (action === 'load') {
      const value = await repository.loadCheckpoint(id)
      if (id === store.lab.id) {
        pending.value = value
        notice.value = value
          ? 'Проверьте контрольную точку перед восстановлением.'
          : 'Для этой лаборатории нет контрольной точки.'
      }
    } else {
      await repository.deleteCheckpoint(id)
      notice.value = 'Контрольная точка этой лаборатории удалена.'
    }
  } catch (cause) {
    error.value =
      cause instanceof Error && cause.message.startsWith('Лимит:')
        ? cause.message
        : 'Хранилище недоступно. Можно скачать контрольную точку JSON и импортировать позже.'
  } finally {
    busy.value = false
  }
}
let readVersion = 0
onBeforeUnmount(() => {
  readVersion++
})
async function read(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const version = ++readVersion
  pending.value = undefined
  error.value = ''
  try {
    if (file.size > 65536) throw new Error('Файл превышает 64 KiB.')
    const value = parseCheckpoint(await file.text())
    if (version === readVersion) pending.value = value
  } catch (cause) {
    if (version === readVersion)
      error.value = cause instanceof Error ? cause.message : 'Ошибка импорта.'
  } finally {
    ;(event.target as HTMLInputElement).value = ''
  }
}
function restore() {
  if (!confirmDiscardForms()) return
  if (!pending.value) return
  store.restore(pending.value)
  selectedMode.value = store.mode
  seed.value = store.variantSeed
  resetKey.value++
  beforeId.value = ''
  afterId.value = ''
  evidence.value = undefined
  pending.value = undefined
  notice.value = 'Восстановлено состояние среды. История команд и разборы не сохранялись.'
  void router.replace({ path: '/terminal', query: { lab: store.lab.id } })
}
function exportCheckpoint() {
  downloadText(
    JSON.stringify(store.checkpoint(), null, 2),
    `workbench-${store.lab.id}.json`,
    'application/json;charset=utf-8',
  )
}
function exportResult() {
  if (!store.feedback || !store.finished) return
  downloadText(
    [
      '# Учебная терминальная лаборатория',
      store.lab.title,
      'Виртуальная среда; синтетические данные. Оценка не является подтверждением квалификации.',
      `Результат: ${store.feedback.score}/100. Подсказок: ${store.hints}.`,
      ...store.feedback.checks.map((c) => `- [${c.met ? 'x' : ' '}] ${c.label}`),
      store.lab.explanation,
      'Введённые команды и исходный вывод в этот отчёт не включены.',
    ].join('\n\n'),
    'workbench-terminal-result.md',
  )
}
onMounted(async () => {
  await Promise.all([learning.initialize(), workshop.initialize()])
  if (typeof route.query.checkpoint === 'string' && route.query.checkpoint.length <= 80) {
    try {
      const repo = await import('../features/terminal/repository')
      pending.value = await repo.loadCheckpoint(route.query.checkpoint)
      if (!pending.value) error.value = 'Контрольная точка не найдена.'
    } catch {
      error.value = 'Не удалось прочитать выбранную контрольную точку.'
    }
  }
  await nextTick()
  if (store.records.length)
    consoleView.value?.output(
      store.records
        .map(
          (r) =>
            `${platform.value === 'Linux' ? 'student@lab:~$ ' : 'PS C:\\Lab> '}${r.command}\n${r.output}`,
        )
        .join('\n'),
    )
})
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">КОМАНДЫ → ПРИЗНАКИ → ПРОВЕРКА</span>
      <h1>Учебный терминал<span class="accent">.</span></h1>
      <p>Виртуальный ПК и сеть. Исследуйте проблему, объясните причину и подтвердите результат.</p>
    </div>
    <span class="tag">{{ labIds.length }} ЛАБОРАТОРИИ</span>
  </div>
  <label
    >Найти лабораторию<input
      v-model="search"
      class="text-input"
      placeholder="DNS, DHCP, TLS, VPN, права…"
  /></label>
  <details class="terminal-catalog">
    <summary>Выбрать лабораторию ({{ allLabs.length }}) · {{ store.lab.title }}</summary>
    <nav class="learning-mode-nav" aria-label="Терминальные лаборатории">
      <RouterLink
        v-for="lab in visibleLabs"
        :key="lab.id"
        :to="{ path: '/terminal', query: { lab: lab.id } }"
        :aria-current="store.lab.id === lab.id ? 'page' : undefined"
        >{{ lab.title }}</RouterLink
      >
    </nav>
  </details>
  <section class="panel feature-section terminal-brief">
    <span class="eyebrow">УЧЕБНАЯ ЗАЯВКА</span>
    <h2>{{ store.lab.title }}</h2>
    <p>{{ store.lab.brief }}</p>
    <p v-if="platform === 'Windows'">
      ПК: TRAINING-PC · Ethernet, индекс 12 · рабочий DNS:
      {{ store.environment.network?.definition.dns ?? '192.0.2.53' }} · портал: TCP 443.
      Используются только вымышленные узлы.
    </p>
    <p v-else>
      Учебный Linux-узел · служба lab-app · конфигурация /etc/lab/app.conf. Права, служба и журнал
      моделируются в браузере.
    </p>
    <div class="button-row terminal-controls">
      <label
        >Вариант задания<input
          v-model.number="seed"
          type="number"
          min="0"
          max="999999"
          class="text-input"
          :disabled="!store.environment.network || store.records.length > 0 || store.finished"
          @change="restart()"
      /></label>
      <label
        >Режим лаборатории<AppSelect
          v-model="selectedMode"
          class="text-input"
          :disabled="store.records.length > 0 || store.finished"
          @change="restart()"
        >
          <AppSelectOption value="guided">Обучение с подсказками</AppSelectOption>
          <AppSelectOption value="practice">Самостоятельная практика</AppSelectOption>
          <AppSelectOption value="exam">Проверочная работа</AppSelectOption>
        </AppSelect></label
      ><button class="button secondary" :disabled="busy || store.finishing" @click="restart()">
        Начать заново</button
      ><RouterLink class="button ghost" to="/learning?view=journal">Журнал обучения</RouterLink>
    </div>
    <p>
      В обучении проверку можно повторять; подсказка уменьшает оценку на 5. В самостоятельной
      практике результат добавляется только в практикум; базовый журнал пропускается. В проверочной
      работе одна итоговая проверка, без подсказок.
    </p>
    <details
      class="terminal-storage-options"
      :open="Boolean(workshop.error || learning.error || store.finishing || store.finished)"
    >
      <summary>
        Хранение результата ·
        {{
          workshop.enabled || learning.enabled
            ? 'включено для выбранных журналов'
            : 'результаты пока в памяти'
        }}
      </summary>
      <label class="checkbox-label"
        ><input
          type="checkbox"
          :checked="workshop.enabled"
          :disabled="!workshop.ready || store.finishing"
          @change="workshop.toggle(($event.target as HTMLInputElement).checked)"
        />Сохранять журнал практикума</label
      >
      <label class="checkbox-label"
        ><input
          type="checkbox"
          :checked="learning.enabled"
          :disabled="!learning.ready || store.finishing"
          @change="learning.setEnabled(($event.target as HTMLInputElement).checked)"
        />Сохранять базовый учебный журнал</label
      >
      <p>
        Согласия независимы. Команды и диагностический вывод остаются в памяти. Решение выполнено и
        сохранение результата — отдельные состояния.
      </p>
      <p v-if="store.finishing" role="status">Завершаем попытку и записываем результат…</p>
      <p
        v-for="(result, journal) in store.saveResults"
        :key="journal"
        :role="result?.status === 'failed' ? 'alert' : 'status'"
      >
        {{ journal === 'workshop' ? 'Практикум' : 'Базовый журнал' }}:
        {{
          result?.status === 'saved'
            ? 'результат сохранён'
            : result?.status === 'failed'
              ? `сохранение не удалось: ${result.error}`
              : 'результат в памяти вкладки'
        }}
      </p>
      <p v-if="workshop.error" role="alert">{{ workshop.error }}</p>
      <div v-if="workshop.error || learning.error" class="button-row">
        <button class="button secondary" @click="exportResult">Экспорт текущей попытки</button
        ><button class="button secondary" @click="reloadJournals">Перечитать оба журнала</button
        ><RouterLink class="button ghost" to="/settings"
          >Экспорт и выборочная очистка данных</RouterLink
        >
      </div>
    </details>
    <p v-if="learning.error" role="alert">{{ learning.error }}</p>
    <p v-if="learning.saving" role="status">Сохраняем учебный результат…</p>
  </section>
  <TerminalWorkspaceGuide
    v-if="store.mode !== 'exam' || store.finished"
    :mode="store.mode"
    :records="store.records"
    :revision="store.environment.revision"
    :verified-revision="store.environment.verifiedRevision"
    :finished="store.finished"
  />
  <nav class="button-row terminal-workspace-nav" aria-label="Блоки учебного рабочего места">
    <button class="button ghost" @click="focusWorkspace('terminal-console')">Консоль</button>
    <button class="button ghost" @click="focusWorkspace('terminal-records')">
      Результаты команд
    </button>
    <button class="button ghost" @click="focusWorkspace('terminal-finish')">
      Проверка решения
    </button>
    <button class="button ghost" @click="focusWorkspace('terminal-report')">Отчёт и рубрика</button>
  </nav>
  <div id="terminal-console" class="terminal-workspace" tabindex="-1">
    <NetworkMap :state="mapState" :exam="store.mode === 'exam'" />
    <div class="terminal-tools">
      <TerminalConsole
        ref="consoleView"
        :reset-key="resetKey"
        :disabled="store.finished"
        :commands="commands.map((c) => c.example)"
        :history="store.records.map((record) => record.command)"
        :platform="platform"
        @command="run"
      />
      <CommandCatalog
        v-if="store.mode !== 'exam'"
        :commands="commands"
        :disabled="store.finished"
        @insert="consoleView?.focusCommand($event)"
      />
    </div>
  </div>
  <RouterLink class="text-link" to="/learning?view=workshop"
    >Карта навыков, новые курсы и редактор лабораторий</RouterLink
  >
  <section v-if="store.mode !== 'exam'" class="panel feature-section">
    <h2>{{ store.mode === 'guided' ? 'Подсказки и материалы' : 'Материалы по теме' }}</h2>
    <template v-if="store.mode === 'guided'"
      ><button
        class="button ghost"
        :disabled="store.finished || store.hints >= 3"
        @click="showHint"
      >
        Следующая подсказка ({{ store.hints }}/3)
      </button>
      <p v-for="hint in store.lab.hints.slice(0, store.hints)" :key="hint" class="terminal-hint">
        {{ hint }}
      </p></template
    >
    <RouterLink class="text-link" :to="{ path: '/knowledge', query: { q: knowledgeTopic } }"
      >Изучить тему в справочнике</RouterLink
    >
  </section>
  <TerminalRecordsPanel
    :key="store.attemptId"
    :records="store.records"
    :revision="store.environment.revision"
    :show-review="store.mode !== 'exam' || store.finished"
    @analyze="analyzeRecord"
  />
  <section
    v-if="store.analyzed"
    id="terminal-analysis"
    tabindex="-1"
    aria-label="Разбор выбранной проверки"
  >
    <p class="terminal-origin">
      Учебный разбор: {{ store.analyzed.record.command }} · состояние
      {{ store.analyzed.record.revision }}
    </p>
    <PlainSummary :result="store.analyzed.result" @evidence="evidence = $event" />
    <div v-if="model?.kind === 'ipconfig'" class="adapter-grid">
      <AdapterCard
        v-for="(adapter, index) in model.adapters"
        :key="adapter.id"
        :adapter="adapter"
        :index="index"
        :revealed="true"
        @evidence="evidence = $event"
      />
    </div>
    <OutputCard v-else-if="model" :output="model" :revealed="true" @evidence="evidence = $event" />
    <EvidenceViewer :text="store.analyzed.record.output" :range="evidence" />
  </section>
  <section v-if="analyzable.length >= 2" class="panel feature-section">
    <h2>Сравнить учебные проверки до и после</h2>
    <div class="form-grid">
      <label
        >Учебная проверка до<AppSelect
          v-model="beforeId"
          class="text-input"
          aria-label="Учебная проверка до"
        >
          <AppSelectOption value="">Выберите проверку</AppSelectOption>
          <AppSelectOption v-for="r in analyzable" :key="r.id" :value="String(r.id)">
            {{ r.id }} · {{ r.command }} · состояние {{ r.revision }}
          </AppSelectOption>
        </AppSelect></label
      ><label
        >Учебная проверка после<AppSelect
          v-model="afterId"
          class="text-input"
          aria-label="Учебная проверка после"
        >
          <AppSelectOption value="">Выберите проверку</AppSelectOption>
          <AppSelectOption v-for="r in analyzable" :key="r.id" :value="String(r.id)">
            {{ r.id }} · {{ r.command }} · состояние {{ r.revision }}
          </AppSelectOption>
        </AppSelect></label
      >
    </div>
    <p v-if="differences.error" role="status">{{ differences.error }}</p>
    <ul class="diff-list">
      <li v-for="(d, index) in differences.values" :key="index">
        <strong>{{ d.scope }} · {{ d.field }}</strong>
        <p>До: {{ formatDifference(d.before, undefined, true) }}</p>
        <p>После: {{ formatDifference(d.after, undefined, true) }}</p>
      </li>
    </ul>
    <p v-if="beforeId && afterId && !differences.error && !differences.values.length">
      Различий в поддерживаемых структурированных полях нет.
    </p>
  </section>
  <section id="terminal-finish" class="panel feature-section" tabindex="-1">
    <h2>Объяснить причину и проверить результат</h2>
    <fieldset :disabled="store.finished">
      <legend>Какой вывод обоснован полученными проверками?</legend>
      <label v-for="(cause, index) in store.lab.causes" :key="cause" class="checkbox-label"
        ><input v-model="store.diagnosis" type="radio" name="terminal-diagnosis" :value="index" />{{
          cause
        }}</label
      >
    </fieldset>
    <button
      class="button primary"
      :disabled="store.finished || store.diagnosis === undefined || store.finishing"
      @click="finish"
    >
      {{ store.mode === 'exam' ? 'Завершить проверочную работу' : 'Проверить решение' }}
    </button>
    <div v-if="store.feedback" class="terminal-feedback" role="status">
      <h3>
        {{
          store.finished ? `Попытка завершена: ${store.feedback.score}/100` : 'Остались проверки'
        }}
      </h3>
      <ul>
        <li v-for="check in store.feedback.checks" :key="check.label">
          {{ check.met ? '✓' : '○' }} {{ check.label }}
        </li>
      </ul>
      <p v-if="store.finished">{{ store.lab.explanation }}</p>
      <p v-if="store.finished">
        {{
          store.mode === 'practice'
            ? 'Результат самостоятельной практики добавлен в практикум.'
            : 'Результат добавлен в оба журнала. Состояние сохранения показано выше.'
        }}
      </p>
      <button v-if="store.finished" class="button secondary" @click="exportResult">
        Скачать разбор лаборатории
      </button>
    </div>
  </section>
  <div id="terminal-report" tabindex="-1"><InvestigationPanel /></div>
  <section class="panel feature-section">
    <h2>Контрольная точка учебной среды</h2>
    <p>
      Можно сохранить состояние сети, DNS, кэша, проверок и попытки. История введённых команд и
      вывод не сохраняются. По одной точке на лабораторию, всего до 50 точек; автоматической записи
      нет.
    </p>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Подтверждаю сохранение состояния учебной среды на
      этом устройстве</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="busy" @click="local('save')">
        Сохранить контрольную точку</button
      ><button class="button secondary" :disabled="busy" @click="local('load')">
        Загрузить контрольную точку</button
      ><button class="button ghost" :disabled="busy" @click="local('delete')">
        Удалить контрольную точку</button
      ><button class="button secondary" @click="exportCheckpoint">
        Скачать контрольную точку JSON
      </button>
    </div>
    <label
      >Импорт контрольной точки<input
        type="file"
        accept=".json,application/json"
        :disabled="busy"
        @change="read"
    /></label>
    <div v-if="pending" class="terminal-checkpoint-preview">
      <p>
        Лаборатория:
        {{
          'network' in pending.environment
            ? (pending.environment.network?.definition.title ??
              terminalLabs.find((l) => l.id === pending!.environment.labId)?.title)
            : terminalLabs.find((l) => l.id === pending!.environment.labId)?.title
        }}
        · DNS {{ pending.environment.dns }} · состояние {{ pending.environment.revision }} ·
        {{ pending.finished ? 'завершена' : 'в процессе' }} · режим
        {{
          { guided: 'обучение', practice: 'практика', exam: 'проверочная работа' }[pending.mode]
        }}.
      </p>
      <p>Восстановление заменит текущую учебную попытку и очистит её историю команд.</p>
      <button class="button primary" @click="restore">Восстановить учебную среду</button
      ><button class="button ghost" @click="pending = undefined">Отмена восстановления</button>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
