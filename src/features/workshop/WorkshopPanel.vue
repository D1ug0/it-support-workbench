<script setup lang="ts">
import { confirmDiscardForms } from '../../shared/unsavedChanges'
import '../terminal/terminal.css'
import linuxGuide from '../../../lab-environments/linux-http/README.md?raw'
import composeTemplate from '../../../lab-environments/linux-http/compose.yaml?raw'
import dockerTemplate from '../../../lab-environments/linux-http/Dockerfile?raw'
import serverTemplate from '../../../lab-environments/linux-http/server.py?raw'
import controlTemplate from '../../../lab-environments/linux-http/control.py?raw'
import standGuide from '../../../docs/REAL_LAB.md?raw'
import fixtureGuide from '../../../docs/REAL_FIXTURES.md?raw'
import fixtureCollector from '../../../scripts/collect-windows-fixtures.ps1?raw'
import gitGuide from '../../../lab-environments/git-ci/README.md?raw'
import gitTemplate from '../../../lab-environments/git-ci/create.mjs?raw'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkshopStore } from './useWorkshopStore'
import {
  skills,
  skillStatus,
  recommendSkill,
  parseWorkshopProgress,
  type WorkshopProgress,
  type SkillId,
} from './skills'
import { workshopCourses, tracks } from './courses'
import { extendedLabs } from '../terminal/labDefinitions'
import MaterialCard from './MaterialCard.vue'
import ContinueLearning from './ContinueLearning.vue'
import PackagesPanel from './PackagesPanel.vue'
import ProfessionalPanel from './ProfessionalPanel.vue'
import CompanionPanel from './CompanionPanel.vue'
import TeacherPanel from './TeacherPanel.vue'
import LabEditor from './LabEditor.vue'
import CourseEditor from './CourseEditor.vue'
import StandPanel from './StandPanel.vue'
import GraphEditor from './GraphEditor.vue'
import TraceWorkshop from './TraceWorkshop.vue'
import { reportMarkdown } from './portfolio'
import { downloadText } from '../../infrastructure/export/exportReport'
const store = useWorkshopStore(),
  route = useRoute()
const tab = ref('path'),
  courseId = ref(workshopCourses[0]!.id),
  choice = ref<number>(),
  query = ref(''),
  error = ref(''),
  notice = ref(''),
  pending = ref<WorkshopProgress>(),
  busy = ref(false)
const tabs = [
  ['path', 'Карта навыков'],
  ['baseline', 'Стартовая проверка'],
  ['courses', 'Новые курсы'],
  ['packages', 'Углублённые пакеты'],
  ['professional', 'Профессиональные инциденты'],
  ['editor', 'Редактор лабораторий'],
  ['course-editor', 'Редактор курсов'],
  ['graphs', 'Инциденты с развилками'],
  ['traces', 'События и трассы'],
  ['portfolio', 'Портфолио'],
  ['stand', 'Настоящий стенд'],
  ['exchange', 'Обмен и преподаватель'],
]
function selectTab(id: string) {
  if (confirmDiscardForms(route)) tab.value = id
}
function prerequisites(ids: readonly SkillId[]) {
  return ids.map((id) => skills.find((s) => s.id === id)?.title).join(', ')
}
const baseline = ref<typeof workshopCourses>([]),
  baselineIndex = ref(0),
  baselineFeedback = ref('')
