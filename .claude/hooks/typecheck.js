// PostToolUse (Edit|Write): run tsc --noEmit after a .ts/.tsx edit and report
// errors in the edited file back to Claude (exit 2). Errors elsewhere are ignored
// so pre-existing issues don't fire on every edit.
const { execSync } = require('child_process')
const path = require('path')

let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', () => {
  const data = JSON.parse(input)
  const file = data.tool_input?.file_path || data.tool_response?.filePath || ''
  if (!/\.tsx?$/.test(file)) return

  const root = path.resolve(__dirname, '..', '..')
  const rel = path.relative(root, path.resolve(file)).replace(/\\/g, '/')
  if (rel.startsWith('..') || rel.startsWith('node_modules/')) return

  let out = ''
  try {
    execSync('npx tsc --noEmit --pretty false', { cwd: root, stdio: 'pipe' })
    return
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`
  }

  const errors = out
    .split(/\r?\n/)
    .filter((line) => line.replace(/\\/g, '/').startsWith(`${rel}(`))
  if (errors.length) {
    console.error(`tsc errors in ${rel}:\n${errors.slice(0, 20).join('\n')}`)
    process.exit(2)
  }
})
