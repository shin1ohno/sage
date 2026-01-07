/**
 * Google People Service
 * Requirements: directory-people-search 1, 2, 3
 *
 * Provides Google People API integration for directory search functionality.
 * Searches organization directory for users by name or email.
 */

import { google, people_v1 } from 'googleapis';
import { GoogleOAuthHandler } from '../oauth/google-oauth-handler.js';
import { calendarLogger as peopleLogger } from '../utils/logger.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
import type {
  DirectoryPerson,
  SearchDirectoryPeopleResponse,
} from '../types/google-people-types.js';

/**
 * Error types for People API
 * Requirement: directory-people-search 3.1, 3.2, 3.3
 */
type PeopleApiErrorType =
  | 'API_NOT_ENABLED'
  | 'PERMISSION_DENIED'
  | 'SCOPE_MISSING'
  | 'UNKNOWN';

/**
 * Detect People API error type from error message
 * Requirement: directory-people-search 3.1, 3.2, 3.3
 */
function detectPeopleApiErrorType(error: Error): PeopleApiErrorType {
  const message = error.message.toLowerCase();

  if (message.includes('people api has not been used') || message.includes('api not enabled')) {
    return 'API_NOT_ENABLED';
  }

  if (message.includes('permission_denied') || message.includes('access denied for directory')) {
    return 'PERMISSION_DENIED';
  }

  if (message.includes('insufficient authentication scopes') || message.includes('scope')) {
    return 'SCOPE_MISSING';
  }

  return 'UNKNOWN';
}

/**
 * Get user-friendly error message for People API errors
 * Requirement: directory-people-search 3.1, 3.2, 3.3
 */
function getPeopleApiErrorMessage(errorType: PeopleApiErrorType): string {
  switch (errorType) {
    case 'API_NOT_ENABLED':
      return (
        'People API が有効になっていません。Google Cloud Console で有効化してください: ' +
        'https://console.cloud.google.com/apis/library/people.googleapis.com'
      );

    case 'PERMISSION_DENIED':
      return (
        '組織のディレクトリへのアクセスが拒否されました。' +
        'Google Workspace 管理者にディレクトリ共有の設定を確認してください。'
      );

    case 'SCOPE_MISSING':
      return (
        'People API へのアクセス権限がありません。' +
        'authenticate_google を実行して再認証してください。'
      );

    default:
      return 'ディレクトリ検索中にエラーが発生しました。';
  }
}

/**
 * Google People Service Class
 *
 * Manages directory search operations using Google People API.
 * Follows the same pattern as GoogleCalendarService.
 */
export class GooglePeopleService {
  private oauthHandler: GoogleOAuthHandler;
  private peopleClient: people_v1.People | null = null;

  /**
   * Constructor
   *
   * @param oauthHandler - GoogleOAuthHandler instance for authentication
   */
  constructor(oauthHandler: GoogleOAuthHandler) {
    this.oauthHandler = oauthHandler;
  }

  /**
   * Authenticate and initialize Google People client
   *
   * Calls GoogleOAuthHandler.ensureValidToken() to get a valid access token,
   * then initializes the google.people() client with the OAuth2Client.
   *
   * @throws Error if authentication fails or no stored tokens found
   */
  async authenticate(): Promise<void> {
    try {
      // Get valid access token (refreshes if expired)
      await this.oauthHandler.ensureValidToken();

      // Get stored tokens for OAuth2Client configuration
      const tokens = await this.oauthHandler.getTokens();
      if (!tokens) {
        throw new Error('No stored tokens found after ensureValidToken()');
      }

      // Get OAuth2Client instance
      const oauth2Client = this.oauthHandler.getOAuth2Client(tokens);

      // Initialize Google People API client
      this.peopleClient = google.people({
        version: 'v1',
        auth: oauth2Client,
      });
    } catch (error) {
      throw new Error(
        `Failed to authenticate with Google People API: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if Google People API is available
   *
   * Attempts a simple People API call to verify authentication and API availability.
   * Returns false on error instead of throwing.
   *
   * @returns True if API is available and authenticated, false otherwise
   * Requirement: directory-people-search 3.1, 3.2, 3.3
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Ensure client is authenticated
      if (!this.peopleClient) {
        await this.authenticate();
      }

      // Try a simple API call to verify availability
      // Use people.searchDirectoryPeople with a minimal query
      await this.peopleClient!.people.searchDirectoryPeople({
        query: 'test',
        readMask: 'names',
        sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
        pageSize: 1,
      });

      return true;
    } catch (error) {
      // Log the error for debugging but don't throw
      peopleLogger.debug(
        { err: error instanceof Error ? error : new Error(String(error)) },
        'People API availability check failed'
      );
      return false;
    }
  }

  /**
   * Search directory for people matching the query
   *
   * Uses Google People API's searchDirectoryPeople endpoint to search
   * the organization directory for users by name or email.
   *
   * @param query - Search query (name or email prefix)
   * @param pageSize - Maximum number of results (default: 20, max: 50)
   * @returns Search response with matching people
   * Requirement: directory-people-search 1.1, 1.2, 1.3, 1.4
   */
  async searchDirectoryPeople(
    query: string,
    pageSize: number = 20
  ): Promise<SearchDirectoryPeopleResponse> {
    try {
      // Ensure client is authenticated
      if (!this.peopleClient) {
        await this.authenticate();
      }

      // Validate pageSize
      const validPageSize = Math.min(Math.max(1, pageSize), 50);

      // Execute search with retry for transient errors
      const response = await retryWithBackoff(
        async () => {
          return this.peopleClient!.people.searchDirectoryPeople({
            query,
            readMask: 'names,emailAddresses,organizations,photos',
            sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
            pageSize: validPageSize,
          });
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: isRetryableError,
          onRetry: (error, attempt, nextDelay) => {
            peopleLogger.warn(
              { attempt, nextDelay, err: error },
              'Retrying People API call'
            );
          },
        }
      );

      // Map response to DirectoryPerson array
      const people: DirectoryPerson[] = (response.data.people || []).map((person) => {
        const displayName =
          person.names?.[0]?.displayName || person.emailAddresses?.[0]?.value || 'Unknown';
        const emailAddress = person.emailAddresses?.[0]?.value || '';
        // Convert null to undefined for optional fields
        const organization = person.organizations?.[0]?.department || person.organizations?.[0]?.name || undefined;
        const photoUrl = person.photos?.[0]?.url || undefined;

        return {
          resourceName: person.resourceName || '',
          displayName,
          emailAddress,
          organization,
          photoUrl,
        };
      });

      const totalResults = people.length;

      // Generate appropriate message
      let message: string;
      if (totalResults === 0) {
        message = `"${query}" に一致するユーザーが見つかりませんでした`;
      } else if (totalResults === 1) {
        message = `${totalResults} 名のユーザーが見つかりました`;
      } else {
        message = `${totalResults} 名のユーザーが見つかりました`;
      }

      return {
        success: true,
        people,
        totalResults,
        message,
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorType = detectPeopleApiErrorType(errorObj);
      const userMessage = getPeopleApiErrorMessage(errorType);

      peopleLogger.error(
        { query, errorType, err: errorObj },
        'Directory search failed'
      );

      return {
        success: false,
        people: [],
        totalResults: 0,
        message: userMessage,
      };
    }
  }
}
