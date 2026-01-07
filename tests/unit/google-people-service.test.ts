/**
 * Google People Service Tests
 * Requirements: directory-people-search 1, 2, 3
 *
 * Unit tests for the GooglePeopleService implementation.
 */

import { GooglePeopleService } from '../../src/integrations/google-people-service.js';
import { GoogleOAuthHandler } from '../../src/oauth/google-oauth-handler.js';

// Mock modules
jest.mock('googleapis', () => ({
  google: {
    people: jest.fn(),
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

jest.mock('../../src/utils/retry.js', () => {
  const actual = jest.requireActual('../../src/utils/retry.js');
  return {
    ...actual,
    retryWithBackoff: jest.fn(async (fn) => fn()),
  };
});

describe('GooglePeopleService', () => {
  let service: GooglePeopleService;
  let mockOAuthHandler: jest.Mocked<GoogleOAuthHandler>;
  let mockPeopleClient: any;
  let mockOAuth2Client: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock OAuth2Client
    mockOAuth2Client = {
      setCredentials: jest.fn(),
      credentials: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expiry_date: Date.now() + 3600 * 1000,
      },
    };

    // Create mock people client
    mockPeopleClient = {
      people: {
        searchDirectoryPeople: jest.fn(),
      },
    };

    // Mock googleapis
    const { google } = require('googleapis');
    google.people.mockReturnValue(mockPeopleClient);
    google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

    // Create mock OAuth handler
    mockOAuthHandler = {
      ensureValidToken: jest.fn().mockResolvedValue('mock-access-token'),
      getTokens: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: ['https://www.googleapis.com/auth/directory.readonly'],
      }),
      getOAuth2Client: jest.fn().mockReturnValue(mockOAuth2Client),
    } as any;

    // Create service instance
    service = new GooglePeopleService(mockOAuthHandler);
  });

  describe('constructor', () => {
    it('should create instance with OAuth handler', () => {
      expect(service).toBeInstanceOf(GooglePeopleService);
    });
  });

  describe('authenticate', () => {
    it('should initialize people client on authentication', async () => {
      const { google } = require('googleapis');

      await service.authenticate();

      expect(mockOAuthHandler.ensureValidToken).toHaveBeenCalled();
      expect(mockOAuthHandler.getTokens).toHaveBeenCalled();
      expect(mockOAuthHandler.getOAuth2Client).toHaveBeenCalled();
      expect(google.people).toHaveBeenCalledWith({
        version: 'v1',
        auth: mockOAuth2Client,
      });
    });

    it('should throw error if no tokens found', async () => {
      mockOAuthHandler.getTokens.mockResolvedValue(null);

      await expect(service.authenticate()).rejects.toThrow(
        'No stored tokens found'
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when API is available', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockResolvedValue({
        data: { people: [] },
      });

      const result = await service.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when API call fails', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockRejectedValue(
        new Error('API error')
      );

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should authenticate if not already authenticated', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockResolvedValue({
        data: { people: [] },
      });

      await service.isAvailable();

      expect(mockOAuthHandler.ensureValidToken).toHaveBeenCalled();
    });
  });

  describe('searchDirectoryPeople', () => {
    const mockPeopleResponse = {
      data: {
        people: [
          {
            resourceName: 'people/123',
            names: [{ displayName: '田中太郎' }],
            emailAddresses: [{ value: 'tanaka@example.com' }],
            organizations: [{ department: 'Engineering' }],
            photos: [{ url: 'https://example.com/photo.jpg' }],
          },
          {
            resourceName: 'people/456',
            names: [{ displayName: '田中花子' }],
            emailAddresses: [{ value: 'hanako.tanaka@example.com' }],
            organizations: [{ name: 'Sales' }],
          },
        ],
      },
    };

    beforeEach(() => {
      mockPeopleClient.people.searchDirectoryPeople.mockResolvedValue(mockPeopleResponse);
    });

    it('should search directory with query', async () => {
      const result = await service.searchDirectoryPeople('田中');

      expect(result.success).toBe(true);
      expect(result.people).toHaveLength(2);
      expect(result.totalResults).toBe(2);
    });

    it('should map response to DirectoryPerson format', async () => {
      const result = await service.searchDirectoryPeople('田中');

      expect(result.people[0]).toEqual({
        resourceName: 'people/123',
        displayName: '田中太郎',
        emailAddress: 'tanaka@example.com',
        organization: 'Engineering',
        photoUrl: 'https://example.com/photo.jpg',
      });
    });

    it('should handle missing optional fields', async () => {
      const result = await service.searchDirectoryPeople('田中');

      // Second person has organization name instead of department, no photo
      expect(result.people[1]).toEqual({
        resourceName: 'people/456',
        displayName: '田中花子',
        emailAddress: 'hanako.tanaka@example.com',
        organization: 'Sales',
        photoUrl: undefined,
      });
    });

    it('should use default pageSize of 20', async () => {
      await service.searchDirectoryPeople('田中');

      expect(mockPeopleClient.people.searchDirectoryPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 20,
        })
      );
    });

    it('should use custom pageSize when provided', async () => {
      await service.searchDirectoryPeople('田中', 10);

      expect(mockPeopleClient.people.searchDirectoryPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 10,
        })
      );
    });

    it('should cap pageSize at 50', async () => {
      await service.searchDirectoryPeople('田中', 100);

      expect(mockPeopleClient.people.searchDirectoryPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 50,
        })
      );
    });

    it('should use correct readMask and sources', async () => {
      await service.searchDirectoryPeople('田中');

      expect(mockPeopleClient.people.searchDirectoryPeople).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '田中',
          readMask: 'names,emailAddresses,organizations,photos',
          sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
        })
      );
    });

    it('should return empty results message when no matches', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockResolvedValue({
        data: { people: [] },
      });

      const result = await service.searchDirectoryPeople('unknown');

      expect(result.success).toBe(true);
      expect(result.people).toHaveLength(0);
      expect(result.totalResults).toBe(0);
      expect(result.message).toContain('unknown');
      expect(result.message).toContain('見つかりませんでした');
    });

    it('should return success message with count when matches found', async () => {
      const result = await service.searchDirectoryPeople('田中');

      expect(result.message).toContain('2');
      expect(result.message).toContain('見つかりました');
    });
  });

  describe('error handling', () => {
    it('should detect API not enabled error', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockRejectedValue(
        new Error('People API has not been used in project')
      );

      const result = await service.searchDirectoryPeople('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('People API');
      expect(result.message).toContain('有効');
    });

    it('should detect permission denied error', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockRejectedValue(
        new Error('PERMISSION_DENIED')
      );

      const result = await service.searchDirectoryPeople('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('アクセスが拒否');
    });

    it('should detect scope missing error', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockRejectedValue(
        new Error('Request had insufficient authentication scopes')
      );

      const result = await service.searchDirectoryPeople('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('authenticate_google');
    });

    it('should handle unknown errors gracefully', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockRejectedValue(
        new Error('Unknown error occurred')
      );

      const result = await service.searchDirectoryPeople('test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('エラーが発生');
    });

    it('should use email as displayName when name is missing', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockResolvedValue({
        data: {
          people: [
            {
              resourceName: 'people/789',
              emailAddresses: [{ value: 'noname@example.com' }],
            },
          ],
        },
      });

      const result = await service.searchDirectoryPeople('noname');

      expect(result.people[0].displayName).toBe('noname@example.com');
    });

    it('should use "Unknown" when both name and email are missing', async () => {
      mockPeopleClient.people.searchDirectoryPeople.mockResolvedValue({
        data: {
          people: [
            {
              resourceName: 'people/000',
            },
          ],
        },
      });

      const result = await service.searchDirectoryPeople('empty');

      expect(result.people[0].displayName).toBe('Unknown');
      expect(result.people[0].emailAddress).toBe('');
    });
  });
});