function startBaseline() {
  baseline.value = workshopCourses.filter(
    (c, i, all) =>
      c.tracks.includes(store.state.track) &&
      all.findIndex(
        (other) => other.skill === c.skill && other.tracks.includes(store.state.track),
      ) === i,
  )
  baselineIndex.value = 0
  baselineFeedback.value = ''
}
async function baselineAnswer(index?: number) {
  const current = baseline.value[baselineIndex.value]
  if (!current) return
  const correct = index === current.correct
  await store.replace({
    ...store.state,
    assessment: { ...store.state.assessment, [current.skill]: correct },
  })
  baselineFeedback.value = `${current.title}: ${index === undefined ? 'пропущено' : correct ? 'верно' : 'тема для изучения'}. ${current.why}`
  baselineIndex.value++
}
const recommendation = computed(() => recommendSkill(store.state))
const allCourses = computed(() => [...workshopCourses, ...store.customCourses])
const courses = computed(() =>
  allCourses.value.filter(
    (c) =>
      c.tracks.includes(store.state.track) &&
      `${c.title} ${c.paragraphs.join(' ')}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
const course = computed(
  () => allCourses.value.find((c) => c.id === courseId.value) ?? workshopCourses[0]!,
)
const authored = computed(() => course.value.id.startsWith('COURSE-'))
const recommendedLab = computed(() =>
  extendedLabs.find((l) => l.skill === recommendation.value.skill.id),
)
watch(
  () => route.query.workshop,
  (value) => {
    if (tabs.some(([id]) => id === value)) tab.value = String(value)
  },
  { immediate: true },
)
watch(
  () => [route.query.lesson, store.customCourses] as const,
  ([value]) => {
    if (allCourses.value.some((c) => c.id === value)) {
      courseId.value = String(value)
      tab.value = 'courses'
      choice.value = undefined
    }
  },
  { immediate: true },
)
onMounted(async () => {
  await store.initialize()
  if (!route.query.lesson && allCourses.value.some((c) => c.id === store.state.currentLesson))
    courseId.value = store.state.currentLesson!
})
async function markRead() {
  await store.replace({
    ...store.state,
    read: [...new Set([...store.state.read, `LESSON-${course.value.id}`])],
  })
  notice.value =
    'Знакомство с материалом отмечено. Самостоятельный навык проверяется лабораториями.'
}
async function answer(index: number) {
  choice.value = index
  if (authored.value) return
  await store.recordTheory({
    taskId: course.value.id,
    skill: course.value.skill,
    form: 'choice',
    correct: index === course.value.correct,
    at: new Date().toISOString(),
  })
  await store.addEvent({
    attemptId: globalThis.crypto.randomUUID(),
    module: 'course',
    taskId: course.value.id,
    skill: course.value.skill,
    at: new Date().toISOString(),
    score: index === course.value.correct ? 100 : 0,
    outcome: index === course.value.correct ? 'completed' : 'failed',
    errors: index === course.value.correct ? [] : [course.value.why.slice(0, 180)],
  })
  await store.replace({
    ...store.state,
    assessment: { ...store.state.assessment, [course.value.skill]: index === course.value.correct },
  })
}
async function track(event: Event) {
  await store.replace({ ...store.state, track: (event.target as HTMLSelectElement).value })
}
function openCourse(id: string) {
  void store.replace({ ...store.state, currentLesson: id })
  courseId.value = id
  choice.value = undefined
  tab.value = 'courses'
}
function exportProgress() {
  downloadText(
    JSON.stringify(store.state),
    'workbench-workshop-progress.json',
    'application/json;charset=utf-8',
  )
}
let version = 0
onBeforeUnmount(() => version++)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const ticket = ++version
  pending.value = undefined
  try {
    if (file.size > 12 * 1024 * 1024) throw new Error('Лимит 12 MiB.')
    const value = parseWorkshopProgress(await file.text())
    if (ticket === version) {
      pending.value = value
      error.value = ''
    }
  } catch (e) {
    if (ticket === version) error.value = e instanceof Error ? e.message : 'Ошибка импорта.'
  } finally {
    input.value = ''
  }
}
async function restore() {
  if (!pending.value) return
  busy.value = true
  try {
    await store.replace(pending.value)
    pending.value = undefined
    notice.value = 'Прогресс практикума восстановлен.'
  } catch {
    error.value = 'Не удалось восстановить прогресс.'
  } finally {
    busy.value = false
  }
}
async function clear() {
  busy.value = true
  try {
    await store.clear()
    notice.value = 'Прогресс практикума удалён; лаборатории и отчёты сохраняются отдельно.'
  } catch {
    error.value = 'Удаление не удалось.'
  } finally {
    busy.value = false
  }
}
async function removeReport(id: string) {
  try {
    await store.removeReport(id)
  } catch {
    error.value = 'Удаление отчёта не удалось.'
  }
}
function exportTeacher() {
  downloadText(
    [
      '# Обзор навыков',
      'Анонимная учебная статистика; не является независимой аттестацией.',
      ...skills.map(
        (s) =>
          `- ${s.title}: ${skillStatus(store.state, s.id).level}; попыток ${skillStatus(store.state, s.id).attempts}`,
      ),
    ].join('\n'),
    'workbench-skills-summary.md',
  )
}
</script>
<template>
  <div class="workshop-root">
    <ContinueLearning />
    <h2>Практикум развития</h2>
    <p>
      Пять учебных траекторий, самостоятельные лаборатории и понятная карта навыков. Выберите
      направление и переходите от материала к проверяемому результату.
    </p>
    <nav class="learning-mode-nav" aria-label="Разделы практикума">
      <button
        v-for="[id, title] in tabs"
        :key="id"
        :class="['button', tab === id ? 'primary' : 'secondary']"
        :aria-pressed="tab === id"
        @click="selectTab(id!)"
      >
        {{ title }}
      </button>
    </nav>
    <label class="checkbox-label"
      ><input
        :checked="store.enabled"
        type="checkbox"
        :disabled="!store.ready"
        @change="store.toggle(($event.target as HTMLInputElement).checked)"
      />Сохранять навыки и результаты практикума на устройстве</label
    >
    <p>
      По умолчанию результаты в памяти. Записываются только ID, режим, вариант, подсказки, оценка,
      дата, знакомство с уроками и выбранный маршрут. Выключение останавливает запись; удаление —
      отдельное действие.
    </p>
    <details v-if="store.problems.length">
      <summary>Проблемные записи ({{ store.problems.length }})</summary>
      <ul>
        <li v-for="p in store.problems" :key="`${p.collection}:${p.id}`">
          {{ p.collection }} / {{ p.id }}: {{ p.reason }}
        </li>
      </ul>
      <RouterLink to="/settings">Экспорт исходных записей и восстановление</RouterLink>
    </details>
    <p v-if="store.error || error" role="alert">{{ error || store.error }}</p>
    <button v-if="store.error" class="button secondary" @click="store.reloadSaved()">
      Перечитать сохранённый прогресс вместо текущего
    </button>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="tab === 'baseline'" class="panel feature-section">
      <h3>Стартовая проверка понимания</h3>
      <p>
        Короткие вопросы выбранного направления. Результат помогает выбрать тему; это проверка
        основ, самостоятельное владение определяется практикой.
      </p>
      <button class="button primary" @click="startBaseline">Начать проверку направления</button
      ><template v-if="baseline[baselineIndex]"
        ><p>
          Вопрос {{ baselineIndex + 1 }} из {{ baseline.length }} ·
          {{ baseline[baselineIndex]!.title }}
        </p>
        <p>{{ baseline[baselineIndex]!.question }}</p>
        <div class="workshop-choices">
          <button
            v-for="(option, i) in baseline[baselineIndex]!.options"
            :key="i"
            class="button secondary"
            @click="baselineAnswer(i)"
          >
            {{ option }}</button
          ><button class="button ghost" @click="baselineAnswer()">Пока не знаю</button>
        </div></template
      >
      <p v-else-if="baseline.length">
        Проверка завершена. Откройте карту навыков и рекомендуемую тему.
      </p>
      <p role="status">{{ baselineFeedback }}</p>
    </section>
    <template v-if="tab === 'path'">
      <section class="panel feature-section">
        <h3>Ваш учебный маршрут</h3>
        <label
          >Направление<select :value="store.state.track" class="text-input" @change="track">
            <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.title }}</option>
          </select></label
        >
        <p>
          <strong>Рекомендуется: {{ recommendation.skill.title }}</strong
          >. {{ recommendation.reason }}
        </p>
        <RouterLink
          v-if="recommendation.stand"
          class="button primary"
          to="/learning?view=workshop&workshop=stand"
          >Перейти к плану настоящего стенда</RouterLink
        >
        <RouterLink
          v-else-if="recommendedLab"
          class="button primary"
          :to="`/terminal?lab=${recommendedLab.id}`"
          >Перейти к рекомендованной лаборатории</RouterLink
        >
        <button
          v-else
          class="button primary"
          @click="openCourse(workshopCourses.find((c) => c.skill === recommendation.skill.id)!.id)"
        >
          Перейти к рекомендованной теме
        </button>
        <p>
          Самостоятельное владение требует разных семейств причин и компетенций. Косметические
          варианты адресов этого не подтверждают. Для перехода дальше нужны две разные причины,
          компетенции и формы теории. Отложенная проверка через неделю подтверждается новой причиной
          или двумя разными причинами в течение суток; она не задерживает изучение следующей темы.
          Это учебный показатель. Повторение предлагается после затруднения или через неделю.
        </p>
      </section>
      <div class="workshop-grid">
        <article v-for="skill in skills" :key="skill.id" class="panel feature-section">
          <h3>{{ skill.title }}</h3>
          <p>{{ skillStatus(store.state, skill.id).level }}</p>
          <p>
            Попыток: {{ skillStatus(store.state, skill.id).attempts }} · самостоятельно:
            {{ skillStatus(store.state, skill.id).independent }}
          </p>
          <p>
            {{ skillStatus(store.state, skill.id).theory }}. Семейств причин:
            {{ skillStatus(store.state, skill.id).causeFamilies }}. Отложенная проверка:
            {{ skillStatus(store.state, skill.id).retention ? 'подтверждена' : 'предстоит' }}.
            Отчётов стенда (самостоятельно): {{ skillStatus(store.state, skill.id).standReports }}.
          </p>
          <p v-if="skillStatus(store.state, skill.id).readyToAdvance">
            Основа для следующей темы подтверждена.
          </p>
          <ul>
            <li v-for="c in skillStatus(store.state, skill.id).confirmed" :key="c">{{ c }}</li>
          </ul>
          <p v-if="skill.requires.length">
            Основы:
            {{ prerequisites(skill.requires) }}
          </p>
          <p v-if="skillStatus(store.state, skill.id).needsReview">Рекомендуется повторить.</p>
          <button
            class="button secondary"
            @click="openCourse(workshopCourses.find((c) => c.skill === skill.id)!.id)"
          >
            Изучить тему
          </button>
        </article>
      </div>
      <section class="panel feature-section">
        <h3>Последние самостоятельные попытки</h3>
        <p v-if="!store.state.attempts.length">
          Пройдите терминальную лабораторию. Здесь появятся режим, вариант и результат.
        </p>
        <ol>
          <li v-for="(a, i) in [...store.state.attempts].reverse().slice(0, 15)" :key="i">
            {{ a.id }} · {{ a.mode }} · вариант {{ a.seed }} · {{ a.score }}/100 · подсказок
            {{ a.hints }} · {{ new Date(a.at).toLocaleString('ru-RU') }}
          </li>
        </ol>
      </section>
    </template>
    <template v-if="tab === 'courses'"
      ><section class="panel feature-section">
        <h3>Тематические пакеты</h3>
        <label
          >Поиск по новым курсам<input
            v-model="query"
            class="text-input"
            placeholder="TLS, DHCP, Linux, Git…" /></label
        ><label
          >Направление<select :value="store.state.track" class="text-input" @change="track">
            <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.title }}</option>
          </select></label
        >
        <div class="button-row">
          <button
            v-for="c in courses"
            :key="c.id"
            :class="['button', courseId === c.id ? 'primary' : 'secondary']"
            @click="openCourse(c.id)"
          >
            {{ c.title }} {{ store.state.read.includes(`LESSON-${c.id}`) ? '✓' : '' }}
          </button>
        </div>
        <p v-if="!courses.length">
          В выбранном направлении совпадений нет. Измените запрос или направление.
        </p>
      </section>
      <article class="panel feature-section">
        <h3>{{ course.title }}</h3>
        <RouterLink
          v-if="typeof route.query.returnAttempt === 'string'"
          class="button secondary"
          :to="`/learning?view=workshop&workshop=professional&attempt=${encodeURIComponent(route.query.returnAttempt)}`"
          >Вернуться к инциденту {{ route.query.returnAttempt }}</RouterLink
        >
        <MaterialCard
          :id="course.id"
          :source="course.source"
          :authored="authored"
          :prerequisites="prerequisites(skills.find((s) => s.id === course.skill)?.requires ?? [])"
        />
        <p v-if="authored" class="tag">
          Авторский материал · самопроверка без изменения встроенной оценки навыка
        </p>
        <p v-for="paragraph in course.paragraphs" :key="paragraph">{{ paragraph }}</p>
        <h4>Практический процесс</h4>
        <ol>
          <li v-for="step in course.steps" :key="step">{{ step }}</li>
        </ol>
        <a :href="course.source" target="_blank" rel="noopener noreferrer">{{
          authored ? 'Источник, указанный автором' : 'Первичный источник по теме'
        }}</a>
        <div class="button-row">
          <button class="button ghost" @click="markRead">Отметить материал изученным</button
          ><RouterLink
            v-for="lab in course.labs"
            :key="lab"
            class="button secondary"
            :to="`/terminal?lab=${lab}`"
            >Практика: {{ lab }}</RouterLink
          >
        </div>
        <h4>Проверка понимания</h4>
        <p>{{ course.question }}</p>
        <div class="workshop-choices">
          <button
            v-for="(option, index) in course.options"
            :key="index"
            class="button secondary"
            :disabled="choice !== undefined"
            @click="answer(index)"
          >
            {{ option }}
          </button>
        </div>
        <p v-if="choice !== undefined" role="status">
          {{ choice === course.correct ? 'Верно.' : 'Разберём ошибку.' }} {{ course.why }}
        </p>
        <button v-if="choice !== undefined" class="button ghost" @click="choice = undefined">
          Повторить вопрос
        </button>
      </article>
    </template>
    <PackagesPanel v-if="tab === 'packages'" /><KeepAlive
      ><ProfessionalPanel v-if="tab === 'professional'"
    /></KeepAlive>
    <LabEditor v-if="tab === 'editor'" /><CourseEditor v-if="tab === 'course-editor'" /><GraphEditor
      v-if="tab === 'graphs'"
    /><TraceWorkshop v-if="tab === 'traces'" />
    <section v-if="tab === 'portfolio'" class="panel feature-section">
      <h3>Портфолио расследований</h3>
      <p>
        Отчёт создаётся в терминале через «Оформить расследование». Сохранение заметок явное,
        исходные команды автоматически не включаются. До 50 отчётов.
      </p>
      <p v-if="!store.portfolio.length">Сохранённых отчётов пока нет.</p>
      <article
        v-for="report in [...store.portfolio].reverse()"
        :key="report.id"
        class="workshop-item"
      >
        <h4>{{ report.title }}</h4>
        <p>
          {{ report.status === 'completed' ? 'Законченный отчёт' : 'Черновик' }} · версия
          {{ report.version }} · {{ new Date(report.at).toLocaleString('ru-RU') }} ·
          {{ report.score ?? 'без оценки' }}
        </p>
        <RouterLink
          class="button secondary"
          :to="`/terminal?lab=${report.labId}&report=${report.id}`"
          >Редактировать отчёт</RouterLink
        >
        <details>
          <summary>Показать сохранённые заметки</summary>
          <pre class="workshop-report-preview" tabindex="0">{{ reportMarkdown(report) }}</pre>
        </details>
        <button
          class="button ghost"
          @click="downloadText(reportMarkdown(report), 'workbench-investigation.md')"
        >
          Скачать отчёт</button
        ><button class="button ghost" @click="removeReport(report.id)">Удалить отчёт</button>
      </article>
    </section>
    <section v-if="tab === 'stand'" class="panel feature-section">
      <h3>Практика на настоящей ОС</h3>
      <p>
        Терминал Workbench моделирует ограниченные команды. Следующий уровень — собственная
        изолированная Windows/Linux VM. Приложение не устанавливает и не запускает её автоматически.
      </p>
      <ol>
        <li>
          Создайте свою VM с допустимым образом ОС и отдельной учебной сетью; используйте
          вымышленные данные.
        </li>
        <li>Сохраните снимок исправного состояния и план адресации.</li>
        <li>Получите исходные результаты команд и запишите версию ОС, локаль и время.</li>
        <li>
          Внесите одну учебную неисправность. Выполните диагностику, исправление и повторную
          проверку.
        </li>
        <li>
          Вручную откройте допустимый текст или выбранный PowerShell JSON в анализаторе Workbench.
        </li>
        <li>Сформируйте отчёт, затем восстановите снимок и повторите другой вариант.</li>
      </ol>
      <details>
        <summary>Полная инструкция для будущего стенда и Windows fixtures</summary>
        <pre class="workshop-report-preview" tabindex="0">{{ standGuide }}</pre>
      </details>
      <button class="button secondary" @click="downloadText(standGuide, 'workbench-real-lab.md')">
        Скачать инструкцию стенда
      </button>
      <details>
        <summary>Воспроизводимый Linux/HTTP-стенд в двух контейнерах</summary>
        <pre class="workshop-report-preview" tabindex="0">{{ linuxGuide }}</pre>
        <p>
          Сохраните пять файлов в отдельную учебную папку; команды выполняются вручную вне браузера.
        </p>
        <div class="button-row">
          <button
            v-for="[name, text] in [
              ['README.md', linuxGuide],
              ['compose.yaml', composeTemplate],
              ['Dockerfile', dockerTemplate],
              ['server.py', serverTemplate],
              ['control.py', controlTemplate],
            ]"
            :key="name"
            class="button secondary"
            @click="downloadText(text!, name!)"
          >
            Скачать {{ name }}
          </button>
        </div>
      </details>
      <details>
        <summary>Воспроизводимый Git-стенд с конфликтом и проверками</summary>
        <pre class="workshop-report-preview" tabindex="0">{{ gitGuide }}</pre>
        <div class="button-row">
          <button class="button secondary" @click="downloadText(gitGuide, 'README.md')">
            Скачать инструкцию Git
          </button>
          <button class="button secondary" @click="downloadText(gitTemplate, 'create.mjs')">
            Скачать подготовку Git-стенда
          </button>
        </div>
      </details>
      <h4>Задания для стенда</h4>
      <details>
        <summary>Сбор и приём настоящих Windows fixtures</summary>
        <p>
          Windows captures пока отсутствуют. Скрипт запускается вручную на своём стенде и сохраняет
          raw локально для вашего просмотра; автоматической отправки нет.
        </p>
        <pre class="workshop-report-preview" tabindex="0">{{ fixtureGuide }}</pre>
        <button class="button secondary" @click="downloadText(fixtureGuide, 'REAL_FIXTURES.md')">
          Скачать процесс приёма fixtures
        </button>
        <button
          class="button secondary"
          @click="downloadText(fixtureCollector, 'collect-windows-fixtures.ps1')"
        >
          Скачать сборщик Windows
        </button>
      </details>
      <StandPanel />
      <ul>
        <li>Windows: настройки адаптеров, DNS-кэш, служба, журналы, результирующая политика.</li>
        <li>Linux: файл конфигурации, владелец/группа/права, status службы и journal.</li>
        <li>Сети: локальная доставка, удалённая сеть, выбранный маршрут, отдельно IPv4/IPv6.</li>
        <li>Приложение: TCP, TLS, HTTP и пользовательский сценарий.</li>
        <li>
          Восстановление: копия данных, новое окружение, проверка результата без удаления исходного.
        </li>
      </ul>
      <RouterLink class="button secondary" to="/analyzer"
        >Открыть анализатор результатов</RouterLink
      >
      <p>
        Реальные Windows fixtures, аппаратная радиосреда и ручная проверка экранного диктора требуют
        соответствующего окружения; синтетический результат не подтверждает их выполнение.
      </p>
    </section>
    <section v-if="tab === 'exchange'" class="panel feature-section">
      <h3>Обмен прогрессом и работа преподавателя</h3>
      <p>
        Перенос между устройствами через JSON выполняется вручную. Предпросмотр отделён от замены
        данных. Отдельный companion ниже позволяет явно подключить собственный сервис; перенос JSON
        остаётся доступным без него.
      </p>
      <div class="button-row">
        <button class="button secondary" @click="exportProgress">
          Экспорт прогресса практикума</button
        ><button class="button ghost" @click="exportTeacher">Экспорт обзора навыков</button>
      </div>
      <label
        >Импорт прогресса практикума<input
          type="file"
          accept=".json,application/json"
          @change="read"
      /></label>
      <div v-if="pending" class="terminal-checkpoint-preview">
        <p>
          Будут заменены результаты практикума: {{ pending.attempts.length }} попыток,
          {{ pending.read.length }} изученных материалов, направление {{ pending.track }}.
          Лаборатории и портфолио не заменяются.
        </p>
        <button class="button primary" :disabled="busy" @click="restore">
          Подтвердить замену прогресса практикума</button
        ><button class="button ghost" @click="pending = undefined">Отменить замену</button>
      </div>
      <details>
        <summary>Удалить только прогресс практикума</summary>
        <p>Действие удаляет результаты навыков и попыток. Сначала можно скачать JSON.</p>
        <button class="button ghost" :disabled="busy" @click="clear">
          Удалить прогресс практикума
        </button>
      </details>
      <h4>Процесс преподавателя</h4>
      <ol>
        <li>Создать лаборатории и графы с критериями и объяснениями.</li>
        <li>Передать ученику JSON-пакеты.</li>
        <li>Получить отчёт расследования и обзор навыков.</li>
        <li>Проверить доказательства и назначить новый самостоятельный вариант.</li>
      </ol>
      <p>
        Критерии сценариев и локальные оценки редактируемы. Для независимой аттестации нужны
        отдельные правила доверия и проверка работы.
      </p>
    </section>
    <TeacherPanel v-if="tab === 'exchange'" /><CompanionPanel v-if="tab === 'exchange'" />
  </div>
</template>
