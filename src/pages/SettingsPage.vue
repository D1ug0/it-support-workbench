<script setup lang="ts">
import StorageStatus from '../features/workshop/StorageStatus.vue'
import { onMounted, ref } from 'vue'
import OfflineControls from '../features/offline/OfflineControls.vue'
import BackupPanel from '../features/workshop/BackupPanel.vue'
import { useAnalysisStore } from '../features/network-analysis/model/useAnalysisStore'
import { useSessionStore } from '../features/sessions/useSessionStore'
import { useLearningStore } from '../features/learning/useLearningStore'
import { useGuideStore } from '../features/guide/useGuideStore'
import { listCases } from '../features/cases/repository'
const analysis = useAnalysisStore(),
  session = useSessionStore(),
  learning = useLearningStore()
import { listArchives } from '../features/sessions/archiveRepository'
import { listScenarios } from '../features/simulator/customRepository'
import {
  countCheckpoints,
  listCheckpointSummaries,
  deleteCheckpoint,
} from '../features/terminal/repository'
import { useWorkshopStore } from '../features/workshop/useWorkshopStore'
import { useTerminalStore } from '../features/terminal/useTerminalStore'
const terminal = useTerminalStore(),
  workshop = useWorkshopStore()
const checkpointCount = ref<number>(),
  checkpoints = ref<Array<{ id: string; title: string }>>([]),
  checkpointBusy = ref(false),
  checkpointError = ref('')
const archiveCount = ref<number>(),
  scenarioCount = ref<number>()
