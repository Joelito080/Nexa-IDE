import { BrowserWindow } from 'electron'
import http from 'node:http'
import { URL } from 'node:url'
import crypto from 'node:crypto'
import { saveAuthSession } from './authStorage'

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function handleGoogleOAuth(): Promise<any> {
  try {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID
    const clientSecret = process.env.VITE_GOOGLE_CLIENT_SECRET
    // eslint-disable-next-line no-console
    console.log('OAuth: Starting flow with clientId:', clientId?.slice(0, 20) + '...')
    
    if (!clientId) {
      const err = 'Missing VITE_GOOGLE_CLIENT_ID environment variable'
      // eslint-disable-next-line no-console
      console.error('OAuth:', err)
      throw new Error(err)
    }

    // PKCE: generate code_verifier and code_challenge
    const codeVerifier = base64url(crypto.randomBytes(64))
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
    // eslint-disable-next-line no-console
    console.log('OAuth: PKCE challenge generated')

    // Start a temporary loopback server to receive the OAuth redirect
    const server = http.createServer()
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.on('error', reject)
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('Failed to start loopback server')
    }

    const port = address.port
    const redirectUri = `http://127.0.0.1:${port}`
    // eslint-disable-next-line no-console
    console.log('OAuth: Loopback server started on', redirectUri)

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', 'openid profile email')
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    authWindow.loadURL(authUrl.toString())
    // eslint-disable-next-line no-console
    console.log('OAuth: Auth window opened')

    const code: string = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close()
        authWindow.close()
        const err = 'OAuth flow timed out'
        // eslint-disable-next-line no-console
        console.error('OAuth:', err)
        reject(new Error(err))
      }, 5 * 60 * 1000)

      server.on('request', (req, res) => {
        try {
          const reqUrl = new URL(req.url ?? '', `http://127.0.0.1:${port}`)
          const receivedCode = reqUrl.searchParams.get('code')
          const error = reqUrl.searchParams.get('error')
          res.writeHead(200, { 'Content-Type': 'text/html' })
          if (receivedCode) {
            // eslint-disable-next-line no-console
            console.log('OAuth: Authorization code received')
            res.end('<html><body><script>window.close()</script>Authentication complete — you can close this window.</body></html>')
            clearTimeout(timeout)
            server.close()
            authWindow.close()
            resolve(receivedCode)
          } else if (error) {
            const errMsg = `OAuth error: ${error}`
            // eslint-disable-next-line no-console
            console.error(errMsg)
            res.end('<html><body>Authentication failed.</body></html>')
            clearTimeout(timeout)
            server.close()
            authWindow.close()
            reject(new Error(errMsg))
          } else {
            res.end('<html><body>Waiting...</body></html>')
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('OAuth: Request handler error:', e)
          clearTimeout(timeout)
          server.close()
          authWindow.close()
          reject(e)
        }
      })
    })

    // Exchange code for tokens
    // eslint-disable-next-line no-console
    console.log('OAuth: Exchanging code for tokens...')
    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })

    if (clientSecret) {
      tokenBody.set('client_secret', clientSecret)
    }

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })

    if (!tokenResp.ok) {
      const t = await tokenResp.text()
      let err = 'Token exchange failed: ' + t
      if (t.includes('client_secret is missing')) {
        err = 'Token exchange failed: client_secret is missing. Set VITE_GOOGLE_CLIENT_SECRET in your .env or use a client configured for PKCE-only auth.'
      }
      // eslint-disable-next-line no-console
      console.error('OAuth:', err)
      throw new Error(err)
    }

    const tokens = await tokenResp.json()
    // eslint-disable-next-line no-console
    console.log('OAuth: Tokens received')

    // Decode id_token to get user info
    let user: any = null
    if (tokens.id_token) {
      const parts = (tokens.id_token as string).split('.')
      if (parts.length >= 2) {
        const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        try {
          const parsed = JSON.parse(payload)
          user = {
            uid: parsed.sub,
            displayName: parsed.name,
            email: parsed.email,
            photoURL: parsed.picture,
            idToken: tokens.id_token,
            accessToken: tokens.access_token,
          }
          // eslint-disable-next-line no-console
          console.log('OAuth: User decoded successfully:', user.email)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('OAuth: Failed to decode id_token:', e)
          user = null
        }
      }
    }

    // Persist tokens securely
    await saveAuthSession(JSON.stringify(tokens))
    // eslint-disable-next-line no-console
    console.log('OAuth: Session saved securely')

    const result = { user, tokens }
    // eslint-disable-next-line no-console
    console.log('OAuth: Success, returning:', { user: result.user ? 'present' : 'null', tokens: 'present' })
    return result
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('OAuth: Unhandled error:', err)
    throw err
  }
}
