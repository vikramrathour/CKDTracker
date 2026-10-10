import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      // Tests must only ever see synthetic data: pin the personal-data alias to
      // the committed sample, never the gitignored lib/personal/local.ts.
      { find: '@personal-data', replacement: fileURLToPath(new URL('./lib/personal/sample.ts', import.meta.url)) },
      { find: /^@\//, replacement: root },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
