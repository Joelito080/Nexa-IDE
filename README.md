# NEXA IDE â€” OpenRouter AI Development Environment (v1.1.0)

NEXA IDE is a high-performance desktop development environment built with Electron, React, TypeScript, and the Monaco editor engine. Designed from the ground up to place agentic AI, Git version control, and responsive workflows directly into your daily workspace, NEXA IDE offers an ultra-modern, glassmorphic developer interface.

---

## ðŸŽ¨ Interface Preview (Screenshots)

*Below are placeholders for the interface elements of NEXA IDE. Update these with your workspace media assets:*

- **Primary Editor & AI Sidebar Panel**
  ![NEXA IDE AI Panel Workspace Layout](file:///d:/Nexa%20IDE/file.png)
  *The core editor layout featuring Monaco side-by-side with the intelligent Gemini/Ollama agentic chat interface.*

- **Git Commit History & Diff Navigator**
  ![NEXA IDE Git Diff Panel Preview](file:///d:/Nexa%20IDE/file.png)
  *Visual diff comparisons comparing active commits and browse staged, unstaged, or untracked changes.*

- **System Diagnostics & Performance Monitor**
  ![NEXA IDE Diagnostics Dashboard View](file:///d:/Nexa%20IDE/file.png)
  *Real-time charts displaying RAM, V8 heap usage, CPU loads, and active connection diagnostics.*

---

## âœ¨ Features List

### ðŸ¤– Intelligent AI Copilot & OpenCode
* **OpenRouter-only AI**: One API key unlocks a broad set of leading models through a unified backend.
* **Refactor & Explain Selection**: Highlight any block of code inside Monaco and instantly explain, document, or refactor it using custom agent prompts.
* **Auto-run OpenCode Engine**: Securely executes background shell commands, handles installation dependencies, and guides project creation.

### ðŸŒ¿ Native Git Operations
* **Chronological Commit Log**: Scroll through previous commits, view detailed hashes, authorship, date, and commit messages.
* **Monaco Diff Engine**: Clicking on a changed file reveals side-by-side comparisons highlighting line additions and deletions.
* **Repository Control**: Support for staging individual/all files, local commits, checking out branches, and warning prompts for detached HEAD states.

### âš¡ Navigation & Palette Systems
* **Command Palette (`Ctrl+Shift+P`)**: Search and execute commands like staging files, changing themes, toggle panels, or launching terminal configurations instantly.
* **Fuzzy File Finder (`Ctrl+P`)**: Fast indexing system scans local folders in the background, matching queries to open files.
* **Global Content Search (`Ctrl+Shift+F`)**: Perform workspace-wide literal or regex searches, view match previews, and click to navigate directly to the correct line in the editor.

### ðŸ›¡ï¸ Backup & Crash Recovery
* **Disaster Recovery**: Restores unsaved changes, terminal logs, cursor coordinates, and active AI conversations if the app crashes or closes unexpectedly.
* **File Backups**: Auto-creates code backups inside `.nexus/backups/` before any AI code change, supporting one-click rollbacks and deletions.

---

## âš™ï¸ AI Provider Setup

### 1. OpenRouter API
1. Navigate to **Settings (Preferences)**.
2. Enter your OpenRouter API key in the **OpenRouter API Key** field.
3. Choose your preferred model and test the connection.
4. The key is securely stored and never exposed to the renderer process.

### 2. OpenCode CLI
* NEXA IDE auto-detects standard OpenCode installations on launch. If you have custom installations, you can configure your path manually under **Settings > Preferences > Advanced Overrides > OpenCode Path Override**.

---

## ðŸŒ¿ Git Integration Overview
NEXA IDE is built to work natively with Git. The **Git Panel** in the sidebar provides:
* **Staged & Unstaged Files**: Color-coded file list of modified, added, or untracked resources.
* **Diff Comparisons**: View changes in Monaco DiffEditor directly inside the workspace before committing.
* **Commit Messages**: Stage all modifications, write a commit message, and submit commits using the input panel.

---

## âŒ¨ï¸ Keyboard Shortcuts Reference

| Command | Key Binding | Category |
|---|---|---|
| **Open Command Palette** | `Ctrl+Shift+P` | General |
| **Quick File Open** | `Ctrl+P` | General |
| **Workspace Text Search** | `Ctrl+Shift+F` | General |
| **Toggle Shortcuts Dialog** | `Ctrl+/` | General |
| **Toggle Sidebar Panel** | `Ctrl+B` | Layout |
| **Toggle AI Chat Sidebar** | `Ctrl+Alt+A` | Layout |
| **Toggle Integrated Terminal** | `Ctrl+` ` | Layout |
| **Create New File** | `Ctrl+N` | Files |
| **Save Active File** | `Ctrl+S` | Files |
| **Close Current Tab** | `Ctrl+W` | Files |
| **Explain selection / Fix File** | `Ctrl+Shift+G` | AI |
| **Refactor selection** | `Ctrl+Alt+F` | AI |

---

## ðŸ”§ Troubleshooting

### OpenRouter Connection Issues
* Verify that your OpenRouter API key is valid and that the selected model is available.
* Check the connection status in **Settings > AI > OpenRouter** and retry the connection test.

### Missing Git Profile Configs
* If commits fail, make sure Git is configured with a username and email. You can configure this globally in your terminal or configure it directly for the active workspace in **Settings > Preferences > Git Profile**.

### Direct File Read/Write Exceptions
* Check daily log outputs in **Settings > About > Open Logs Folder**. Uncaught errors will be logged in `nexus-YYYY-MM-DD.log` files, making it easy to isolate write permissions or path syntax issues.

---

## ðŸ—ºï¸ Future Roadmap

* **v1.1.0**: Live collaboration workspaces, shared terminals, and multi-user chat sessions.
* **v1.2.0**: Native Extension API and Marketplace for customized editor themes and programming language servers.
* **v1.5.0**: Remote Container Development (support for Docker container development environments and remote SSH nodes).
* **v2.0.0**: Autopilot Agent mode (fully autonomous task execution across workspace environments with user-guided guardrails).

