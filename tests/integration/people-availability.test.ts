/**
 * People Availability Integration Tests
 * Requirements: check-others-availability 1, 2, 4
 *
 * End-to-end tests for people availability MCP tools.
 * Tests verify the MCP tool response structure.
 */

import {
  handleCheckPeopleAvailability,
  handleFindCommonAvailability,
} from '../../src/tools/calendar/handlers.js';
import {
  createMockCalendarToolsContext,
  DEFAULT_TEST_CONFIG,
} from '../helpers/index.js';
import type { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import type { GooglePeopleService } from '../../src/integrations/google-people-service.js';

describe('People Availability Integration Tests', () => {
  const createMockGoogleCalendarService = () => ({
    checkPeopleAvailability: jest.fn().mockResolvedValue({
      people: [
        {
          email: 'alice@example.com',
          displayName: 'Alice',
          isAvailable: true,
          busyPeriods: [],
        },
        {
          email: 'bob@example.com',
          displayName: 'Bob',
          isAvailable: false,
          busyPeriods: [
            { start: '2025-01-15T10:00:00+09:00', end: '2025-01-15T11:00:00+09:00' },
          ],
        },
        {
          email: 'restricted@example.com',
          isAvailable: false,
          busyPeriods: [],
          error: 'アクセス権限がありません',
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
          start: '2025-01-15T09:00:00+09:00',
          end: '2025-01-15T10:00:00+09:00',
          durationMinutes: 60,
        },
        {
          start: '2025-01-15T11:00:00+09:00',
          end: '2025-01-15T12:00:00+09:00',
          durationMinutes: 60,
        },
      ],
      participants: [
        { query: 'alice@example.com', email: 'alice@example.com', displayName: 'Alice' },
        { query: 'bob@example.com', email: 'bob@example.com', displayName: 'Bob' },
      ],
      timeRange: {
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T18:00:00+09:00',
      },
    }),
    getPrimaryCalendarEmail: jest.fn().mockResolvedValue('me@example.com'),
    isAvailable: jest.fn().mockResolvedValue(true),
    authenticate: jest.fn().mockResolvedValue(undefined),
  });

  const createMockGooglePeopleService = () => ({
    searchDirectoryPeople: jest.fn().mockResolvedValue({
      success: true,
      people: [
        {
          resourceName: 'people/123',
          displayName: '田中太郎',
          emailAddress: 'tanaka@example.com',
        },
      ],
      totalResults: 1,
    }),
    isAvailable: jest.fn().mockResolvedValue(true),
    authenticate: jest.fn().mockResolvedValue(undefined),
  });

  describe('check_people_availability tool', () => {
    it('should return properly structured MCP response', async () => {
      const mockService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockService as unknown as GoogleCalendarService,
      });

      const result = await handleCheckPeopleAvailability(ctx, {
        emails: ['alice@example.com', 'bob@example.com', 'restricted@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
      });

      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const response = JSON.parse(result.content[0].text);

      // Verify response fields per design.md
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('people');
      expect(response).toHaveProperty('timeRange');
      expect(response).toHaveProperty('summary');
      expect(response).toHaveProperty('message');

      // Verify people array structure
      expect(response.people).toBeInstanceOf(Array);
      expect(response.people.length).toBe(3);

      // Check person structure
      const alice = response.people.find((p: { email: string }) => p.email === 'alice@example.com');
      expect(alice).toHaveProperty('email');
      expect(alice).toHaveProperty('isAvailable', true);
      expect(alice).toHaveProperty('busyPeriods');

      const bob = response.people.find((p: { email: string }) => p.email === 'bob@example.com');
      expect(bob.isAvailable).toBe(false);
      expect(bob.busyPeriods.length).toBeGreaterThan(0);

      const restricted = response.people.find((p: { email: string }) => p.email === 'restricted@example.com');
      expect(restricted).toHaveProperty('error');

      // Verify summary structure
      expect(response.summary).toHaveProperty('total', 3);
      expect(response.summary).toHaveProperty('available', 1);
      expect(response.summary).toHaveProperty('unavailable', 1);
      expect(response.summary).toHaveProperty('errors', 1);

      // Verify time range
      expect(response.timeRange).toHaveProperty('start');
      expect(response.timeRange).toHaveProperty('end');
    });

    it('should return error response for validation failures', async () => {
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
      expect(response).toHaveProperty('error', true);
      expect(response).toHaveProperty('message');
      expect(typeof response.message).toBe('string');
    });
  });

  describe('find_common_availability tool', () => {
    it('should return properly structured MCP response', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['alice@example.com', 'bob@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        minDurationMinutes: 30,
        includeMyCalendar: false,
      });

      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(result.content[0]).toHaveProperty('type', 'text');

      const response = JSON.parse(result.content[0].text);

      // Verify response fields per design.md
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('commonSlots');
      expect(response).toHaveProperty('participants');
      expect(response).toHaveProperty('timeRange');
      expect(response).toHaveProperty('message');

      // Verify commonSlots array structure
      expect(response.commonSlots).toBeInstanceOf(Array);
      if (response.commonSlots.length > 0) {
        const slot = response.commonSlots[0];
        expect(slot).toHaveProperty('start');
        expect(slot).toHaveProperty('end');
        expect(slot).toHaveProperty('durationMinutes');
        expect(typeof slot.durationMinutes).toBe('number');
      }

      // Verify participants array structure
      expect(response.participants).toBeInstanceOf(Array);
      if (response.participants.length > 0) {
        const participant = response.participants[0];
        expect(participant).toHaveProperty('query');
        expect(participant).toHaveProperty('email');
      }
    });

    it('should resolve names to emails via People API', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const mockPeopleService = createMockGooglePeopleService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
        googlePeopleService: mockPeopleService as unknown as GooglePeopleService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['田中', 'alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: false,
      });

      const response = JSON.parse(result.content[0].text);

      // Verify name was resolved
      expect(mockPeopleService.searchDirectoryPeople).toHaveBeenCalledWith('田中', 1);

      // Check participants include resolved info
      const tanaka = response.participants.find(
        (p: { query: string }) => p.query === '田中'
      );
      expect(tanaka).toBeDefined();
      expect(tanaka.email).toBe('tanaka@example.com');
      expect(tanaka.displayName).toBe('田中太郎');

      // Check direct email was kept as-is
      const alice = response.participants.find(
        (p: { query: string }) => p.query === 'alice@example.com'
      );
      expect(alice).toBeDefined();
      expect(alice.email).toBe('alice@example.com');
    });

    it('should handle partial failures gracefully', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const mockPeopleService = {
        ...createMockGooglePeopleService(),
        searchDirectoryPeople: jest.fn()
          .mockResolvedValueOnce({
            success: true,
            people: [{ displayName: '田中', emailAddress: 'tanaka@example.com', resourceName: 'people/1' }],
            totalResults: 1,
          })
          .mockResolvedValueOnce({
            success: true,
            people: [],
            totalResults: 0,
          }),
      };
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
        googlePeopleService: mockPeopleService as unknown as GooglePeopleService,
      });

      const result = await handleFindCommonAvailability(ctx, {
        participants: ['田中', 'unknown_person'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        includeMyCalendar: false,
      });

      const response = JSON.parse(result.content[0].text);

      // Should still succeed with partial results
      expect(response.success).toBe(true);

      // Check tanaka was resolved
      const tanaka = response.participants.find(
        (p: { query: string }) => p.query === '田中'
      );
      expect(tanaka?.email).toBe('tanaka@example.com');

      // Check unknown_person has error
      const unknown = response.participants.find(
        (p: { query: string }) => p.query === 'unknown_person'
      );
      expect(unknown?.error).toBeDefined();
    });

    it('should include user calendar when includeMyCalendar is true by default', async () => {
      const mockCalendarService = createMockGoogleCalendarService();
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        googleCalendarService: mockCalendarService as unknown as GoogleCalendarService,
      });

      await handleFindCommonAvailability(ctx, {
        participants: ['alice@example.com'],
        startTime: '2025-01-15T09:00:00+09:00',
        endTime: '2025-01-15T18:00:00+09:00',
        // includeMyCalendar defaults to true
      });

      // Should have called getPrimaryCalendarEmail
      expect(mockCalendarService.getPrimaryCalendarEmail).toHaveBeenCalled();
    });
  });
});
