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

export async function signInWithGoogle(): Promise<{ user: OAuthUser | null; tokens?: OAuthTokens }> {
  // Check if electronAPI is available
  // @ts-ignore
  if (!window.electronAPI || !window.electronAPI.oauth || typeof window.electronAPI.oauth.login !== 'function') {
    throw new Error('Google Sign-In is only supported in the Electron desktop application.')
  }
  
  // Use the exposed preload API
  let result: { user?: OAuthUser | null; tokens?: OAuthTokens; error?: string } | undefined
  try {
    // @ts-ignore
    result = (await window.electronAPI.oauth.login()) as { user?: OAuthUser | null; tokens?: OAuthTokens; error?: string }
  } catch (invokeErr) {
    // eslint-disable-next-line no-console
    console.error('OAuth IPC call failed:', invokeErr)
    throw invokeErr
  }
  
  // eslint-disable-next-line no-console
  console.log('OAuth signInWithGoogle: Success')
  
  if (!result) {
    throw new Error('OAuth flow failed — no result from main process')
  }
  
  if (result.error) {
    // eslint-disable-next-line no-console
    console.error('OAuth error from main process:', result.error)
    throw new Error(result.error)
  }
  
  if (!result.user && !result.tokens) {
    // eslint-disable-next-line no-console
    console.error('OAuth result missing user and tokens')
    throw new Error('OAuth flow failed — invalid response structure')
  }
  
  return result as { user: OAuthUser | null; tokens?: OAuthTokens }
}

export async function loadSession(): Promise<OAuthTokens | null> {
  // @ts-ignore
  if (window.electronAPI && window.electronAPI.auth) {
    // @ts-ignore
    const raw = await window.electronAPI.auth.loadSession()
    if (!raw) return null
    try {
      return JSON.parse(raw) as OAuthTokens
    } catch {
      return null
    }
  }
  return null
}

export async function clearSession(): Promise<void> {
  // @ts-ignore
  if (window.electronAPI && window.electronAPI.auth) {
    // @ts-ignore
    await window.electronAPI.auth.clearSession()
  }
}
