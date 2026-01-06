/**
 * authenticate_google Tool Handler
 * Requirements: FR-1 (authenticate_google MCP Tool)
 *
 * Orchestrates the complete Google OAuth flow:
 * - Local mode: Start callback server, open browser, wait for callback
 * - Remote mode: Return authorization URL for user to open manually
 *
 * Mode is determined by GOOGLE_REDIRECT_URI:
 * - Contains 'localhost' or '127.0.0.1' -> Local mode
 * - Otherwise -> Remote mode (server receives callback directly)
 */

import { z } from 'zod';
import { OAuthCallbackServer } from '../../oauth/oauth-callback-server.js';
import { GoogleOAuthHandler, GOOGLE_CALENDAR_SCOPES } from '../../oauth/google-oauth-handler.js';
import { PendingGoogleAuthStore } from '../../oauth/pending-google-auth-store.js';
import { openBrowser } from '../../utils/browser-opener.js';
import { oauthLogger } from '../../utils/logger.js';
import type { OAuthToolsContext } from './index.js';

/**
 * Arguments for authenticate_google tool
 */
export const AuthenticateGoogleArgsSchema = z.object({
  /** Force re-authentication even if tokens exist */
  force: z.boolean().optional().default(false),
  /** Timeout in seconds (default: 300 = 5 minutes) */
  timeout: z.number().optional().default(300),
});

export type AuthenticateGoogleArgs = z.infer<typeof AuthenticateGoogleArgsSchema>;

/**
 * Result from authenticate_google tool
 */
export interface AuthenticateGoogleResult {
  success: boolean;
  message: string;
  alreadyAuthenticated?: boolean;
  expiresAt?: string;
  scopes?: string[];
  authorizationUrl?: string;
  error?: string;
  // Remote mode fields
  state?: string;
  pendingAuth?: boolean;
  expiresIn?: number;
}

/**
 * Singleton instance of PendingGoogleAuthStore for remote mode
 */
let pendingAuthStore: PendingGoogleAuthStore | null = null;

/**
 * Get or create the pending auth store
 */
async function getPendingAuthStore(): Promise<PendingGoogleAuthStore> {
  if (!pendingAuthStore) {
    pendingAuthStore = new PendingGoogleAuthStore();
    await pendingAuthStore.initialize();
  }
  return pendingAuthStore;
}

/**
 * Export the pending auth store for use by HTTP server
 */
export function getSharedPendingAuthStore(): PendingGoogleAuthStore | null {
  return pendingAuthStore;
}

/**
 * Set the shared pending auth store (called by HTTP server)
 */
export function setSharedPendingAuthStore(store: PendingGoogleAuthStore): void {
  pendingAuthStore = store;
}

/**
 * Check if running in remote mode
 *
 * Remote mode is enabled when GOOGLE_REDIRECT_URI is set and
 * does not point to localhost/127.0.0.1.
 */
function isRemoteMode(): boolean {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    return false;
  }

  const lowerUri = redirectUri.toLowerCase();
  return !lowerUri.includes('localhost') && !lowerUri.includes('127.0.0.1');
}

/**
 * Handle authenticate_google tool call
 *
 * Orchestrates the complete OAuth flow for Google Calendar authentication.
 *
 * @param args - Tool arguments
 * @param context - OAuth tools context (unused, handler creates its own handler)
 * @returns Authentication result
 */
