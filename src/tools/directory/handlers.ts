/**
 * Directory Tool Handlers
 *
 * Business logic for directory-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: directory-people-search 1.1, 4.1, 4.2, 4.3
 */

import type { UserConfig } from '../../types/index.js';
import type { GooglePeopleService } from '../../integrations/google-people-service.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';

/**
 * Directory context containing shared state and services
 */
export interface DirectoryToolsContext {
  getConfig: () => UserConfig | null;
  getGooglePeopleService: () => GooglePeopleService | null;
}

// ============================================================
// Input Types
// ============================================================

/**
 * Input for searching directory people
 *
 * @property query - Search query (name or email prefix)
 * @property pageSize - Maximum number of results (default: 20, max: 50)
 */
export interface SearchDirectoryPeopleInput {
  query: string;
  pageSize?: number;
}

// ============================================================
// Handlers
// ============================================================

/**
 * Handle search_directory_people tool
 *
 * Searches the organization directory for people matching the query.
 * Returns matching users with their display names, email addresses, and organization info.
 *
 * Requirement: directory-people-search 1.1, 4.1, 4.2, 4.3
 */
export async function handleSearchDirectoryPeople(
  ctx: DirectoryToolsContext,
  args: SearchDirectoryPeopleInput
) {
  const { query, pageSize } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  // Validate query
  if (!query || query.trim().length === 0) {
    return createToolResponse({
      error: true,
      message: '検索クエリを入力してください。',
    });
  }

  // Check if Google People service is available
  const googlePeopleService = ctx.getGooglePeopleService();
  if (!googlePeopleService) {
    return createToolResponse({
      error: true,
      message:
        'Google Calendarが設定されていません。ディレクトリ検索にはGoogle認証が必要です。' +
        'authenticate_google を実行して認証してください。',
    });
  }

  try {
    const result = await googlePeopleService.searchDirectoryPeople(
      query.trim(),
      pageSize
    );

    if (!result.success) {
      return createToolResponse({
        error: true,
        message: result.message,
      });
    }

    // Format response for display
    // Requirement: directory-people-search 4.1, 4.2
    const formattedPeople = result.people.map((person) => ({
      displayName: person.displayName,
      email: person.emailAddress,
      organization: person.organization || undefined,
      photoUrl: person.photoUrl || undefined,
    }));

    return createToolResponse({
      success: true,
      totalResults: result.totalResults,
      people: formattedPeople,
      message: result.message,
    });
  } catch (error) {
    return createErrorFromCatch('ディレクトリ検索に失敗しました', error);
  }
}
