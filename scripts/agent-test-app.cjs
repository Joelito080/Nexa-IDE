const { spawn } = require('node:child_process')
const { join } = require('node:path')
const out = join(__dirname, 'agent-test-output.json')
const log = join(__dirname, 'agent-test-bootstrap.log')

require('node:fs').writeFileSync(log, 'agent-test-app start\n', 'utf-8')

const proc = spawn(process.execPath, [join(__dirname, 'agent-test.ts')], {
  stdio: 'inherit',
  cwd: join(__dirname, '..'),
  env: { ...process.env, TSX_DISABLE_SIGNATURE: '1' }
})

proc.on('exit', (code) => {
  require('node:fs').appendFileSync(log, `agent-test-app exit ${code}\n`, 'utf-8')
  process.exit(code)
})
