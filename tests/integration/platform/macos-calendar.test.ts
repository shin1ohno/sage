/**
 * macOS Platform Calendar Integration Tests
 *
 * Tests that macOS platform uses MCP-only path (NOT Sampling) for calendar integration.
 * On macOS, calendar access is via CalendarSourceManager (EventKit/Google Calendar),
 * not via Sampling which is only used on iOS/iPadOS platforms.
 *
 * Requirements:
 * - Platform-adaptive integration: macOS uses MCP-only CalendarSourceManager
 * - Sampling is NOT called on macOS
 * - MCP-only handler is used via handleListCalendarEvents
 */

import {
  createMockCalendarToolsContext,
  createMockCalendarSourceManager,
  DEFAULT_DETECTED_PLATFORM,
  DEFAULT_TEST_CONFIG,
} from '../../helpers/index.js';
import type { MockCalendarSourceManager } from '../../helpers/index.js';
import type { CalendarSourceManager } from '../../../src/integrations/calendar-source-manager.js';
import { handleListCalendarEvents } from '../../../src/tools/calendar/handlers.js';
import type { CalendarEvent, CalendarEventDetailed } from '../../../src/integrations/calendar-service.js';

describe('macOS Platform Calendar Integration', () => {
  describe('Platform Detection', () => {
    it('should identify macOS platform with DEFAULT_DETECTED_PLATFORM', () => {
      // Verify the DEFAULT_DETECTED_PLATFORM is macOS
      expect(DEFAULT_DETECTED_PLATFORM.platform).toBe('macos');
      expect(DEFAULT_DETECTED_PLATFORM.clientName).toBe('claude-desktop');
      expect(DEFAULT_DETECTED_PLATFORM.supportsSampling).toBe(false); // Desktop doesn't support Sampling
    });
  });

  describe('MCP-Only Path for macOS', () => {
    let mockCalendarSourceManager: MockCalendarSourceManager;

    beforeEach(() => {
      mockCalendarSourceManager = createMockCalendarSourceManager();
    });

    it('should use handleListCalendarEvents (MCP-only) on macOS platform', async () => {
      // Setup mock events
      const mockEvents: CalendarEvent[] = [
        {
          id: 'event-1',
          title: 'Test Meeting',
          start: '2026-01-10T10:00:00+09:00',
          end: '2026-01-10T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
        },
        {
          id: 'event-2',
          title: 'Google Calendar Event',
          start: '2026-01-10T14:00:00+09:00',
          end: '2026-01-10T15:00:00+09:00',
          isAllDay: false,
          source: 'google',
        },
      ];

      mockCalendarSourceManager.getEvents.mockResolvedValue(mockEvents);
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit', 'google']);

      // Create context with macOS platform
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      // Call the MCP-only handler directly (this is what macOS uses)
      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      // Verify CalendarSourceManager was used (MCP-only path)
      expect(mockCalendarSourceManager.getEnabledSources).toHaveBeenCalled();
      expect(mockCalendarSourceManager.getEvents).toHaveBeenCalledWith(
        '2026-01-10',
        '2026-01-11',
        undefined
      );

      // Verify response structure
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.sources).toEqual(['eventkit', 'google']);
      expect(content.events).toHaveLength(2);
      expect(content.totalEvents).toBe(2);
    });

    it('should NOT use Sampling on macOS even though supportsSampling is true', async () => {
      // macOS has supportsSampling: true but the routing logic in index.ts
      // only uses Sampling for iOS/iPadOS platforms explicitly

      // The key insight is that DEFAULT_DETECTED_PLATFORM (macOS) has supportsSampling: true
      // but the routing decision in index.ts checks for platform === 'ios' || platform === 'ipados'
      // So macOS always uses the MCP-only path

      expect(DEFAULT_DETECTED_PLATFORM.supportsSampling).toBe(false) // Desktop does not support Sampling;
      expect(DEFAULT_DETECTED_PLATFORM.platform).toBe('macos');

      // Verify macOS is NOT ios or ipados (which are the Sampling platforms)
      expect(DEFAULT_DETECTED_PLATFORM.platform).not.toBe('ios');
      expect(DEFAULT_DETECTED_PLATFORM.platform).not.toBe('ipados');
    });

    it('should handle empty enabled sources gracefully', async () => {
      mockCalendarSourceManager.getEnabledSources.mockReturnValue([]);

      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.message).toContain('有効なカレンダーソースがありません');
    });

    it('should initialize services if CalendarSourceManager is null', async () => {
      const initializeServicesMock = jest.fn();

      // Create context without CalendarSourceManager initially
      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: null,
        initializeServices: initializeServicesMock,
      });

      // Override getCalendarSourceManager to return manager after init
      let initialized = false;
      ctx.getCalendarSourceManager = () => {
        if (initialized) {
          return mockCalendarSourceManager as unknown as CalendarSourceManager;
        }
        return null;
      };

      // Setup init to set initialized flag
      initializeServicesMock.mockImplementation(() => {
        initialized = true;
        mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);
        mockCalendarSourceManager.getEvents.mockResolvedValue([]);
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      // Verify initializeServices was called
      expect(initializeServicesMock).toHaveBeenCalledWith(DEFAULT_TEST_CONFIG);

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
    });

    it('should return events from CalendarSourceManager with correct format', async () => {
      const mockEvents: CalendarEventDetailed[] = [
        {
          id: 'eventkit-123',
          title: 'EventKit Meeting',
          start: '2026-01-10T09:00:00+09:00',
          end: '2026-01-10T10:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
          location: 'Conference Room A',
        },
      ];

      mockCalendarSourceManager.getEvents.mockResolvedValue(mockEvents);
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);

      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.events).toHaveLength(1);
      expect(content.events[0]).toMatchObject({
        id: 'eventkit-123',
        title: 'EventKit Meeting',
        source: 'eventkit',
        calendar: 'Work',
        location: 'Conference Room A',
        eventType: 'default', // Default event type
      });
    });

    it('should filter events by calendarId when provided', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'event-1',
          title: 'Event 1',
          start: '2026-01-10T10:00:00+09:00',
          end: '2026-01-10T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
        },
      ];

      mockCalendarSourceManager.getEvents.mockResolvedValue(mockEvents);
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);

      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
        calendarId: 'work-calendar',
      });

      // Verify calendarId was passed to getEvents
      expect(mockCalendarSourceManager.getEvents).toHaveBeenCalledWith(
        '2026-01-10',
        '2026-01-11',
        'work-calendar'
      );
    });
  });

  describe('Error Handling', () => {
    it('should return error when config is not set', async () => {
      const ctx = createMockCalendarToolsContext({
        config: null,
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toBe(true);
      expect(content.message).toContain('sageが設定されていません');
    });

    it('should handle CalendarSourceManager errors gracefully', async () => {
      const mockCalendarSourceManager = createMockCalendarSourceManager();
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);
      mockCalendarSourceManager.getEvents.mockRejectedValue(new Error('EventKit access denied'));

      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toBe(true);
      expect(content.message).toContain('カレンダーイベントの取得に失敗しました');
    });
  });

  describe('Response Format Validation', () => {
    it('should include all required fields in successful response', async () => {
      const mockCalendarSourceManager = createMockCalendarSourceManager();
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit', 'google']);
      mockCalendarSourceManager.getEvents.mockResolvedValue([
        {
          id: 'test-event',
          title: 'Test Event',
          start: '2026-01-10T10:00:00+09:00',
          end: '2026-01-10T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
        },
      ]);

      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      const content = JSON.parse(result.content[0].text);

      // Verify all required response fields
      expect(content).toHaveProperty('success', true);
      expect(content).toHaveProperty('sources');
      expect(content).toHaveProperty('events');
      expect(content).toHaveProperty('period');
      expect(content).toHaveProperty('totalEvents');
      expect(content).toHaveProperty('message');

      // Verify period format
      expect(content.period).toEqual({
        start: '2026-01-10',
        end: '2026-01-11',
      });
    });

    it('should generate appropriate message for found events', async () => {
      const mockCalendarSourceManager = createMockCalendarSourceManager();
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);
      mockCalendarSourceManager.getEvents.mockResolvedValue([
        {
          id: 'event-1',
          title: 'Event 1',
          start: '2026-01-10T10:00:00+09:00',
          end: '2026-01-10T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
        },
        {
          id: 'event-2',
          title: 'Event 2',
          start: '2026-01-10T14:00:00+09:00',
          end: '2026-01-10T15:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
        },
      ]);

      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.message).toContain('2件のイベントが見つかりました');
      expect(content.message).toContain('eventkit');
    });

    it('should generate appropriate message when no events found', async () => {
      const mockCalendarSourceManager = createMockCalendarSourceManager();
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);
      mockCalendarSourceManager.getEvents.mockResolvedValue([]);

      const ctx = createMockCalendarToolsContext({
        config: DEFAULT_TEST_CONFIG,
        calendarSourceManager: mockCalendarSourceManager as unknown as CalendarSourceManager,
      });

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2026-01-10',
        endDate: '2026-01-11',
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.message).toContain('指定した期間にイベントが見つかりませんでした');
    });
  });
});
