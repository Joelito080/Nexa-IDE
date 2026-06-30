import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from 'source-map-support'

install()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')
process.chdir(projectRoot)

process.env.NODE_PATH = projectRoot

import { pathToFileURL } from 'node:url'

const electronShim = path.join(__dirname, 'electron-shim.mjs')

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const tsxLoader = require('tsx')

process.env.TSX_NODE_PROJECT = path.join(projectRoot, 'tsconfig.json')

(async () => {
  const harnessPath = path.join(projectRoot, 'scripts', 'agent-test.ts')
  const modUrl = pathToFileURL(harnessPath).href
  await import(modUrl)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
