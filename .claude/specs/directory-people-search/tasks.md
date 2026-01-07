# Implementation Plan: Directory People Search

## Task Overview

Google People API を使用した組織ディレクトリ検索機能を実装します。既存の GoogleCalendarService パターンを踏襲し、OAuth スコープの追加、サービスクラスの作成、MCP ツールの登録を行います。

## Steering Document Compliance

- **tech.md**: TypeScript strict mode、googleapis npm、Zod validation、retryWithBackoff パターン
- **structure.md**: `src/integrations/` にサービス、`src/tools/` にハンドラー、`src/types/` に型定義

## Atomic Task Requirements

各タスクは以下の基準を満たします：
- **File Scope**: 1-3 ファイルのみ変更
- **Time Boxing**: 15-30 分で完了可能
- **Single Purpose**: 1 つのテスト可能な成果
- **Specific Files**: 正確なファイルパスを指定

## Tasks

### Phase 1: 型定義とスコープ

- [ ] 1. Create type definitions in src/types/google-people-types.ts
  - File: `src/types/google-people-types.ts` (new)
  - Define `DirectoryPerson` interface with displayName, emailAddress, organization, photoUrl
  - Define `SearchDirectoryPeopleInput` interface with query, pageSize
  - Define `SearchDirectoryPeopleResponse` interface with success, people, totalResults, message
  - Export all types
  - _Requirements: 4.1, 4.2_

- [ ] 2. Add directory.readonly scope to OAuth handler
  - File: `src/oauth/google-oauth-handler.ts` (modify)
  - Add `'https://www.googleapis.com/auth/directory.readonly'` to `GOOGLE_CALENDAR_SCOPES` array
  - _Leverage: existing GOOGLE_CALENDAR_SCOPES constant at line 48-51_
  - _Requirements: 2.1, 2.3_

### Phase 2: サービス実装

- [ ] 3. Create GooglePeopleService class skeleton
  - File: `src/integrations/google-people-service.ts` (new)
  - Import googleapis, GoogleOAuthHandler
  - Create class with constructor accepting GoogleOAuthHandler
  - Add private peopleClient property
  - Add authenticate() method following GoogleCalendarService pattern
  - _Leverage: `src/integrations/google-calendar-service.ts` lines 170-219_
  - _Requirements: 1.1_

- [ ] 4. Implement searchDirectoryPeople method
  - File: `src/integrations/google-people-service.ts` (continue)
  - Add searchDirectoryPeople(query: string, pageSize?: number) method
  - Call people.searchDirectoryPeople with query, readMask, sources
  - Map response to DirectoryPerson[] array
  - Add retryWithBackoff for transient errors
  - _Leverage: `src/utils/retry.ts` retryWithBackoff function_
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 5. Add isAvailable method to GooglePeopleService
  - File: `src/integrations/google-people-service.ts` (continue)
  - Add isAvailable(): Promise<boolean> method
  - Try simple API call to verify authentication
  - Return false on error instead of throwing
  - _Leverage: `src/integrations/google-calendar-service.ts` lines 229-246_
  - _Requirements: 3.1, 3.2, 3.3_

### Phase 3: エラーハンドリング

- [ ] 6. Add error detection and user-friendly messages
  - File: `src/integrations/google-people-service.ts` (continue)
  - Add helper function to detect error type (API not enabled, permission denied, scope missing)
  - Return appropriate error messages with setup instructions
  - Handle "People API has not been used in project" error
  - Handle "PERMISSION_DENIED" for directory access
  - Handle "insufficient authentication scopes" error
  - _Requirements: 3.1, 3.2, 3.3_

### Phase 4: ツールハンドラー

- [ ] 7. Create tool handler for search_directory_people
  - File: `src/tools/directory/handlers.ts` (new)
  - File: `src/tools/directory/index.ts` (new)
  - Create DirectoryToolsContext interface
  - Implement handleSearchDirectoryPeople function
  - Validate input with Zod schema
  - Call GooglePeopleService.searchDirectoryPeople
  - Return formatted response using createToolResponse
  - _Leverage: `src/tools/calendar/handlers.ts` handleSearchRoomAvailability pattern_
  - _Requirements: 1.1, 4.1, 4.2, 4.3_

- [ ] 8. Add Zod validation schema for search input
  - File: `src/config/validation.ts` (modify)
  - Add SearchDirectoryPeopleInputSchema with query (string, min 1), pageSize (number, optional, max 50)
  - Export schema
  - _Leverage: existing validation patterns in validation.ts_
  - _Requirements: 1.1_

### Phase 5: MCP ツール登録

- [ ] 9. Create shared tool definition for search_directory_people
  - File: `src/tools/shared/directory-tools.ts` (new)
  - File: `src/tools/shared/index.ts` (modify)
  - Define searchDirectoryPeopleTool with name, description, inputSchema
  - Export from shared/index.ts
  - _Leverage: `src/tools/shared/room-tools.ts` pattern_
  - _Requirements: 1.1_

- [ ] 10. Register tool in index.ts (local MCP)
  - File: `src/index.ts` (modify)
  - Import handleSearchDirectoryPeople from tools/directory
  - Import searchDirectoryPeopleTool from tools/shared
  - Register tool with server.tool()
  - Add GooglePeopleService to context
  - _Leverage: existing tool registration pattern for search_room_availability_
  - _Requirements: 1.1_

- [ ] 11. Register tool in mcp-handler.ts (remote MCP)
  - File: `src/cli/mcp-handler.ts` (modify)
  - Import handleSearchDirectoryPeople and searchDirectoryPeopleTool
  - Add tool to TOOL_DEFINITIONS array
  - Add handler to handleToolCall switch statement
  - _Leverage: existing pattern for search_room_availability in mcp-handler.ts_
  - _Requirements: 1.1_

### Phase 6: テスト

- [ ] 12. Create unit tests for GooglePeopleService
  - File: `tests/unit/google-people-service.test.ts` (new)
  - Mock googleapis people client
  - Test searchDirectoryPeople with valid query
  - Test searchDirectoryPeople with empty results
  - Test error handling for API not enabled
  - Test error handling for permission denied
  - Test isAvailable method
  - _Leverage: `tests/unit/google-calendar-service.test.ts` patterns_
  - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3_

- [ ] 13. Create unit tests for directory tool handler
  - File: `tests/unit/directory-handlers.test.ts` (new)
  - Mock GooglePeopleService
  - Test handleSearchDirectoryPeople with valid input
  - Test handleSearchDirectoryPeople with invalid input (empty query)
  - Test response format matches requirements
  - _Leverage: `tests/unit/google-calendar-service.test.ts` test patterns_
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 14. Add tool parity test for search_directory_people
  - File: `tests/unit/tool-parity.test.ts` (modify)
  - Add search_directory_people to expected tools list
  - Verify tool is registered in both index.ts and mcp-handler.ts
  - _Leverage: existing tool-parity.test.ts structure_
  - _Requirements: 1.1_

### Phase 7: ドキュメント

- [ ] 15. Add troubleshooting documentation for People API
  - File: `docs/TROUBLESHOOTING.md` (modify)
  - Add section "ディレクトリ検索で結果が返らない"
  - Document People API enable steps
  - Document directory sharing requirements
  - Document re-authentication for new scope
  - _Leverage: existing TROUBLESHOOTING.md structure_
  - _Requirements: 3.1, 3.2, 3.3_
