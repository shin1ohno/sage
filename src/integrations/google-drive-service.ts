/**
 * Google Drive Service
 *
 * Provides Google Drive API integration for transcript discovery
 * and document content retrieval.
 */

import { google, drive_v3 } from 'googleapis';
import { GoogleOAuthHandler } from '../oauth/google-oauth-handler.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import { retryWithBackoff } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('google-drive');

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export class GoogleDriveService {
  private readonly oauthHandler: GoogleOAuthHandler;
  private driveClient: drive_v3.Drive | null = null;

  constructor(oauthHandler: GoogleOAuthHandler) {
    this.oauthHandler = oauthHandler;
  }

  private async ensureDriveClient(): Promise<drive_v3.Drive> {
    if (this.driveClient) {
      return this.driveClient;
    }

    const tokens = await this.oauthHandler.getTokens();
    if (!tokens) {
      throw new Error('No stored tokens found. Please authenticate with Google first.');
    }

    // Verify drive.readonly scope is present
    const hasDriveScope = tokens.scope.some((s) => s.includes('drive.readonly'));
    if (!hasDriveScope) {
      throw new Error('Google OAuth tokens do not include drive.readonly scope');
    }

    await this.oauthHandler.ensureValidToken();

    const refreshedTokens = await this.oauthHandler.getTokens();
    if (!refreshedTokens) {
      throw new Error('No stored tokens found after ensureValidToken()');
    }

    const oauth2Client = this.oauthHandler.getOAuth2Client(refreshedTokens);

    this.driveClient = google.drive({
      version: 'v3',
      auth: oauth2Client,
    });

    return this.driveClient;
  }

  async findTranscript(event: CalendarEvent): Promise<DriveFile | null> {
    if (!event.conferenceData?.conferenceId) {
      return null;
    }

    const conferenceId = event.conferenceData.conferenceId;
    const eventStart = new Date(event.start);
    // Search from 1 hour before event start
    const searchFrom = new Date(eventStart.getTime() - 60 * 60 * 1000).toISOString();

    // Strategy 1: Search by conferenceId in Google Docs
    const byConference = await this.searchDriveFiles(
      `mimeType='application/vnd.google-apps.document' and fullText contains '${conferenceId}' and modifiedTime > '${searchFrom}'`,
    );

    if (byConference.length > 0) {
      return this.pickLatest(byConference);
    }

    // Strategy 2: Fallback search by event title
    const escapedTitle = event.title.replace(/'/g, "\\'");
    const byTitle = await this.searchDriveFiles(
      `mimeType='application/vnd.google-apps.document' and fullText contains '${escapedTitle}' and modifiedTime > '${searchFrom}'`,
    );

    if (byTitle.length > 0) {
      return this.pickLatest(byTitle);
    }

    return null;
  }

  private pickLatest(files: DriveFile[]): DriveFile {
    return files.sort(
      (a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime(),
    )[0];
  }

  private async searchDriveFiles(query: string): Promise<DriveFile[]> {
    try {
      const drive = await this.ensureDriveClient();

      const result = await retryWithBackoff(
        async () => {
          return await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType, modifiedTime)',
            orderBy: 'modifiedTime desc',
          });
        },
        { maxAttempts: 3, initialDelay: 1000 },
      );

      return (result.data.files || [])
        .filter((f): f is { id: string; name: string; mimeType: string; modifiedTime: string } =>
          Boolean(f.id && f.name && f.mimeType && f.modifiedTime),
        )
        .map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime,
        }));
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  async getFileContent(fileId: string): Promise<string> {
    try {
      const drive = await this.ensureDriveClient();

      const result = await retryWithBackoff(
        async () => {
          return await drive.files.export({
            fileId,
            mimeType: 'text/plain',
          });
        },
        { maxAttempts: 3, initialDelay: 1000 },
      );

      return String(result.data);
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  private handleAuthError(error: unknown): void {
    const errorStr = String(error);
    if (errorStr.includes('401') || errorStr.includes('403')) {
      logger.warn('Drive API authentication error, marking service unavailable');
      this.driveClient = null;
    }
  }
}
