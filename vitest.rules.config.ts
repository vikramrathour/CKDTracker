import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('./', import.meta.url))

/**
 * Emulator-backed suites (security rules + migration). Run through
 * `npm run test:rules`, which wraps this in `firebase-tools emulators:exec`
 * so FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST are set.
 * `npm test` uses vitest.config.ts and never touches the emulator.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: '@personal-data', replacement: fileURLToPath(new URL('./lib/personal/sample.ts', import.meta.url)) },
      { find: /^@\//, replacement: root },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // All suites share one emulator project; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