const caseCount = ref<number>()
const guide = useGuideStore()
onMounted(async () => {
  await Promise.all([learning.initialize(), workshop.initialize()])
  const [archives, scenarios] = await Promise.allSettled([listArchives(), listScenarios()])
  archiveCount.value = archives.status === 'fulfilled' ? archives.value.length : undefined
  scenarioCount.value = scenarios.status === 'fulfilled' ? scenarios.value.length : undefined
  try {
    checkpointCount.value = await countCheckpoints()
    checkpoints.value = await listCheckpointSummaries()
  } catch {
    checkpointCount.value = undefined
  }
  try {
    caseCount.value = (await listCases()).length
  } catch {
    caseCount.value = undefined
  }
})
async function removeCheckpoint(id: string) {
  if (
    checkpointBusy.value ||
    !window.confirm(
      'Удалить только выбранную сохранённую контрольную точку? Экспортированный JSON и текущая попытка останутся.',
    )
  )
    return
  checkpointBusy.value = true
  try {
    await deleteCheckpoint(id)
    checkpoints.value = checkpoints.value.filter((c) => c.id !== id)
    checkpointCount.value = checkpoints.value.length
  } catch {
    checkpointError.value = 'Не удалось удалить выбранную контрольную точку.'
  } finally {
    checkpointBusy.value = false
  }
}
function clearMemory() {
  if (
    !window.confirm(
      'Очистить ввод анализатора, рабочую сессию, план помощника и попытку учебного терминала? Сохранённые данные останутся.',
    )
  )
    return
  analysis.clear()
  session.clear()
  guide.clear()
  terminal.start('TERM-DNS-SERVER')
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ДАННЫЕ И УПРАВЛЕНИЕ</span>
      <h1>Ваше рабочее место<span class="accent">.</span></h1>
      <p>Офлайн-доступ, данные и быстрые действия под вашим контролем.</p>
    </div>
  </div>
  <OfflineControls />
  <BackupPanel />
  <StorageStatus />
  <section class="panel feature-section">
    <h2>Что хранится на этом устройстве</h2>
    <div class="history-row">
      <span>Ввод анализатора</span
      ><strong>{{ analysis.input ? 'В памяти вкладки' : 'Пусто' }}</strong>
    </div>
    <div class="history-row">
      <span>Рабочая сессия</span><strong>{{ session.records.length }} проверок в памяти</strong>
    </div>
    <div class="history-row">
      <span>Обезличенные архивы</span
      ><strong>{{
        archiveCount === undefined ? 'Хранилище недоступно' : `${archiveCount} в IndexedDB`
      }}</strong>
    </div>
    <div class="history-row">
      <span>Собственные учебные сценарии</span
      ><strong>{{
        scenarioCount === undefined ? 'Хранилище недоступно' : `${scenarioCount} в IndexedDB`
      }}</strong>
    </div>
    <div class="history-row">
      <span>Помощник диагностики</span
      ><strong>{{ guide.selected ? 'План и ответы в памяти' : 'Пусто' }}</strong>
    </div>
    <div class="history-row">
      <span>Сохранённые кейсы</span
      ><strong>{{
        caseCount === undefined ? 'Хранилище недоступно' : `${caseCount} в IndexedDB`
      }}</strong>
    </div>
    <div class="history-row">
      <span>Учебный терминал</span><strong>{{ terminal.records.length }} команд в памяти</strong>
    </div>
    <div class="history-row">
      <span>Контрольные точки терминала</span
      ><strong>{{
        checkpointCount === undefined ? 'Хранилище недоступно' : `${checkpointCount} в IndexedDB`
      }}</strong>
    </div>
    <div class="history-row">
      <span>Учебный прогресс</span
      ><strong>{{ learning.enabled ? 'Запись включена' : 'Автозапись выключена' }}</strong>
    </div>
    <div class="history-row">
      <span>Практикум развития</span
      ><strong
        >{{ workshop.customLabs.length }} лабораторий, {{ workshop.customGraphs.length }} сценариев,
        {{ workshop.customCourses.length }} авторских курсов,
        {{ workshop.portfolio.length }} отчётов</strong
      >
    </div>
    <div class="button-row">
      <button class="button secondary small" @click="clearMemory">Очистить временные данные</button
      ><RouterLink class="button secondary small" to="/cases">Управлять кейсами</RouterLink
      ><RouterLink class="button secondary small" to="/learning">Управлять прогрессом</RouterLink
      ><RouterLink class="button secondary small" to="/terminal"
        >Контрольные точки терминала</RouterLink
      ><RouterLink class="button secondary small" to="/sessions">Архивы сессий</RouterLink
      ><RouterLink class="button secondary small" to="/simulator?view=editor"
        >Мои сценарии</RouterLink
      >
    </div>
    <details v-if="checkpoints.length">
      <summary>Управлять всеми контрольными точками ({{ checkpoints.length }}/50)</summary>
      <div v-for="c in checkpoints" :key="c.id" class="history-row">
        <RouterLink :to="`/terminal?checkpoint=${encodeURIComponent(c.id)}`">{{
          c.title
        }}</RouterLink
        ><button
          class="button ghost small"
          :disabled="checkpointBusy"
          @click="removeCheckpoint(c.id)"
        >
          Удалить сохранение {{ c.title }}
        </button>
      </div>
    </details>
    <p v-if="checkpointError" role="alert">{{ checkpointError }}</p>
    <p>
      Кейсы, прогресс, архивы, сценарии и контрольные точки не шифруются приложением и по умолчанию
      остаются на устройстве. Прогресс практикума можно вручную синхронизировать с собственным
      companion. Экспортированные файлы, clipboard и резервные копии браузера удаляются отдельно.
    </p>
  </section>
  <section class="panel feature-section">
    <h2>Клавиатура и работа без мыши</h2>
    <dl class="shortcut-list">
      <dt>Ctrl / ⌘ + K</dt>
      <dd>Быстрый поиск разделов и знаний</dd>
      <dt>Ctrl / ⌘ + Enter</dt>
      <dd>Анализировать текст в редакторе</dd>
      <dt>Escape</dt>
      <dd>Закрыть диалог</dd>
      <dt>Tab / Shift + Tab</dt>
      <dd>Перемещаться по элементам интерфейса</dd>
      <dt>← / →</dt>
      <dd>Переключить способ ввода в анализаторе</dd>
    </dl>
  </section>
</template>
