import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

export interface ProjectTemplateSummary {
  id: string
  name: string
  description: string
  keywords: string[]
  prompt: string
}

const TEMPLATE_CATALOG: ProjectTemplateSummary[] = [
  {
    id: 'react',
    name: 'React App',
    description: 'A fast Vite React starter with TypeScript.',
    keywords: ['react', 'vite', 'spa'],
    prompt: 'Build me a React app',
  },
  {
    id: 'nextjs',
    name: 'Next.js App',
    description: 'Server-rendered React with Next.js and TypeScript.',
    keywords: ['next', 'react', 'ssr'],
    prompt: 'Build me a Next.js app',
  },
  {
    id: 'electron',
    name: 'Electron App',
    description: 'A desktop Electron starter with a web UI.',
    keywords: ['electron', 'desktop', 'app'],
    prompt: 'Build me an Electron app',
  },
  {
    id: 'node-api',
    name: 'Node API',
    description: 'A lightweight Node.js API service starter.',
    keywords: ['node', 'api', 'server'],
    prompt: 'Build me a Node.js API',
  },
  {
    id: 'express',
    name: 'Express API',
    description: 'An Express REST API starter with TypeScript.',
    keywords: ['express', 'api', 'rest'],
    prompt: 'Build me an Express app',
  },
  {
    id: 'python',
    name: 'Python Script',
    description: 'A simple Python project structure with a script entrypoint.',
    keywords: ['python', 'script'],
    prompt: 'Build me a Python app',
  },
  {
    id: 'flask',
    name: 'Flask App',
    description: 'A Flask web app starter with routing and templates.',
    keywords: ['flask', 'python', 'web'],
    prompt: 'Build me a Flask app',
  },
  {
    id: 'discord-bot',
    name: 'Discord Bot',
    description: 'A Discord bot starter using Discord.js.',
    keywords: ['discord', 'bot', 'chatbot'],
    prompt: 'Build me a Discord bot',
  },
  {
    id: 'telegram-bot',
    name: 'Telegram Bot',
    description: 'A Telegram bot starter using telegraf.',
    keywords: ['telegram', 'bot', 'chatbot'],
    prompt: 'Build me a Telegram bot',
  },
  {
    id: 'saas-starter',
    name: 'SaaS Dashboard',
    description: 'A SaaS dashboard starter with auth-ready conventions.',
    keywords: ['saas', 'dashboard', 'admin'],
    prompt: 'Build me a SaaS dashboard',
  },
  {
    id: 'ai-app-starter',
    name: 'AI App Starter',
    description: 'A starter for AI-enhanced web apps and assistants.',
    keywords: ['ai', 'assistant', 'app'],
    prompt: 'Build me an AI app starter',
  },
]

async function writeFiles(root: string, files: Record<string, string>) {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const target = path.join(root, relativePath)
      await fsPromises.mkdir(path.dirname(target), { recursive: true })
      await fsPromises.writeFile(target, content, 'utf-8')
    }),
  )
}

function safeProjectFolder(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function createPackageJson(root: string, json: Record<string, unknown>) {
  await writeFiles(root, {
    'package.json': JSON.stringify(json, null, 2),
  })
}

async function createReactTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@types/react': '^18.2.58',
      '@types/react-dom': '^18.2.19',
      '@vitejs/plugin-react': '^4.2.1',
      typescript: '^5.3.3',
      vite: '^5.1.3',
    },
  })

  await writeFiles(root, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['DOM', 'ES2020'],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
      },
      include: ['src'],
      references: [{ path: './tsconfig.node.json' }],
    }, null, 2),
    'tsconfig.node.json': JSON.stringify({
      compilerOptions: {
        rootDir: '.',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        allowSyntheticDefaultImports: true,
      },
    }, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
    'src/App.tsx': `export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">${projectName}</h1>
        <p className="text-slate-300">A React starter created by NEXA IDE.</p>
      </div>
    </main>
  )
}
`,
    'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #020617;
  color: #e2e8f0;
}
`,
  })
}

async function createNextTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    },
    dependencies: {
      next: '^14.2.5',
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@types/node': '^20.11.17',
      '@types/react': '^18.2.58',
      '@types/react-dom': '^18.2.19',
      typescript: '^5.3.3',
    },
  })
  await writeFiles(root, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        lib: ['DOM', 'DOM.Iterable', 'ES2020'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
      exclude: ['node_modules'],
    }, null, 2),
    'next-env.d.ts': `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`,
    'next.config.mjs': `/** @type {import('next').NextConfig} */\nexport default {\n  reactStrictMode: true,\n}\n`,
    'app/page.tsx': `export default function Home() {\n  return (\n    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">\n      <div className="text-center">\n        <h1 className="text-4xl font-bold mb-4">${projectName}</h1>\n        <p className="text-slate-300">Generated by NEXA IDE.</p>\n      </div>\n    </main>\n  )\n}\n`,
    'app/layout.tsx': `import './globals.css'\nexport const metadata = { title: '${projectName}', description: 'Generated by NEXA IDE' }\nexport default function RootLayout({ children }) {\n  return <html lang="en"><body>{children}</body></html>\n}\n`,
    'app/globals.css': `* { box-sizing: border-box; }\nhtml, body { margin: 0; min-height: 100%; font-family: ui-sans-serif, system-ui, sans-serif; background: #020617; color: #f8fafc; }\n`,
  })
}

