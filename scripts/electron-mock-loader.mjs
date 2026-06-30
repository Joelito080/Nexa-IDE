import path from 'node:path'
import url from 'node:url'

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === 'electron') {
    return {
      url: url.pathToFileURL(path.resolve(process.cwd(), 'scripts', 'electron-mock-electron.mjs')).href,
      format: 'module',
      shortCircuit: true,
    }
  }
  return defaultResolve(specifier, context, defaultResolve)
}

export async function load(url, context, defaultLoad) {
  return defaultLoad(url, context, defaultLoad)
}
