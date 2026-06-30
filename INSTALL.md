# Installation Guide â€” NEXA IDE

This document provides Windows-first installation instructions for NEXA IDE. You can choose to run the precompiled installer, run the portable build, or compile the application directly from source code.

---

## ðŸ› ï¸ Required Dependencies (For All Options)
If you intend to run the precompiled binaries, no special runtime dependencies are required. 

However, if you are setting up the **developer source workspace** to run or pack the IDE yourself, ensure the following are installed:
1. **Node.js**: LTS version (v18.x or v20.x recommended). [Download Node.js](https://nodejs.org/).
2. **Git**: Required for Git panel operations and codebase clones. [Download Git](https://git-scm.com/).
3. **C++ Build Tools (Windows Only)**: Required to compile the native terminal helper (`node-pty`). 
   * Install via PowerShell as Administrator:
     ```powershell
     npm install --global windows-build-tools
     ```
     *Or* install visual Studio Build Tools selecting the "Desktop development with C++" workload.

---

## ðŸš€ Option 1: Windows Setup Installer (Recommended)
This option installs NEXA IDE onto your local machine, creates desktop shortcuts, and registers standard registry shortcuts.

1. Locate the installer executable in the release directory:
   [NEXA IDE Setup 1.1.0.exe](file:///d:/Nexa%20IDE/release/NEXA.IDE.Setup.1.1.0.exe)
2. Double-click the file to launch the setup wizard.
3. Review the installation settings. You can customize the destination path. By default, it installs into:
   `%USERPROFILE%\AppData\Local\Programs\nexa-ide`
4. Choose whether to create a Desktop Shortcut.
5. Click **Install**. Once completed, check the "Launch NEXA IDE" box and click **Finish**.

---

## ðŸ“¦ Option 2: Portable Build
The portable build is self-contained and does not require an installation setup. It is ideal for running from external flash drives or temp folders.

1. Locate the portable binary in the release folder.
2. Copy the binary to any directory of your choice (e.g. `C:\Tools\`).
3. Double-click to run. 
4. *Note*: The portable version will still write user configuration parameters, theme states, and saved workspaces to your user directory at `%APPDATA%\nexa-ide` so they persist across relaunch cycles.

---

## ðŸ’» Option 3: Developer Source Installation
Follow these instructions to clone, configure, run, and compile NEXA IDE from source code on Windows.

### 1. Clone the Codebase
```bash
git clone https://github.com/google-deepmind/nexa-ide.git
cd nexa-ide
```

### 2. Install Packages
Run npm install to retrieve all frontend dependencies, build configurations, and Electron dependencies:
```bash
npm install
```

### 3. Rebuild Native Modules (CRITICAL)
Since NEXA IDE incorporates a native terminal pty library (`node-pty`) to handle interactive terminal shells on Windows, you must compile it specifically for your operating system architecture and Electron runtime:
```bash
npm run rebuild:native
```
*If this fails, ensure you have configured C++ Build Tools as mentioned in the Required Dependencies section.*

### 4. Running in Development Mode
Launch Vite and Electron concurrently:
```bash
npm run dev:electron
```
This runs Vite on port `5174` and attaches Electron directly to the live reload development port.

### 5. Compiling & Packaging Binaries
To build the production app bundle, clean previous builds, and compile the final Installer and Portable builds:
```bash
npm run package:win
```
The output installers will be compiled inside the `release/` folder.

### 6. OpenRouter Setup
Before launching the packaged app, configure `OPENROUTER_API_KEY` in your shell or add it to the app settings once the app is running.