async function createElectronTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    main: 'electron/main.js',
    type: 'module',
    scripts: {
      dev: 'electron .',
      build: 'electron-builder',
    },
    dependencies: {
      electron: '^29.1.0',
    },
    devDependencies: {
      'electron-builder': '^24.9.4',
    },
  })
  await writeFiles(root, {
    'electron/main.js': `import { app, BrowserWindow } from 'electron'\nimport path from 'node:path'\n\nfunction createWindow() {\n  const win = new BrowserWindow({ width: 1024, height: 720, webPreferences: { preload: path.join(__dirname, 'preload.js') } })\n  win.loadFile(path.join(__dirname, '../index.html'))\n}\n\napp.on('ready', createWindow)\n`,
    'electron/preload.js': `import { contextBridge } from 'electron'\ncontextBridge.exposeInMainWorld('electron', { ping: () => 'pong' })\n`,
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root">Electron app generated by NEXA IDE</div>\n    <script type="module">document.body.style.background = '#020617'; document.body.style.color='#f8fafc';</script>\n  </body>\n</html>\n`,
  })
}

async function createNodeApiTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      start: 'node src/index.js',
    },
    dependencies: {},
  })
  await writeFiles(root, {
    'src/index.js': `import http from 'node:http'\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' })\n  res.end(JSON.stringify({ message: 'Hello from ${projectName} API' }))\n})\n\nserver.listen(3000, () => {\n  console.log('API running on http://localhost:3000')\n})\n`,
    'README.md': `# ${projectName}\n\nA Node.js API created by NEXA IDE. Run with:\n\n	npm install\n	npm start\n`,
  })
}

async function createExpressTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      dev: 'node src/index.js',
    },
    dependencies: {
      express: '^4.18.2',
    },
  })
  await writeFiles(root, {
    'src/index.js': `import express from 'express'\n\nconst app = express()\nconst port = process.env.PORT || 3000\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello from ${projectName} Express API' })\n})\n\napp.listen(port, () => {\n  console.log('Express server running at http://localhost:' + port)\n})\n`,
    'README.md': `# ${projectName}\n\nA TypeScript-ready Express API created by NEXA IDE. Run with:\n\n	npm install\n	npm run dev\n`,
  })
}

async function createPythonTemplate(root: string, projectName: string) {
  await writeFiles(root, {
    'requirements.txt': ``,
    'main.py': `def main():\n    print('Hello from ${projectName}!')\n\nif __name__ == '__main__':\n    main()\n`,
    'README.md': `# ${projectName}\n\nA Python starter created by NEXA IDE. Run with:\n\n	python main.py\n`,
  })
}

async function createFlaskTemplate(root: string, projectName: string) {
  await writeFiles(root, {
    'requirements.txt': `Flask>=2.0`,
    'app.py': `from flask import Flask, jsonify\n\napp = Flask(__name__)\n\n@app.route('/')\ndef index():\n    return jsonify({ 'message': 'Hello from ${projectName} Flask app' })\n\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=5000, debug=True)\n`,
    'README.md': `# ${projectName}\n\nA Flask starter created by NEXA IDE. Run with:\n\n	pip install -r requirements.txt\n	python app.py\n`,
  })
}

async function createDiscordBotTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      start: 'node src/bot.js',
    },
    dependencies: {
      'discord.js': '^14.13.0',
    },
  })
  await writeFiles(root, {
    'src/bot.js': `import { Client, GatewayIntentBits } from 'discord.js'\nconst client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })\n\nclient.once('ready', () => {\n  console.log('Discord bot logged in as ' + client.user?.tag)\n})\n\nclient.on('messageCreate', (message) => {\n  if (message.author.bot) return\n  if (message.content.toLowerCase().includes('hello')) {\n    message.reply('Hello from ${projectName}!')\n  }\n})\n\nclient.login(process.env.DISCORD_TOKEN)\n`,
    '.env.example': 'DISCORD_TOKEN=your-token-here\n',
  })
}

