<script setup lang="ts">
import { onMounted, ref } from 'vue'
import OfflineControls from '../features/offline/OfflineControls.vue'
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
import { countCheckpoints } from '../features/terminal/repository'
import { useTerminalStore } from '../features/terminal/useTerminalStore'
const terminal = useTerminalStore()
const checkpointCount = ref<number>()
const archiveCount = ref<number>(),
  scenarioCount = ref<number>()
const caseCount = ref<number>()
const guide = useGuideStore()
onMounted(async () => {
  await learning.initialize()
  const [archives, scenarios] = await Promise.allSettled([listArchives(), listScenarios()])
  archiveCount.value = archives.status === 'fulfilled' ? archives.value.length : undefined
  scenarioCount.value = scenarios.status === 'fulfilled' ? scenarios.value.length : undefined
  try {
    checkpointCount.value = await countCheckpoints()
  } catch {
    checkpointCount.value = undefined
  }
  try {
    caseCount.value = (await listCases()).length
  } catch {
    caseCount.value = undefined
  }
})
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
  terminal.start(terminal.lab.id)
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
    <p>
      Кейсы, прогресс, архивы, сценарии и контрольные точки не шифруются приложением и не
      синхронизируются. Экспортированные файлы, clipboard и резервные копии браузера удаляются
      отдельно.
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
