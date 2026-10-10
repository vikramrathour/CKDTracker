// PreToolUse (Edit|Write): block edits to secrets and the npm lockfile.
let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', () => {
  const file = (JSON.parse(input).tool_input?.file_path || '').replace(/\\/g, '/')
  if (/(^|\/)\.env(\.[^/]*)?\.local$|(^|\/)\.env$|(^|\/)package-lock\.json$/.test(file)) {
    console.error(
      `Blocked: ${file} is protected. Edit .env* by hand; change package-lock.json only via npm install.`
    )
    process.exit(2)
  }
})
