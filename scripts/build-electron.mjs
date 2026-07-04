import { build } from 'esbuild'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const currentFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url)
const __dirname = path.dirname(currentFile)
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'dist-electron')

mkdirSync(outDir, { recursive: true })

const entryPoints = [
  { entry: 'electron/main.ts', outfile: 'main.cjs' },
  { entry: 'electron/preload.ts', outfile: 'preload.cjs' },
  { entry: 'electron/search/searchWorker.ts', outfile: 'searchWorker.cjs' },
  { entry: 'electron/extensionHost.ts', outfile: 'extensionHost.cjs' },
]

await Promise.all(
  entryPoints.map(({ entry, outfile }) =>
    build({
      entryPoints: [path.join(root, entry)],
      outfile: path.join(outDir, outfile),
      bundle: true,
      platform: 'node',
      target: ['node20'],
      format: 'cjs',
      sourcemap: false,
      packages: 'external',
      logLevel: 'info',
    }),
  ),
)

console.log('[build-electron] Electron bundles written to', outDir)
