import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { getCompanionOrigins } from './src/shared/companionOrigins.ts'

export default defineConfig(({ mode, command }) => ({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'workbench-companion-csp',
      transformIndexHtml(html) {
        const origins = getCompanionOrigins(loadEnv(mode, process.cwd()).VITE_COMPANION_ORIGIN)
        if (command === 'serve') origins.push('ws://127.0.0.1:5173')
        return html.replace('__WORKBENCH_CONNECT_SOURCES__', origins.join(' '))
      },
    },
  ],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**/*.ts',
        'src/infrastructure/export/**/*.ts',
        'src/features/sessions/session.ts',
        'src/features/sessions/archive.ts',
        'src/features/simulator/custom.ts',
        'src/features/practice/catalog.ts',
        'src/features/learning/journal.ts',
        'src/features/learning/progress.ts',
        'src/features/learning/path.ts',
        'src/features/learning/review.ts',
        'src/features/academy/lab.ts',
        'src/features/toolkit/subnetPractice.ts',
        'src/features/guide/catalog.ts',
        'src/features/network-analysis/application/explainResult.ts',
        'src/features/cases/schema.ts',
        'src/features/cases/exportBundle.ts',
        'src/features/simulator/engine.ts',
        'src/features/terminal/engine.ts',
        'src/features/terminal/checkpoint.ts',
        'src/features/terminal/networkModel.ts',
        'src/features/terminal/networkEngine.ts',
        'src/features/workshop/domain/skills.ts',
        'src/features/workshop/domain/progressCommands.ts',
        'src/features/workshop/domain/learningErrors.ts',
        'src/features/workshop/domain/remediation.ts',
        'src/features/workshop/domain/remediationSchema.ts',
        'src/features/workshop/domain/remediationCatalog.ts',
        'src/features/workshop/domain/graph.ts',
        'src/features/workshop/domain/traces.ts',
        'src/features/workshop/domain/portfolio.ts',
        'src/features/workshop/infrastructure/companion.ts',
        'src/features/workshop/domain/customCourses.ts',
        'src/shared/companionOrigins.ts',
        'src/features/playbooks/catalog.ts',
      ],
      exclude: ['**/*.test.ts', '**/types/**', '**/parserRegistry.ts'],
      reporter: ['text', 'html'],
      thresholds: { statements: 85, branches: 85, functions: 85, lines: 85 },
    },
  },
}))
