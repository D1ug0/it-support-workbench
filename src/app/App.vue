<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  Terminal,
  LayoutDashboard,
  ScanLine,
  Info,
  ShieldCheck,
  Sun,
  Moon,
  ChevronRight,
  ArrowUpRight,
  Calculator,
  BookOpen,
  GraduationCap,
  FolderOpen,
  Layers,
  ListChecks,
  ChartNoAxesCombined,
  Settings,
  Compass,
} from '@lucide/vue'
import CommandPalette from '../shared/components/CommandPalette.vue'
import { version } from '../../package.json'

const route = useRoute()
const light = ref(false)
const learningNav = [
  { to: '/', label: 'Мой старт', icon: LayoutDashboard },
  { to: '/learning', label: 'Обучение', icon: GraduationCap },
  { to: '/learning?view=progress', label: 'Мой прогресс', icon: ChartNoAxesCombined },
  { to: '/terminal', label: 'Свободная практика', icon: Terminal },
]
const toolsNav = [
  { to: '/guide', label: 'Помощник диагностики', icon: Compass },
  { to: '/analyzer', label: 'Анализатор вывода', icon: ScanLine },
  { to: '/sessions', label: 'Рабочие сессии', icon: Layers },
  { to: '/toolkit', label: 'Расчёты и команды', icon: Calculator },
  { to: '/knowledge', label: 'Справочник', icon: BookOpen },
  { to: '/playbooks', label: 'Чек-листы', icon: ListChecks },
  { to: '/simulator', label: 'Пошаговые инциденты', icon: FolderOpen },
  { to: '/cases', label: 'Локальные кейсы', icon: FolderOpen },
]
const authorPanels = ['editor', 'course-editor', 'graphs', 'traces', 'exchange']
const navigationGroup = computed(() =>
  toolsNav.some((item) => item.to === route.path)
    ? 'Инструменты диагностики'
    : route.query.mode === 'author' || authorPanels.includes(String(route.query.workshop))
      ? 'Авторская мастерская'
      : ['/settings', '/about'].includes(route.path)
        ? 'О приложении и данных'
        : 'Мой учебный путь',
)
function isActive(to: string) {
  if (to === '/learning?view=progress')
    return route.path === '/learning' && route.query.view === 'progress'
  if (to === '/learning')
    return (
      route.path === '/learning' &&
      route.query.view !== 'progress' &&
      route.query.mode !== 'author' &&
      !authorPanels.includes(String(route.query.workshop))
    )
  return route.path === to
}
function toggleTheme() {
  light.value = !light.value
  document.documentElement.dataset.theme = light.value ? 'light' : 'dark'
}
function focusMain() {
  document.getElementById('main-content')?.focus()
}
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusMain">Перейти к содержимому</a>
  <div class="app-layout">
    <aside class="sidebar">
      <RouterLink class="brand" to="/" aria-label="IT Support Workbench — главная"
        ><span class="brand-icon"><Terminal :size="23" /></span
        ><span
          >IT SUPPORT<strong>Workbench<span class="brand-dot">.</span></strong></span
        ></RouterLink
      >
      <span class="nav-caption">УЧЕБНАЯ СРЕДА</span>
      <nav aria-label="Основная навигация">
        <span class="nav-group">Мой учебный путь</span>
        <RouterLink
          v-for="item in learningNav"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
          ><component :is="item.icon" :size="19" /><span>{{ item.label }}</span
          ><ChevronRight v-if="isActive(item.to)" :size="14" class="nav-chevron"
        /></RouterLink>
        <details class="nav-tools" :open="toolsNav.some((item) => isActive(item.to))">
          <summary class="nav-group">Инструменты диагностики <ChevronRight :size="14" /></summary>
          <RouterLink
            v-for="item in toolsNav"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.to) }"
            ><component :is="item.icon" :size="19" /><span>{{ item.label }}</span></RouterLink
          >
        </details>
        <span class="nav-group">Дополнительные возможности</span>
        <RouterLink
          class="nav-item"
          :class="{
            active:
              route.query.mode === 'author' || authorPanels.includes(String(route.query.workshop)),
          }"
          to="/learning?view=workshop&workshop=editor&mode=author"
          ><BookOpen :size="19" /><span>Авторская мастерская</span></RouterLink
        >
        <RouterLink class="nav-item" :class="{ active: route.path === '/settings' }" to="/settings"
          ><Settings :size="19" /><span>Данные и настройки</span></RouterLink
        >
        <RouterLink class="nav-item" :class="{ active: route.path === '/about' }" to="/about"
          ><Info :size="19" /><span>О проекте</span></RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <div class="local-card">
          <ShieldCheck :size="22" /><strong>Ваши данные — у вас</strong>
          <p>Обработка в браузере.<br />Без облака и регистрации.</p>
          <RouterLink to="/about">Как это работает <ArrowUpRight :size="13" /></RouterLink>
        </div>
        <div class="sidebar-version">
          <span class="status-dot" /> LOCAL-FIRST<span>v{{ version }}</span>
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="app-header">
        <div class="breadcrumb">
          <span>{{ navigationGroup }}</span
          ><ChevronRight :size="14" /><strong>{{ route.meta.title }}</strong>
        </div>
        <div class="header-actions">
          <CommandPalette />
          <span class="local-indicator"><span class="status-dot" /> Локальная обработка</span
          ><button
            class="icon-button"
            :aria-label="light ? 'Включить тёмную тему' : 'Включить светлую тему'"
            @click="toggleTheme"
          >
            <Moon v-if="light" :size="18" /><Sun v-else :size="18" />
          </button>
        </div>
      </header>
      <main id="main-content" class="main-content" tabindex="-1"><RouterView /></main>
      <footer class="app-footer">
        <span>IT Support Workbench <span class="muted">/ практика IT-поддержки</span></span
        ><span>Сначала факты. Затем выводы.</span>
      </footer>
    </div>
  </div>
</template>
