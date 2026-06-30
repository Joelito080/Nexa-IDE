# NEXA IDE v1.1.0 Release Notes

**Release date:** June 27, 2026

## Highlights

NEXA IDE v1.1.0 completes the OpenRouter migration and delivers production-ready AI, editor, and reliability features for public release.

---

## OpenRouter Migration

- **Single AI backend:** OpenRouter is now the only AI provider. Ollama and direct Gemini integrations have been removed.
- **Multi-model support:** Access Claude, GPT, DeepSeek, Qwen, Mistral, Llama, and Gemini (via OpenRouter) with one API key.
- **Secure key handling:** `OPENROUTER_API_KEY` loads in the Electron main process only â€” never exposed to the renderer, never logged, never stored in Zustand plaintext.

## Removed: Ollama & Gemini Direct Integration

- Removed `@google/generative-ai` dependency and all Ollama/Gemini provider UI.
- Settings, onboarding, and website branding updated to reflect OpenRouter-only architecture.
- Legacy settings keys (`geminiApiKey`, `ollamaEndpoint`) are stripped on load.

## New Model System

- Dynamic model list fetched from OpenRouter API.
- Model picker in Settings and AI panel with search and favorites.
- Default model configurable during first-run onboarding.

## Slash Commands

- `/fix` â€” Apply AI-suggested fixes to the current file or selection.
- `/explain` â€” Explain selected code or diagnostics.
- `/refactor` â€” Refactor selection with streaming output.
- `/test` â€” Generate test scaffolding for the active file.

## Streaming

- Full IPC streaming from OpenRouter to the Nexus Assistant panel.
- Stop button cancels in-flight requests immediately.
- Token-by-token rendering in Monaco-adjacent chat UI.

## Split View

- Side-by-side editor panes with independent tab groups.
- Drag tabs to split horizontally or vertically.
- Synchronized file tree navigation across panes.

## Autosave

- Dirty buffers flushed every 2 seconds to local recovery store.
- Visual indicator for unsaved vs. autosaved state.

## Crash Recovery

- Session state persisted: open tabs, cursor positions, expanded tree nodes.
- On unclean shutdown, prompt to restore all dirty buffers and workspace layout.

## Performance Improvements

- Faster cold boot via lazy module loading.
- Optimized file tree scan with in-memory read cache and EBUSY/EPERM retry layers.
- Reduced first-token AI latency through connection pooling in main process.

---

## Upgrade Notes

1. Set `OPENROUTER_API_KEY` in `.env` or Settings â†’ AI â†’ OpenRouter.
2. Choose your preferred model (e.g. `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`).
3. Previous Ollama/Gemini settings are ignored; no migration action required.

## Downloads

| Platform | Artifact |
|----------|----------|
| Windows (installer) | `NEXA.IDE.Setup.1.1.0.exe` |
| Windows (portable) | `NEXA.IDE.Setup.1.1.0.exe` |
| macOS | `NEXA.IDE-1.1.0.dmg` |
| Linux | `NEXA.IDE-1.1.0.AppImage` |

Auto-update users receive this release via `latest.yml`.

---

**Full changelog:** See [CHANGELOG.md](./CHANGELOG.md)

