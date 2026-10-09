import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/guide',
      component: () => import('../pages/GuidePage.vue'),
      meta: { title: 'Помощник диагностики' },
    },
    {
      path: '/sessions',
      component: () => import('../pages/SessionsPage.vue'),
      meta: { title: 'Рабочие сессии' },
    },
    {
      path: '/learning',
      component: () => import('../pages/LearningPage.vue'),
      meta: { title: 'Учебный центр' },
    },
    {
      path: '/playbooks',
      component: () => import('../pages/PlaybooksPage.vue'),
      meta: { title: 'Чек-листы' },
    },
    {
      path: '/settings',
      component: () => import('../pages/SettingsPage.vue'),
      meta: { title: 'Настройки' },
    },
    { path: '/', component: () => import('../pages/HomePage.vue'), meta: { title: 'Обзор' } },
    {
      path: '/analyzer',
      component: () => import('../pages/AnalyzerPage.vue'),
      meta: { title: 'Анализатор' },
    },
    {
      path: '/about',
      component: () => import('../pages/AboutPage.vue'),
      meta: { title: 'О проекте' },
    },
    {
      path: '/toolkit',
      component: () => import('../pages/ToolkitPage.vue'),
      meta: { title: 'Инструменты' },
    },
    {
      path: '/knowledge',
      component: () => import('../pages/KnowledgePage.vue'),
      meta: { title: 'Справочник' },
    },
    {
      path: '/simulator',
      component: () => import('../pages/SimulatorPage.vue'),
      meta: { title: 'Тренажёр' },
    },
    {
      path: '/cases',
      component: () => import('../pages/CasesPage.vue'),
      meta: { title: 'Локальные кейсы' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
router.afterEach((to) => {
  document.title = `${String(to.meta.title)} · IT Support Workbench`
})
