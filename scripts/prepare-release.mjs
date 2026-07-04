import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

async function run() {
  console.log('--- Nexa IDE Release Preparation Tool ---')

  const packageJsonPath = path.join(root, 'package.json')
  const packageJsonRaw = await fs.readFile(packageJsonPath, 'utf-8')
  const packageJson = JSON.parse(packageJsonRaw)
  const currentVersion = packageJson.version

  console.log(`Current version: ${currentVersion}`)

  // Get bump type (default patch)
  const bumpType = process.argv[2] || 'patch'
  const parts = currentVersion.split('.').map(Number)
  if (bumpType === 'major') {
    parts[0] += 1
    parts[1] = 0
    parts[2] = 0
  } else if (bumpType === 'minor') {
    parts[1] += 1
    parts[2] = 0
  } else {
    parts[2] += 1
  }
  const nextVersion = parts.join('.')
  console.log(`Next version will be: ${nextVersion}`)

  // Generate Changelog from git log
  let gitLogs = ''
  try {
    const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim()
    console.log(`Analyzing commits since last tag: ${lastTag}`)
    gitLogs = execSync(`git log ${lastTag}..HEAD --oneline`, { encoding: 'utf-8' }).trim()
  } catch {
    console.log('No previous tags found. Gathering all commit logs.')
    gitLogs = execSync('git log --oneline -n 20', { encoding: 'utf-8' }).trim()
  }

  const cleanLogs = gitLogs
    .split('\n')
    .map((line) => `- ${line.substring(8)}`)
    .join('\n')

  const changelogEntry = `## v${nextVersion} (${new Date().toISOString().split('T')[0]})\n\n${cleanLogs || '- Miscellaneous updates and stability fixes.'}\n\n`

  const changelogPath = path.join(root, 'CHANGELOG.md')
  let existingChangelog = ''
  try {
    existingChangelog = await fs.readFile(changelogPath, 'utf-8')
  } catch {}

  const newChangelog = changelogEntry + existingChangelog
  await fs.writeFile(changelogPath, newChangelog, 'utf-8')
  console.log('Updated CHANGELOG.md')

  packageJson.version = nextVersion
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8')
  console.log('Updated package.json version')

  console.log('\nRelease ready!')
  console.log('Next steps:')
  console.log(`1. git add package.json CHANGELOG.md`)
  console.log(`2. git commit -m "chore: release v${nextVersion}"`)
  console.log(`3. git tag -a v${nextVersion} -m "Release v${nextVersion}"`)
  console.log(`4. git push origin main --tags`)
}

run().catch((err) => {
  console.error('Failed to prepare release:', err)
  process.exit(1)
})
