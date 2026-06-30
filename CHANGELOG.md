# Changelog â€” NEXA IDE

All notable changes, enhancements, and system releases for NEXA IDE will be documented in this file.

---

## [v1.1.0] â€” 2026-06-27

This release completes the OpenRouter migration and prepares NEXA IDE for public release with a unified AI backend, improved reliability, and polished installer packaging.

### âœ¨ What Changed
* OpenRouter is now the sole AI backend for chat, model selection, and streaming responses.
* The website, onboarding flow, and help text now reflect the OpenRouter-only experience.
* Installer and release packaging were aligned for the 1.1.0 build.

---

## [v1.0.0] â€” 2026-06-23

This is the initial release of NEXA IDE, a premium AI-first development environment featuring deep Git navigation, advanced local backups, session recovery tools, and system diagnostic interfaces.

### ðŸš€ Major Systems Shipped

#### 1. Multi-Provider AI Panel
* Seamless support for **Google Gemini (1.5 Flash, 1.5 Pro, 2.0 Exp)**, **OpenAI (GPT-4o, GPT-4o Mini)**, and local **Ollama** models.
* Dynamic inline prompt interactions: Refactor selection, explain file, or fix errors instantly inside Monaco.
* OpenCode CLI execution support with background terminal control loops.

#### 2. Deep Git Integration & Diff Navigator
* Visual changed files list mapping unstaged, staged, and untracked code changes.
* Chronological Git commit log showing author, date, short hashes, and message details.
* Side-by-side Monaco diff viewer comparing changes between commits or staging files.
* Direct Git branch selectors, branch creations, and detached HEAD warning safety checks.

#### 3. Command Palette & Navigation Finder
* Command Palette (`Ctrl+Shift+P`) supporting fuzzy command searching (stage files, commit, theme adjustments, etc.).
* Quick File Finder (`Ctrl+P`) indexing files in the background.
* Full-Workspace Content Search (`Ctrl+Shift+F`) supporting literal queries, regex parsing, line previews, and click-to-line navigation.

#### 4. Disaster Recovery & Backup Manager
* Real-time cursor coordinates caching and tab history persistence.
* Recovery prompt on app launch, restoring terminal histories, AI chats, and unsaved tabs in case of system crashes.
* Auto-backup generation inside `.nexus/backups/` before any AI-driven code modification.
* Interactive Backup Manager UI enabling restorations and directory purging.

#### 5. Diagnostics Dashboard & Logger
* Real-time charts showing CPU load, V8 heap usage, RAM metrics, and Git workspace status.
* Daily file logging under `.nexus/logs/` capturing main and renderer process exceptions.
* Manual update checker supporting channel management (Stable vs Beta).

---

## âš ï¸ Known Limitations & Workarounds

* **Windows-First Shell Integration**: The integrated terminal is configured to load PowerShell/Cmd by default. Support for WSL (Windows Subsystem for Linux) shells is currently experimental.
* **Concurrent OpenCode Threads**: Running multiple OpenCode CLI scripts concurrently inside the terminal panel can cause input lockups. We recommend letting active executions finish or clicking **Cancel** before spawning new prompts.
* **Large Files Diffing**: Monaco DiffEditor might experience rendering latency when diffing individual source files larger than 10 MB. Consider staging using the Git CLI for very large data dumps.
* **Local Ollama Availability**: Ollama models run locally on your GPU/CPU. Performance depends entirely on host resources. If responses lag, ensure you are running optimized coder models like `qwen2.5-coder:1.5b`.

