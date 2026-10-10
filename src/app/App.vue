<script setup lang="ts">
import { ref } from 'vue'
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
const nav = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard },
  { to: '/guide', label: 'Помощник диагностики', icon: Compass },
  { to: '/analyzer', label: 'Анализатор', icon: ScanLine },
  { to: '/sessions', label: 'Рабочие сессии', icon: Layers },
  { to: '/toolkit', label: 'Инструменты', icon: Calculator },
  { to: '/knowledge', label: 'Справочник', icon: BookOpen },
  { to: '/playbooks', label: 'Чек-листы', icon: ListChecks },
  { to: '/simulator', label: 'Тренажёр', icon: GraduationCap },
  { to: '/terminal', label: 'Учебный терминал', icon: Terminal },
  { to: '/learning', label: 'Учебный центр', icon: ChartNoAxesCombined },
  { to: '/cases', label: 'Локальные кейсы', icon: FolderOpen },
  { to: '/settings', label: 'Настройки', icon: Settings },
  { to: '/about', label: 'О проекте', icon: Info },
]
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
      <span class="nav-caption">РАБОЧАЯ СРЕДА</span>
      <nav aria-label="Основная навигация">
        <template v-for="item in nav" :key="item.to">
          <span
            v-if="item.to === '/' || item.to === '/simulator' || item.to === '/cases'"
            class="nav-group"
            >{{
              item.to === '/'
                ? 'Решить задачу'
                : item.to === '/simulator'
                  ? 'Развивать навыки'
                  : 'Мои данные и настройки'
            }}</span
          >
          <RouterLink :to="item.to" class="nav-item" :class="{ active: route.path === item.to }"
            ><component :is="item.icon" :size="19" /><span>{{ item.label }}</span
            ><ChevronRight v-if="route.path === item.to" :size="14" class="nav-chevron"
          /></RouterLink>
        </template>
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
          <span>Рабочая среда</span><ChevronRight :size="14" /><strong>{{
            route.meta.title
          }}</strong>
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
        <span>IT Support Workbench <span class="muted">/ инженерный инструмент</span></span
        ><span>Сначала факты. Затем выводы.</span>
      </footer>
    </div>
  </div>
</template>
