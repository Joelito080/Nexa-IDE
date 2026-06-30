type OAuthTokens = {
  access_token?: string
  id_token?: string
  refresh_token?: string
  expires_in?: number
}

export type OAuthUser = {
  uid: string
  displayName?: string
  email?: string
  photoURL?: string
  idToken?: string
  accessToken?: string
}

function dec2hex(dec: number): string {
  return dec.toString(16).padStart(2, '0')
}

function generateCodeVerifier(): string {
  const array = new Uint32Array(56)
  window.crypto.getRandomValues(array)
  return Array.from(array, dec2hex).join('')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return window.crypto.subtle.digest('SHA-256', data)
}

function base64urlencode(a: ArrayBuffer): string {
  let str = ''
  const bytes = new Uint8Array(a)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i])
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function generateCodeChallenge(v: string): Promise<string> {
  const hashed = await sha256(v)
  return base64urlencode(hashed)
}

export async function signInWithGoogleBrowser(): Promise<{ user: OAuthUser | null; tokens?: OAuthTokens }> {
  // eslint-disable-next-line no-console
  console.log('OAuth: starting browser OAuth flow with PKCE')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID environment variable')
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const redirectUri = window.location.origin
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid profile email')
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('prompt', 'select_account')

  // Open the auth popup centered on screen
  const width = 500
  const height = 650
  const left = window.screen.width / 2 - width / 2
  const top = window.screen.height / 2 - height / 2
  
  const popup = window.open(
    authUrl.toString(),
    'Google Auth',
    `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
  )

  if (!popup) {
    throw new Error('popup-blocked')
  }

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        if (!popup || popup.closed) {
          clearInterval(interval)
          reject(new Error('popup-closed-by-user'))
          return
        }

        let href: string | undefined
        try {
          href = popup.location.href
        } catch (e) {
          // Cross-origin exception is expected until redirect page loads
        }

        if (href && href.startsWith(redirectUri)) {
          clearInterval(interval)
          const search = popup.location.search
          popup.close()

          if (!search) {
            reject(new Error('No query parameters returned from Google OAuth'))
            return
          }

          const params = new URLSearchParams(search)
          const code = params.get('code')
          const error = params.get('error')

          if (error) {
            reject(new Error(error))
            return
          }

          if (!code) {
            reject(new Error('Missing authorization code in OAuth response'))
            return
          }

          // Exchange authorization code for tokens
          // eslint-disable-next-line no-console
          console.log('OAuth: exchanging authorization code for tokens')
          const tokenBody = new URLSearchParams({
            code,
            client_id: clientId,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          })

          const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
          if (clientSecret) {
            tokenBody.set('client_secret', clientSecret)
          }

          const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody,
          })

          if (!tokenResp.ok) {
            const tokenErrText = await tokenResp.text()
            reject(new Error(`Token exchange failed: ${tokenErrText}`))
            return
          }

          const tokens: OAuthTokens = await tokenResp.json()

          if (!tokens.id_token || !tokens.access_token) {
            reject(new Error('Missing tokens in token exchange response'))
            return
          }

          // Decode user info from id_token
          const parts = tokens.id_token.split('.')
          if (parts.length < 2) {
            reject(new Error('Invalid token structure'))
            return
          }

          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
          const jsonPayload = decodeURIComponent(
            atob(b64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          )
          const parsed = JSON.parse(jsonPayload)

          const user: OAuthUser = {
            uid: parsed.sub,
            displayName: parsed.name,
            email: parsed.email,
            photoURL: parsed.picture,
            idToken: tokens.id_token,
            accessToken: tokens.access_token,
          }

          localStorage.setItem('oauth_session', JSON.stringify(tokens))
          resolve({ user, tokens })
        }
      } catch (err) {
        clearInterval(interval)
        reject(err)
      }
    }, 500)
  })
}

export async function signInWithGoogle(): Promise<{ user: OAuthUser | null; tokens?: OAuthTokens }> {
  // Check if electronAPI is available
  // @ts-ignore
  if (!window.electronAPI || !window.electronAPI.oauth || typeof window.electronAPI.oauth.signInWithGoogle !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('OAuth: Electron API not available. Falling back to browser-based OAuth flow.')
    return signInWithGoogleBrowser()
  }
  
  // Use the exposed preload API
  let result: { user?: OAuthUser | null; tokens?: OAuthTokens; error?: string } | undefined
  try {
    // @ts-ignore
    result = (await window.electronAPI.oauth.signInWithGoogle()) as { user?: OAuthUser | null; tokens?: OAuthTokens; error?: string }
  } catch (invokeErr) {
    // eslint-disable-next-line no-console
    console.error('OAuth IPC call failed:', invokeErr)
    throw invokeErr
  }
  
  // eslint-disable-next-line no-console
  console.log('OAuth signInWithGoogle result:', result)
  
  if (!result) {
    // eslint-disable-next-line no-console
    console.error('OAuth result is undefined — electronAPI.oauth.signInWithGoogle() returned undefined. Check that Electron preload is loaded and IPC is working.')
    throw new Error('OAuth flow failed — no result from main process')
  }
  
  if (result.error) {
    // eslint-disable-next-line no-console
    console.error('OAuth error from main process:', result.error)
    throw new Error(result.error)
  }
  
  if (!result.user && !result.tokens) {
    // eslint-disable-next-line no-console
    console.error('OAuth result missing user and tokens:', result)
    throw new Error('OAuth flow failed — invalid response structure')
  }
  
  return result as { user: OAuthUser | null; tokens?: OAuthTokens }
}

export async function loadSession(): Promise<OAuthTokens | null> {
  let raw: string | null = null
  // @ts-ignore
  if (window.electronAPI && window.electronAPI.auth) {
    // @ts-ignore
    raw = await window.electronAPI.auth.loadSession()
  } else {
    raw = localStorage.getItem('oauth_session')
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as OAuthTokens
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  // @ts-ignore
  if (window.electronAPI && window.electronAPI.auth) {
    // @ts-ignore
    await window.electronAPI.auth.clearSession()
  } else {
    localStorage.removeItem('oauth_session')
  }
}
