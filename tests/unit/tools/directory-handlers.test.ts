/**
 * Directory Handlers Unit Tests
 *
 * Tests for directory-related tool handlers using dependency injection
 * via Context objects.
 *
 * Requirements: directory-people-search 1.1, 4.1, 4.2, 4.3
 */

import { handleSearchDirectoryPeople } from '../../../src/tools/directory/handlers.js';
import {
  createMockDirectoryToolsContext,
  DEFAULT_TEST_CONFIG,
} from '../../helpers/index.js';
import type { GooglePeopleService } from '../../../src/integrations/google-people-service.js';

describe('Directory Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSearchDirectoryPeople', () => {
    const createMockGooglePeopleService = (overrides?: Partial<GooglePeopleService>) => ({
      searchDirectoryPeople: jest.fn().mockResolvedValue({
        success: true,
        people: [
          {
            resourceName: 'people/123',
            displayName: '田中太郎',
            emailAddress: 'tanaka@example.com',
            organization: 'Engineering',
            photoUrl: 'https://example.com/photo.jpg',
          },
        ],
        totalResults: 1,
        message: '1 名のユーザーが見つかりました',
      }),
      isAvailable: jest.fn().mockResolvedValue(true),
      authenticate: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });

    it('should return error when config is not set', async () => {
      const ctx = createMockDirectoryToolsContext({
        config: null,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '田中' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定されていません');
    });

    it('should return error when query is empty', async () => {
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: createMockGooglePeopleService() as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('クエリを入力');
    });

    it('should return error when query is whitespace only', async () => {
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: createMockGooglePeopleService() as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '   ' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('クエリを入力');
    });

    it('should return error when Google People service is not available', async () => {
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: null,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '田中' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('Google Calendar');
      expect(response.message).toContain('authenticate_google');
    });

    it('should search directory people successfully', async () => {
      const mockService = createMockGooglePeopleService();
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '田中' });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.totalResults).toBe(1);
      expect(response.people).toHaveLength(1);
      expect(mockService.searchDirectoryPeople).toHaveBeenCalledWith('田中', undefined);
    });

    it('should pass pageSize to service', async () => {
      const mockService = createMockGooglePeopleService();
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      await handleSearchDirectoryPeople(ctx, { query: '田中', pageSize: 10 });

      expect(mockService.searchDirectoryPeople).toHaveBeenCalledWith('田中', 10);
    });

    it('should trim query before searching', async () => {
      const mockService = createMockGooglePeopleService();
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      await handleSearchDirectoryPeople(ctx, { query: '  田中  ' });

      expect(mockService.searchDirectoryPeople).toHaveBeenCalledWith('田中', undefined);
    });

    it('should format response correctly - Requirement 4.1', async () => {
      const mockService = createMockGooglePeopleService();
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '田中' });
      const response = JSON.parse(result.content[0].text);

      expect(response.people[0]).toEqual({
        displayName: '田中太郎',
        email: 'tanaka@example.com',
        organization: 'Engineering',
        photoUrl: 'https://example.com/photo.jpg',
      });
    });

    it('should include totalResults in response - Requirement 4.2', async () => {
      const mockService = createMockGooglePeopleService();
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '田中' });
      const response = JSON.parse(result.content[0].text);

      expect(response.totalResults).toBeDefined();
      expect(typeof response.totalResults).toBe('number');
    });

    it('should return error from service - Requirement 4.3', async () => {
      const mockService = createMockGooglePeopleService({
        searchDirectoryPeople: jest.fn().mockResolvedValue({
          success: false,
          people: [],
          totalResults: 0,
          message: 'People API が有効になっていません',
        }),
      });
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: 'test' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('People API');
    });

    it('should handle empty results', async () => {
      const mockService = createMockGooglePeopleService({
        searchDirectoryPeople: jest.fn().mockResolvedValue({
          success: true,
          people: [],
          totalResults: 0,
          message: '"unknown" に一致するユーザーが見つかりませんでした',
        }),
      });
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: 'unknown' });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.people).toHaveLength(0);
      expect(response.totalResults).toBe(0);
    });

    it('should handle service errors gracefully', async () => {
      const mockService = createMockGooglePeopleService({
        searchDirectoryPeople: jest.fn().mockRejectedValue(new Error('Service error')),
      });
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '田中' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('ディレクトリ検索に失敗');
    });

    it('should omit undefined optional fields in response', async () => {
      const mockService = createMockGooglePeopleService({
        searchDirectoryPeople: jest.fn().mockResolvedValue({
          success: true,
          people: [
            {
              resourceName: 'people/456',
              displayName: '田中花子',
              emailAddress: 'hanako@example.com',
              organization: undefined,
              photoUrl: undefined,
            },
          ],
          totalResults: 1,
          message: '1 名のユーザーが見つかりました',
        }),
      });
      const ctx = createMockDirectoryToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googlePeopleService: mockService as unknown as GooglePeopleService,
      });

      const result = await handleSearchDirectoryPeople(ctx, { query: '花子' });
      const response = JSON.parse(result.content[0].text);

      // undefined fields should not appear in JSON output
      expect(response.people[0].organization).toBeUndefined();
      expect(response.people[0].photoUrl).toBeUndefined();
    });
  });
});