export async function handleAuthenticateGoogle(
  args: AuthenticateGoogleArgs,
  _context: OAuthToolsContext
): Promise<AuthenticateGoogleResult> {
  // Validate arguments
  const validatedArgs = AuthenticateGoogleArgsSchema.parse(args);
  const { force, timeout } = validatedArgs;

  // Check environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      message: 'Google OAuth設定が見つかりません。',
      error:
        '環境変数 GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を設定してください。\n' +
        'Google Cloud Console で OAuth クライアントを作成し、認証情報を取得してください。\n' +
        'https://console.cloud.google.com/apis/credentials',
    };
  }

  // Create OAuth handler
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/oauth/callback';
  const oauthHandler = new GoogleOAuthHandler({
    clientId,
    clientSecret,
    redirectUri,
  });

  // Check for existing tokens (unless force is true)
  if (!force) {
    try {
      const existingTokens = await oauthHandler.getTokens();
      if (existingTokens) {
        const isValid = await oauthHandler.validateToken(existingTokens);
        if (isValid) {
          return {
            success: true,
            message: '既に Google Calendar で認証済みです。',
            alreadyAuthenticated: true,
            expiresAt: new Date(existingTokens.expiresAt).toISOString(),
            scopes: existingTokens.scope,
          };
        }
        // Token expired, try to refresh
        try {
          const refreshedTokens = await oauthHandler.refreshAccessToken(existingTokens.refreshToken);
          await oauthHandler.storeTokens(refreshedTokens);
          return {
            success: true,
            message: 'トークンを更新しました。',
            alreadyAuthenticated: true,
            expiresAt: new Date(refreshedTokens.expiresAt).toISOString(),
            scopes: refreshedTokens.scope,
          };
        } catch (refreshError) {
          // Refresh failed, need to re-authenticate
          oauthLogger.info('Token refresh failed, initiating re-authentication');
        }
      }
    } catch (error) {
      // No tokens or error reading tokens, proceed with authentication
      oauthLogger.debug({ error }, 'No existing tokens found');
    }
  }

  // Remote mode: return authorization URL for user to open manually
  if (isRemoteMode()) {
    return handleRemoteModeAuth(oauthHandler, redirectUri);
  }

  // Local mode: Start callback server
  const callbackServer = new OAuthCallbackServer({
    timeout: timeout * 1000, // Convert to milliseconds
  });

  let serverInfo: { port: number; callbackUrl: string };

  try {
    serverInfo = await callbackServer.start();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: 'コールバックサーバーの起動に失敗しました。',
      error: `${errorMessage}\nポートが使用中の可能性があります。他のアプリケーションを終了してから再試行してください。`,
    };
  }

  try {
    // Generate authorization URL with the callback server's URL
    // Update the redirect URI to use the actual callback URL
    const oauthHandlerWithCallback = new GoogleOAuthHandler({
      clientId,
      clientSecret,
      redirectUri: serverInfo.callbackUrl,
    });

    const authorizationUrl = await oauthHandlerWithCallback.getAuthorizationUrl(
      serverInfo.callbackUrl
    );

    oauthLogger.info({ authorizationUrl: authorizationUrl.substring(0, 100) + '...' }, 'Generated authorization URL');

    // Try to open browser
    const browserResult = await openBrowser(authorizationUrl);

    if (!browserResult.success) {
      oauthLogger.warn({ error: browserResult.error }, 'Failed to open browser automatically');
      // Return URL for manual opening
      return {
        success: false,
        message:
          'ブラウザを自動で開けませんでした。以下のURLを手動でブラウザに貼り付けてください。',
        authorizationUrl,
        error: browserResult.error,
      };
    }

    oauthLogger.info('Browser opened, waiting for callback...');

    // Wait for callback
    const callbackResult = await callbackServer.waitForCallback();

    if (!callbackResult.success) {
      return {
        success: false,
        message: '認証がキャンセルされたか、エラーが発生しました。',
        error: `${callbackResult.error}: ${callbackResult.errorDescription}`,
      };
    }

    if (!callbackResult.code) {
      return {
        success: false,
        message: '認証コードを取得できませんでした。',
        error: 'Authorization code was not received',
      };
    }

    // Exchange code for tokens
    oauthLogger.info('Exchanging authorization code for tokens...');

    const tokens = await oauthHandlerWithCallback.exchangeCodeForTokens(
      callbackResult.code,
      serverInfo.callbackUrl
    );

    // Store tokens
    await oauthHandlerWithCallback.storeTokens(tokens);

    oauthLogger.info('OAuth tokens stored successfully');

    return {
      success: true,
      message: 'Google Calendar の認証が完了しました！',
      expiresAt: new Date(tokens.expiresAt).toISOString(),
      scopes: tokens.scope,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    oauthLogger.error({ error }, 'OAuth flow failed');

    return {
      success: false,
      message: '認証フローでエラーが発生しました。',
      error: errorMessage,
    };
  } finally {
    // Always shutdown the server
    await callbackServer.shutdown();
  }
}

/**
 * Handle remote mode authentication
 *
 * In remote mode, we return the authorization URL for the user to open
 * manually in their browser. The server will receive the callback directly.
 */
async function handleRemoteModeAuth(
  _oauthHandler: GoogleOAuthHandler,
  redirectUri: string
): Promise<AuthenticateGoogleResult> {
  try {
    const store = await getPendingAuthStore();

    // Create pending auth session (codeVerifier is stored in the session for later use)
    const { state, codeChallenge } = store.create(redirectUri);

    // Generate authorization URL with PKCE
    const { google } = await import('googleapis');

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_CALENDAR_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
      state,
    } as any);

    oauthLogger.info({ state, redirectUri }, 'Generated remote mode authorization URL');

    return {
      success: true,
      message: '以下のURLをブラウザで開いてGoogle認証を完了してください。',
      authorizationUrl,
      state,
      pendingAuth: true,
      expiresIn: store.getSessionTimeoutSeconds(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    oauthLogger.error({ error }, 'Remote mode auth failed');

    return {
      success: false,
      message: '認証URLの生成に失敗しました。',
      error: errorMessage,
    };
  }
}
