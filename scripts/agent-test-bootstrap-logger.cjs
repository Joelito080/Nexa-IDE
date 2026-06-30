const fs = require('node:fs')
const path = require('node:path')
const marker = path.join(__dirname, 'agent-test-bootstrap.log')
fs.writeFileSync(marker, 'bootstrap started\n', 'utf-8')

require('tsx/register')
fs.appendFileSync(marker, 'tsx registered\n', 'utf-8')

const scriptPath = path.join(__dirname, 'agent-test.ts')
try {
  require(scriptPath)
  fs.appendFileSync(marker, 'script required\n', 'utf-8')
} catch (err) {
  fs.appendFileSync(marker, `script error: ${err.message}\n`, 'utf-8')
  process.exit(1)
}
