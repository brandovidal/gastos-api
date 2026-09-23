/// <reference types="vitest" />

import { defineConfig } from 'vitest/config'

import swc from 'unplugin-swc'

const alias = { '@/': new URL('./src/', import.meta.url).pathname }

export default defineConfig({
  plugins: [swc.vite()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          globals: true,
          environment: 'node',
          alias,
          root: './',
          testTimeout: 10_000,
          hookTimeout: 10_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*integration-test.ts'],
          globalSetup: ['./test/integration.setup.ts'],
          globals: true,
          environment: 'node',
          alias,
          root: './',
          fileParallelism: false,
        },
      },
      {
        // Real AI calls (P9 golden set): only through pnpm eval:extraction, never in CI
        extends: true,
        test: {
          name: 'eval',
          include: ['test/eval/**/*.eval.ts'],
          globals: true,
          environment: 'node',
          alias,
          root: './',
          testTimeout: 15 * 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