async function createTelegramBotTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      start: 'node src/bot.js',
    },
    dependencies: {
      telegraf: '^4.12.2',
    },
  })
  await writeFiles(root, {
    'src/bot.js': `import { Telegraf } from 'telegraf'\nconst bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)\n\nbot.start((ctx) => ctx.reply('Welcome to ${projectName}!'))\nbot.on('text', (ctx) => ctx.reply('Got your message: ' + ctx.message.text))\n\nbot.launch().then(() => {\n  console.log('Telegram bot is running')\n})\n`,
    '.env.example': 'TELEGRAM_BOT_TOKEN=your-token-here\n',
  })
}

async function createSaasStarterTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'tailwindcss': '^3.4.1',
    },
    devDependencies: {
      '@types/react': '^18.2.58',
      '@types/react-dom': '^18.2.19',
      '@vitejs/plugin-react': '^4.2.1',
      typescript: '^5.3.3',
      vite: '^5.1.3',
      autoprefixer: '^10.4.17',
      postcss: '^8.4.35',
    },
  })
  await writeFiles(root, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['DOM', 'ES2020'],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
      },
      include: ['src'],
    }, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`,
    'postcss.config.js': `export default { plugins: { tailwindcss: {}, autoprefixer: {}, }, }\n`,
    'tailwind.config.js': `export default { content: ['./index.html', './src/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [], }\n`,
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body class="bg-slate-950">\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    'src/main.tsx': `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)\n`,
    'src/App.tsx': `export default function App() {\n  return (\n    <main className="min-h-screen bg-slate-950 text-white p-8">\n      <div className="mx-auto max-w-4xl">\n        <header className="mb-10">\n          <p className="text-sm uppercase tracking-[0.3em] text-sky-400">SaaS dashboard</p>\n          <h1 className="mt-4 text-4xl font-bold">${projectName}</h1>\n          <p className="mt-3 text-slate-300">A starter dashboard generated by NEXA IDE.</p>\n        </header>\n        <section className="grid gap-4 md:grid-cols-2">\n          <div className="rounded-3xl bg-slate-900 p-6 shadow-xl">\n            <h2 className="text-xl font-semibold mb-3">Analytics</h2>\n            <p className="text-slate-400">Track customer metrics, revenue, and product usage.</p>\n          </div>\n          <div className="rounded-3xl bg-slate-900 p-6 shadow-xl">\n            <h2 className="text-xl font-semibold mb-3">Team</h2>\n            <p className="text-slate-400">Invite teammates, manage roles, and collaborate in one place.</p>\n          </div>\n        </section>\n      </div>\n    </main>\n  )\n}\n`,
    'src/index.css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;\nbody { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #020617; color: #f8fafc; }\n`,
  })
}

async function createAiAppTemplate(root: string, projectName: string) {
  await createPackageJson(root, {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@types/react': '^18.2.58',
      '@types/react-dom': '^18.2.19',
      '@vitejs/plugin-react': '^4.2.1',
      typescript: '^5.3.3',
      vite: '^5.1.3',
    },
  })
  await writeFiles(root, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['DOM', 'ES2020'],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
      },
      include: ['src'],
    }, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`,
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    'src/main.tsx': `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)\n`,
    'src/App.tsx': `import { useState } from 'react'\n\nexport default function App() {\n  const [prompt, setPrompt] = useState('')\n  const [response, setResponse] = useState('')\n\n  return (\n    <main className="min-h-screen bg-slate-950 text-white p-8">\n      <div className="mx-auto max-w-3xl">\n        <h1 className="text-4xl font-bold mb-4">${projectName}</h1>\n        <p className="mb-8 text-slate-400">A starter AI app with a prompt-driven interface.</p>\n        <textarea\n          className="w-full rounded-3xl border border-slate-700 bg-slate-900 p-4 text-white focus:outline-none"\n          rows={5}\n          placeholder="Ask your AI assistant anything..."\n          value={prompt}\n          onChange={(event) => setPrompt(event.target.value)}\n        />\n        <button\n          className="mt-4 rounded-3xl bg-sky-500 px-6 py-3 font-semibold hover:bg-sky-400"\n          onClick={() => setResponse('You asked: ' + prompt)}\n        >\n          Ask AI\n        </button>\n        {response && (\n          <div className="mt-6 rounded-3xl border border-slate-700 bg-slate-900 p-5">\n            <p className="text-slate-300">AI response:</p>\n            <pre className="mt-2 whitespace-pre-wrap text-white">{response}</pre>\n          </div>\n        )}\n      </div>\n    </main>\n  )\n}\n`,
    'src/index.css': `body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #020617; color: #e2e8f0; }`,
  })
}

