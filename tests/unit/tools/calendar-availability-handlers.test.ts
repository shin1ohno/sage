/**
 * Calendar Availability Handlers Unit Tests
 *
 * Tests for people availability tool handlers using dependency injection
 * via Context objects.
 *
 * Requirements: check-others-availability 1, 2, 4
 */

import {
  handleCheckPeopleAvailability,
  handleFindCommonAvailability,
} from '../../../src/tools/calendar/handlers.js';
import {
  createMockCalendarToolsContext,
  DEFAULT_TEST_CONFIG,
} from '../../helpers/index.js';
import type { GoogleCalendarService } from '../../../src/integrations/google-calendar-service.js';
import type { GooglePeopleService } from '../../../src/integrations/google-people-service.js';

describe('Calendar Availability Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockGoogleCalendarService = (overrides?: Partial<GoogleCalendarService>) => ({
    checkPeopleAvailability: jest.fn().mockResolvedValue({
      people: [
        {
          email: 'alice@example.com',
          isAvailable: true,
          busyPeriods: [],
        },
      ],
      timeRange: {
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T18:00:00+09:00',
      },
    }),
    findCommonAvailability: jest.fn().mockResolvedValue({
      commonSlots: [
        {
          start: '2025-01-15T14:00:00+09:00',
          end: '2025-01-15T15:00:00+09:00',
          durationMinutes: 60,
        },
      ],
      participants: [
        { query: 'alice@example.com', email: 'alice@example.com' },
      ],
      timeRange: {
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T18:00:00+09:00',
      },
    }),
    getPrimaryCalendarEmail: jest.fn().mockResolvedValue('me@example.com'),
    isAvailable: jest.fn().mockResolvedValue(true),
    authenticate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const createMockGooglePeopleService = (overrides?: Partial<GooglePeopleService>) => ({
    searchDirectoryPeople: jest.fn().mockResolvedValue({
      success: true,
      people: [
        {
          resourceName: 'people/123',
          displayName: '田中太郎',
          emailAddress: 'tanaka@example.com',
          organization: 'Engineering',
        },
      ],
      totalResults: 1,
    }),
    isAvailable: jest.fn().mockResolvedValue(true),
    authenticate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  describe('handleCheckPeopleAvailability', () => {
    it('should return error when config is not set', async () => {
      const ctx = createMockCalendarToolsContext({
        config: null,
      });

      const result = await handleCheckPeopleAvailability(ctx, {
        emails: ['alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定されていません');
    });

    it('should return error when emails array is empty', async () => {
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: createMockGoogleCalendarService() as unknown as GoogleCalendarService,
      });

      const result = await handleCheckPeopleAvailability(ctx, {
        emails: [],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('少なくとも1つ');
    });

    it('should return error when more than 20 emails provided', async () => {
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: createMockGoogleCalendarService() as unknown as GoogleCalendarService,
      });

      const emails = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`);
      const result = await handleCheckPeopleAvailability(ctx, {
        emails,
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('20名まで');
    });

    it('should return error when Google Calendar service is not available', async () => {
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: null,
      });

      const result = await handleCheckPeopleAvailability(ctx, {
        emails: ['alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('Google Calendar');
    });

    it('should check people availability successfully', async () => {
      const mockService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockService as unknown as GoogleCalendarService,
      });

      const result = await handleCheckPeopleAvailability(ctx, {
        emails: ['alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.people).toHaveLength(1);
      expect(response.summary.available).toBe(1);
      expect(mockService.checkPeopleAvailability).toHaveBeenCalledWith(
        ['alice@example.com'],
        '2025-01-15T09:00:00+09:00',
        '2025-01-15T18:00:00+09:00'
      );
    });

    it('should include summary with counts', async () => {
      const mockService = createMockGoogleCalendarService({
        checkPeopleAvailability: jest.fn().mockResolvedValue({
          people: [
            { email: 'alice@example.com', isAvailable: true, busyPeriods: [] },
            { email: 'bob@example.com', isAvailable: false, busyPeriods: [{ start: '', end: '' }] },
            { email: 'restricted@example.com', isAvailable: false, busyPeriods: [], error: 'アクセス権限がありません' },
          ],
          timeRange: {
            start: '2025-01-15T09:00:00+09:00',
            end: '2025-01-15T18:00:00+09:00',
          },
        }),
      });
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockService as unknown as GoogleCalendarService,
      });

      const result = await handleCheckPeopleAvailability(ctx, {
        emails: ['alice@example.com', 'bob@example.com', 'restricted@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.total).toBe(3);
      expect(response.summary.available).toBe(1);
      expect(response.summary.unavailable).toBe(1);
      expect(response.summary.errors).toBe(1);
    });
  });

  describe('handleFindCommonAvailability', () => {
    it('should return error when config is not set', async () => {
      const ctx = createMockCalendarToolsContext({
        config: null,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定されていません');
    });

    it('should return error when participants array is empty', async () => {
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: createMockGoogleCalendarService() as unknown as GoogleCalendarService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: [],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('少なくとも1名');
    });

    it('should return error when Google Calendar service is not available', async () => {
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: null,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('Google Calendar');
    });

    it('should find common availability with email addresses', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['alice@example.com', 'bob@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: false,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.commonSlots).toBeDefined();
      expect(mockCalendarService.findCommonAvailability).toHaveBeenCalled();
    });

    it('should resolve names via People API when available', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const mockPeopleService = createMockGooglePeopleService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
        googlePeopleService: mockPeopleService as unknown as GooglePeopleService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['田中'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: false,
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockPeopleService.searchDirectoryPeople).toHaveBeenCalledWith('田中', 1);
      expect(response.participants).toBeDefined();
    });

    it('should handle name resolution failure gracefully', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const mockPeopleService = createMockGooglePeopleService({
        searchDirectoryPeople: jest.fn().mockResolvedValue({
          success: true,
          people: [],
          totalResults: 0,
        }),
      });
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
        googlePeopleService: mockPeopleService as unknown as GooglePeopleService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['unknown_person'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: false,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.participants).toBeDefined();
      const unknownParticipant = response.participants.find(
        (p: { query: string }) => p.query === 'unknown_person'
      );
      expect(unknownParticipant?.error).toContain('見つかりません');
    });

    it('should include user calendar when includeMyCalendar is true', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
      });

      await handleFindCommonAvailability(ctx, {
        participants: ['alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: true,
      });

      expect(mockCalendarService.getPrimaryCalendarEmail).toHaveBeenCalled();
    });

    it('should not duplicate user email when already in participants', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
      });

      await handleFindCommonAvailability(ctx, {
        participants: ['me@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: true,
      });

      // findCommonAvailability should be called with emails array that doesn't duplicate me@example.com
      const findCommonFn = mockCalendarService.findCommonAvailability as jest.Mock;
      const callArgs = findCommonFn.mock.calls[0];
      const emails = callArgs[0];
      const meCount = emails.filter((e: string) => e === 'me@example.com').length;
      expect(meCount).toBe(1);
    });

    it('should return error message when no valid participants', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const mockPeopleService = createMockGooglePeopleService({
        searchDirectoryPeople: jest.fn().mockResolvedValue({
          success: true,
          people: [],
          totalResults: 0,
        }),
      });
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
        googlePeopleService: mockPeopleService as unknown as GooglePeopleService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['unknown1', 'unknown2'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: false,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.message).toContain('有効な参加者が見つかりません');
    });

    it('should show error message when People API unavailable for name lookup', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
        googlePeopleService: null, // No People service
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['田中'], // Name, not email
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: false,
      });
      const response = JSON.parse(result.content[0].text);

      const tanaka = response.participants?.find(
        (p: { query: string }) => p.query === '田中'
      );
      expect(tanaka?.error).toContain('Google認証が必要');
    });
  });
});
