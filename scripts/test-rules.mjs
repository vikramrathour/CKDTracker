/**
 * `npm run test:rules`: run the emulator suites (tests/rules/**) inside
 *   firebase-tools emulators:exec --config firebase.test.json --only firestore,storage --project demo-ckd
 *
 * firebase.test.json uses dedicated ports (Firestore 8181, Storage 9299, hub
 * 4410, logging 4510) so this works while a dev emulator (firebase.json ports)
 * is running. On Windows the Firestore emulator JVM can outlive emulators:exec
 * and block the next run, so stray listeners on those test-only ports are
 * killed before and after.
 */
import { execSync, spawnSync } from 'node:child_process'

const TEST_PORTS = [8181, 9151, 9299, 4410, 4510]
const isWin = process.platform === 'win32'

function listenerPids() {
  const pids = new Set()
  try {
    if (isWin) {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of out.split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/)
        if (cols.length < 5 || cols[3] !== 'LISTENING') continue
        const port = Number(cols[1].slice(cols[1].lastIndexOf(':') + 1))
        if (TEST_PORTS.includes(port) && cols[4] !== '0') pids.add(cols[4])
      }
    } else {
      for (const port of TEST_PORTS) {
        try {
          const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
          out.split(/\s+/).filter(Boolean).forEach((p) => pids.add(p))
        } catch {
          // nothing listening
        }
      }
    }
  } catch {
    // netstat/lsof unavailable: skip cleanup
  }
  return [...pids]
}

function reapTestEmulators() {
  for (const pid of listenerPids()) {
    try {
      if (isWin) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
      else process.kill(Number(pid), 'SIGKILL')
    } catch {
      // already gone
    }
  }
}

reapTestEmulators()

const cmd =
  'npx -y firebase-tools emulators:exec --config firebase.test.json --only firestore,storage --project demo-ckd ' +
  '"vitest run -c vitest.rules.config.ts"'
const result = spawnSync(cmd, { stdio: 'inherit', shell: true })

reapTestEmulators()
process.exit(result.status ?? 1)