export async function listProjectTemplates() {
  return TEMPLATE_CATALOG
}

export function findTemplateByPrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase()
  for (const template of TEMPLATE_CATALOG) {
    if (normalized.includes(template.id) || template.keywords.some((keyword) => normalized.includes(keyword))) {
      return template.id
    }
  }
  if (normalized.includes('dashboard')) return 'saas-starter'
  if (normalized.includes('bot')) {
    if (normalized.includes('discord')) return 'discord-bot'
    if (normalized.includes('telegram')) return 'telegram-bot'
    return 'node-api'
  }
  return 'react'
}

export async function createProject(projectRoot: string, templateId: string, projectName: string) {
  const folderName = safeProjectFolder(projectName || templateId || 'nexus-project') || 'nexus-project'
  const targetPath = path.join(projectRoot, folderName)
  const builder = TEMPLATE_BUILDERS[templateId]
  if (!builder) {
    throw new Error(`Template '${templateId}' is not available.`)
  }
  await fsPromises.mkdir(targetPath, { recursive: true })
  await builder(targetPath, folderName)
  return { path: targetPath }
}

export async function installDependencies(projectPath: string) {
  return new Promise<{ success: boolean; message: string }>((resolve) => {
    const cli = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(cli, ['install'], { cwd: projectPath, shell: false })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.on('close', (code) => {
      const success = code === 0
      resolve({ success, message: success ? 'Dependencies installed successfully.' : `Install failed (code ${code}).\n${output}` })
    })
    child.on('error', (error) => {
      resolve({ success: false, message: `Install error: ${error.message}` })
    })
  })
}

export async function analyzeWorkspace(projectPath: string | null) {
  if (!projectPath) {
    return { rootPath: null, files: [], packageJson: null, dependencies: [], summary: 'No workspace open' }
  }
  const fileList: string[] = []

  const walk = async (dir: string) => {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue
        await walk(entryPath)
      } else if (entry.isFile()) {
        fileList.push(entryPath)
      }
    }
  }

  await walk(projectPath)
  let packageJson = null
  const packagePath = path.join(projectPath, 'package.json')
  try {
    const raw = await fsPromises.readFile(packagePath, 'utf-8')
    packageJson = JSON.parse(raw)
  } catch {
    packageJson = null
  }

  const dependencies = packageJson
    ? Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) })
    : []

  return {
    rootPath: projectPath,
    files: fileList,
    packageJson,
    dependencies,
    summary: `${fileList.length} files, ${dependencies.length} dependencies`,
  }
}

export async function createDeployConfig(projectPath: string, provider: string) {
  const files: Record<string, string> = {}
  provider = provider.toLowerCase()
  if (provider === 'vercel') {
    files['vercel.json'] = JSON.stringify({ version: 2, builds: [{ src: 'package.json', use: '@vercel/static-build' }], routes: [{ src: '/(.*)', dest: '/' }] }, null, 2)
  }
  if (provider === 'netlify') {
    files['netlify.toml'] = `[build]\npublish = "dist"\ncommand = "npm run build"\n[dev]\ncommand = "npm run dev"\n`
  }
  if (provider === 'railway') {
    files['railway.json'] = JSON.stringify({ plugins: [{ name: 'node' }] }, null, 2)
  }
  if (provider === 'docker') {
    files['Dockerfile'] = `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . ./\nCMD ["npm", "start"]\n`
  }
  if (provider === 'electron') {
    files['electron-builder.json'] = JSON.stringify({ appId: `com.${safeProjectFolder(projectPath)}.app`, directories: { output: 'release' }, files: ['**/*'] }, null, 2)
  }

  if (Object.keys(files).length === 0) {
    throw new Error(`Unsupported deploy provider: ${provider}`)
  }

  await writeFiles(projectPath, files)
  return { success: true, created: Object.keys(files) }
}

const TEMPLATE_BUILDERS: Record<string, (root: string, name: string) => Promise<void>> = {
  react: createReactTemplate,
  nextjs: createNextTemplate,
  electron: createElectronTemplate,
  'node-api': createNodeApiTemplate,
  express: createExpressTemplate,
  python: createPythonTemplate,
  flask: createFlaskTemplate,
  'discord-bot': createDiscordBotTemplate,
  'telegram-bot': createTelegramBotTemplate,
  'saas-starter': createSaasStarterTemplate,
  'ai-app-starter': createAiAppTemplate,
}

