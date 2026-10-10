<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '../features/terminal/terminal.css'
import { useRoute, useRouter } from 'vue-router'
import { terminalLabs, labIds, commandExamples } from '../features/terminal/catalog'
import { useTerminalStore } from '../features/terminal/useTerminalStore'
import TerminalConsole from '../features/terminal/TerminalConsole.vue'
import InvestigationPanel from '../features/workshop/InvestigationPanel.vue'
import NetworkMap from '../features/terminal/NetworkMap.vue'
import { networkCommands } from '../features/terminal/commandRegistry'
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
const commands = computed(() =>
  store.environment.network
    ? [...commandExamples, ...networkCommands]
    : [...commandExamples, ['wait 120', 'Продвинуть время и уменьшить TTL']],
)
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
    if (lab && lab.id !== store.lab.id) restart(lab.id)
  },
  { immediate: true },
)
watch(
  () => store.analyzed?.record.id,
  () => {
    evidence.value = undefined
  },
)
function restart(id = store.lab.id) {
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
function showHint() {
  if (store.hints < store.lab.hints.length) store.hints++
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
      store.records.map((r) => `PS C:\\Lab> ${r.command}\n${r.output}`).join('\n'),
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
    <p>
      ПК: TRAINING-PC · Ethernet, индекс 12 · рабочий DNS:
      {{ store.environment.network?.definition.dns ?? '192.0.2.53' }} · портал: TCP 443.
      Используются только вымышленные узлы.
    </p>
    <div class="button-row">
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
        >Режим лаборатории<select
          v-model="selectedMode"
          class="text-input"
          :disabled="store.records.length > 0 || store.finished"
          @change="restart()"
        >
          <option value="guided">Обучение с подсказками</option>
          <option value="practice">Самостоятельная практика</option>
          <option value="exam">Проверочная работа</option>
        </select></label
      ><button class="button secondary" :disabled="busy" @click="restart()">Начать заново</button
      ><RouterLink class="button ghost" to="/learning?view=journal">Журнал обучения</RouterLink>
    </div>
    <p>
      В обучении проверку можно повторять; подсказка уменьшает оценку на 5. В самостоятельной
      практике результат не записывается в журнал. В проверочной работе одна итоговая проверка, без
      подсказок.
    </p>
    <label class="checkbox-label"
      ><input
        :checked="learning.enabled"
        :disabled="!learning.ready"
        type="checkbox"
        @change="learning.setEnabled(($event.target as HTMLInputElement).checked)"
      />Сохранять учебный прогресс на этом устройстве</label
    >
    <p v-if="learning.error" role="alert">{{ learning.error }}</p>
    <p v-if="learning.saving" role="status">Сохраняем учебный результат…</p>
  </section>
  <div class="terminal-workspace">
    <NetworkMap :state="mapState" :exam="store.mode === 'exam'" />
    <TerminalConsole
      ref="consoleView"
      :reset-key="resetKey"
      :disabled="store.finished"
      @command="run"
    />
  </div>
  <RouterLink class="text-link" to="/learning?view=workshop"
    >Карта навыков, новые курсы и редактор лабораторий</RouterLink
  >
  <section v-if="store.mode !== 'exam'" class="panel feature-section">
    <h2>Команды и подсказки</h2>
    <p>
      Кнопка подставляет команду для редактирования. Выполнение — по Enter. Полный язык PowerShell и
      конвейеры не поддерживаются; выбранные cmdlet выводят учебный JSON.
    </p>
    <details>
      <summary>Открыть поддерживаемые команды</summary>
      <div class="terminal-command-list">
        <button
          v-for="[command, description] in commands"
          :key="command"
          class="button secondary"
          :disabled="store.finished"
          @click="consoleView?.focusCommand(command)"
        >
          <code>{{ command }}</code
          ><span>{{ description }}</span>
        </button>
      </div>
    </details>
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
    <RouterLink
      class="text-link"
      :to="{ path: '/knowledge', query: { q: store.lab.id === 'TERM-ICMP-TCP' ? 'ICMP' : 'DNS' } }"
      >Изучить тему в справочнике</RouterLink
    >
  </section>
  <InvestigationPanel />
  <section class="panel feature-section">
    <h2>Проверки этой лаборатории</h2>
    <p>
      Последние 40 команд хранятся в памяти. Разбор и сравнение выполняются существующим
      анализатором, отдельно от ваших рабочих данных.
    </p>
    <p v-if="!store.records.length">Начните с help или проверки сетевых параметров.</p>
    <ol class="terminal-records">
      <li v-for="record in [...store.records].reverse()" :key="record.id">
        <code>{{ record.command }}</code
        ><span class="tag">{{ record.ok ? `Состояние ${record.revision}` : 'Синтаксис' }}</span
        ><button
          v-if="record.kind"
          class="button secondary small"
          @click="store.analyze(record.id)"
        >
          Разобрать проверку {{ record.id }}
        </button>
        <details>
          <summary>Вывод проверки {{ record.id }}</summary>
          <pre>{{ record.output }}</pre>
        </details>
      </li>
    </ol>
  </section>
  <template v-if="store.analyzed"
    ><p class="terminal-origin">
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
  </template>
  <section v-if="analyzable.length >= 2" class="panel feature-section">
    <h2>Сравнить учебные проверки до и после</h2>
    <div class="form-grid">
      <label
        >Учебная проверка до<select
          v-model="beforeId"
          class="text-input"
          aria-label="Учебная проверка до"
        >
          <option value="">Выберите проверку</option>
          <option v-for="r in analyzable" :key="r.id" :value="String(r.id)">
            {{ r.id }} · {{ r.command }} · состояние {{ r.revision }}
          </option>
        </select></label
      ><label
        >Учебная проверка после<select
          v-model="afterId"
          class="text-input"
          aria-label="Учебная проверка после"
        >
          <option value="">Выберите проверку</option>
          <option v-for="r in analyzable" :key="r.id" :value="String(r.id)">
            {{ r.id }} · {{ r.command }} · состояние {{ r.revision }}
          </option>
        </select></label
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
  <section class="panel feature-section">
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
      :disabled="store.finished || store.diagnosis === undefined || learning.saving"
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
            ? 'Результат самостоятельной практики не записывался в журнал.'
            : 'Результат добавлен в журнал. Постоянное хранение зависит от переключателя учебного прогресса.'
        }}
      </p>
      <button v-if="store.finished" class="button secondary" @click="exportResult">
        Скачать разбор лаборатории
      </button>
    </div>
  </section>
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
