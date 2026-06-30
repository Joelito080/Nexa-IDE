import { createRequire } from 'node:module'

// @ts-ignore
if (typeof globalThis.require === 'undefined') {
  // @ts-ignore
  globalThis.require = createRequire(import.meta.url)
}
