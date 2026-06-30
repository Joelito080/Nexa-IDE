import { BrowserWindow } from 'electron'

let splashWindow: BrowserWindow | null = null

export function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 340,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    }
  })

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>NEXA IDE Loading...</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(8, 9, 14, 0.95);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          border: 1px solid rgba(139, 92, 246, 0.2);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(139, 92, 246, 0.15);
          overflow: hidden;
          box-sizing: border-box;
        }
        
        .logo-container {
          position: relative;
          margin-bottom: 20px;
        }
        
        .glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 140px;
          height: 140px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.35) 0%, rgba(139, 92, 246, 0) 70%);
          filter: blur(8px);
          pointer-events: none;
        }
        
        svg {
          width: 84px;
          height: 84px;
          filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.5));
          animation: float 4.5s ease-in-out infinite;
        }
        
        @keyframes float {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-6px) rotate(1deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        
        .title {
          font-size: 26px;
          font-weight: 900;
          letter-spacing: 0.18em;
          margin: 0;
          background: linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #60a5fa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 25px rgba(139, 92, 246, 0.2);
        }
        
        .subtitle {
          font-size: 10px;
          font-weight: 600;
          color: #6b7280;
          margin-top: 8px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        
        .loader {
          margin-top: 32px;
          width: 180px;
          height: 3px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 10px;
          position: relative;
          overflow: hidden;
        }
        
        .loader-bar {
          position: absolute;
          height: 100%;
          background: linear-gradient(90deg, #818cf8, #a78bfa, #60a5fa);
          border-radius: 10px;
          animation: progress 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        
        @keyframes progress {
          0% { left: -100%; width: 40%; }
          50% { left: 0%; width: 70%; }
          100% { left: 100%; width: 40%; }
        }
      </style>
    </head>
    <body>
      <div class="logo-container">
        <div class="glow"></div>
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="50,3 95,26.5 95,73.5 50,97 5,73.5 5,26.5" fill="url(#grad)" />
          <polygon points="50,14 84,33 84,67 50,86 16,67 16,33" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" />
          <text x="50" y="65" text-anchor="middle" font-family="system-ui" font-weight="900" font-size="42" fill="white" letter-spacing="-3">N</text>
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c4b5fd" />
              <stop offset="50%" stop-color="#818cf8" />
              <stop offset="100%" stop-color="#60a5fa" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h1 class="title">NEXA IDE</h1>
      <div class="subtitle">AI-First Development Environment</div>
      <div class="loader">
        <div class="loader-bar"></div>
      </div>
    </body>
    </html>
  `

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  splashWindow.once('ready-to-show', () => {
    splashWindow?.show()
  })

  return splashWindow
}

export function closeSplashWindow(mainWindow: BrowserWindow) {
  if (!splashWindow) return

  let opacity = 1
  const fadeInterval = setInterval(() => {
    if (!splashWindow || splashWindow.isDestroyed()) {
      clearInterval(fadeInterval)
      return
    }
    opacity -= 0.08
    if (opacity <= 0) {
      clearInterval(fadeInterval)
      splashWindow.close()
      splashWindow = null

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    } else {
      splashWindow.setOpacity(opacity)
    }
  }, 16)
}

