const { app } = require('electron')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

async function run() {
  await app.whenReady()

  const runner = path.join(__dirname, '..', 'scripts', 'verify-ai-inline.ts')
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(npx, ['--yes', 'tsx', runner], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', OPENROUTER_API_KEY: '' },
    encoding: 'utf8',
    timeout: 120_000,
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  app.exit(result.status ?? 1)
}

run().catch((err) => {
  console.error('AI verification failed:', err)
  app.exit(1)
})
