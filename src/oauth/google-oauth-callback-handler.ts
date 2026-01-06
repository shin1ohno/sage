/**
 * Google OAuth Callback Handler
 * Requirements: FR-1 (OAuth Callback Endpoint), FR-4 (Token Exchange)
 *
 * Handles HTTP callbacks from Google OAuth for remote server mode.
 * Processes authorization codes, exchanges for tokens, and renders
 * success/error pages to the browser.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { PendingGoogleAuthStore, PendingGoogleAuth } from './pending-google-auth-store.js';
import { GoogleOAuthHandler } from './google-oauth-handler.js';
import { oauthLogger } from '../utils/logger.js';

/**
 * Options for GoogleOAuthCallbackHandler
 */
export interface GoogleOAuthCallbackHandlerOptions {
  pendingAuthStore: PendingGoogleAuthStore;
  googleOAuthHandler: GoogleOAuthHandler;
}

/**
 * Parsed callback parameters
 */
interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

/**
 * Google OAuth Callback Handler
 *
 * Processes OAuth callbacks from Google and exchanges
 * authorization codes for tokens.
 */
export class GoogleOAuthCallbackHandler {
  private readonly pendingAuthStore: PendingGoogleAuthStore;
  private readonly googleOAuthHandler: GoogleOAuthHandler;

  constructor(options: GoogleOAuthCallbackHandlerOptions) {
    this.pendingAuthStore = options.pendingAuthStore;
    this.googleOAuthHandler = options.googleOAuthHandler;
  }

  /**
   * Handle OAuth callback request
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const params = this.parseCallbackParams(req.url || '');

      oauthLogger.info({ state: params.state, hasCode: !!params.code, error: params.error }, 'Processing OAuth callback');

      // Check for OAuth error
      if (params.error) {
        const errorMessage = params.error === 'access_denied'
          ? '認証が拒否されました。'
          : `OAuth エラー: ${params.error}`;
        this.renderErrorPage(res, errorMessage, params.errorDescription);
        return;
      }

      // Validate required parameters
      if (!params.state) {
        this.renderErrorPage(res, '認証セッションが見つかりません。', 'state パラメータがありません。');
        return;
      }

      if (!params.code) {
        this.renderErrorPage(res, '認証コードが見つかりません。', 'code パラメータがありません。');
        return;
      }

      // Find pending session
      const session = this.pendingAuthStore.findByState(params.state);

      if (!session) {
        this.renderErrorPage(
          res,
          '認証セッションが見つかりません。',
          'セッションが期限切れか、無効な state です。再度認証を開始してください。'
        );
        return;
      }

      // Exchange code for tokens
      await this.exchangeCodeForTokens(params.code, session);

      // Remove session after successful exchange
      this.pendingAuthStore.remove(params.state);

      // Render success page
      this.renderSuccessPage(res);

      oauthLogger.info({ state: params.state }, 'OAuth callback completed successfully');
    } catch (error) {
      oauthLogger.error({ err: error }, 'OAuth callback failed');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.renderErrorPage(res, '認証に失敗しました。', errorMessage);
    }
  }

  /**
   * Parse callback parameters from URL
   */
  private parseCallbackParams(urlString: string): CallbackParams {
    try {
      // Handle relative URLs by adding a base
      const url = new URL(urlString, 'http://localhost');
      const searchParams = url.searchParams;

      return {
        code: searchParams.get('code') || undefined,
        state: searchParams.get('state') || undefined,
        error: searchParams.get('error') || undefined,
        errorDescription: searchParams.get('error_description') || undefined,
      };
    } catch (error) {
      oauthLogger.error({ err: error, url: urlString }, 'Failed to parse callback URL');
      return {};
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    code: string,
    session: PendingGoogleAuth
  ): Promise<void> {
    // Use googleapis directly for token exchange since we have the code_verifier
    // stored in the session (GoogleOAuthHandler requires calling getAuthorizationUrl()
    // first to set its internal codeVerifier, which doesn't work for remote mode)
    const { google } = await import('googleapis');

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      session.redirectUri
    );

    const { tokens } = await oauth2Client.getToken({
      code,
      codeVerifier: session.codeVerifier,
    });

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('トークンの取得に失敗しました。access_token または refresh_token がありません。');
    }

    // Store tokens using the GoogleOAuthHandler
    await this.googleOAuthHandler.storeTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
      scope: tokens.scope ? tokens.scope.split(' ') : ['https://www.googleapis.com/auth/calendar'],
    });

    oauthLogger.info('Tokens exchanged and stored successfully');
  }

  /**
   * Render success HTML page
   */
  private renderSuccessPage(res: ServerResponse): void {
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <title>sage - Google Calendar 認証完了</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 400px;
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
    }
    .success-icon {
      width: 80px;
      height: 80px;
      background: #22c55e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .success-icon svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
      fill: none;
    }
    h1 {
      color: #111827;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #6b7280;
      font-size: 16px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>
    <h1>認証が完了しました</h1>
    <p>このウィンドウを閉じて、Claude に戻ってください。</p>
  </div>
</body>
</html>`;

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  }

  /**
   * Render error HTML page
   */
  private renderErrorPage(res: ServerResponse, error: string, detail?: string): void {
    const detailHtml = detail
      ? `<div class="error-detail">${this.escapeHtml(detail)}</div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <title>sage - Google Calendar 認証エラー</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 400px;
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
    }
    .error-icon {
      width: 80px;
      height: 80px;
      background: #ef4444;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .error-icon svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
      fill: none;
    }
    h1 {
      color: #111827;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #6b7280;
      font-size: 16px;
      line-height: 1.5;
      margin-bottom: 16px;
    }
    .error-detail {
      background: #fef2f2;
      color: #991b1b;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      text-align: left;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </div>
    <h1>認証に失敗しました</h1>
    <p>${this.escapeHtml(error)}</p>
    ${detailHtml}
    <p style="margin-top: 16px;">Claude に戻って再試行してください。</p>
  </div>
</body>
</html>`;

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
