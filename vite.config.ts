import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**/*.ts',
        'src/infrastructure/parser/**/*.ts',
        'src/infrastructure/export/**/*.ts',
        'src/features/sessions/session.ts',
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
        'src/features/playbooks/catalog.ts',
      ],
      exclude: ['**/*.test.ts', '**/types/**', '**/parserRegistry.ts'],
      reporter: ['text', 'html'],
      thresholds: { statements: 85, branches: 85, functions: 85, lines: 85 },
    },
  },
})
