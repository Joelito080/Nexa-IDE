import path from 'node:path'

const base = process.cwd()
const userDataPath = path.resolve(base, '.nexus-ide-user-data')

export const app = {
  getPath(name) {
    if (name === 'userData') return userDataPath
    return path.resolve(base, name)
  },
}
