/**
 * Calendar Handlers Unit Tests - Recurring Events
 *
 * Tests for recurring event functionality in calendar handlers:
 * - Recurrence parameter handling in create handler
 * - UpdateScope parameter handling in update handler
 * - DeleteScope parameter handling in delete handler
 *
 * Requirements: 1.4, 2.4, 4.4, 5.5
 */

import {
  handleCreateCalendarEvent,
  handleUpdateCalendarEvent,
  handleDeleteCalendarEvent,
  CalendarToolsContext,
} from '../../../src/tools/calendar/handlers.js';
import type { UserConfig } from '../../../src/types/index.js';
import type { CalendarSourceManager } from '../../../src/integrations/calendar-source-manager.js';
import type { RecurrenceScope } from '../../../src/types/google-calendar-types.js';

describe('Calendar Handlers - Recurring Events', () => {
  let mockContext: CalendarToolsContext;
  let mockConfig: UserConfig;
  let mockCalendarSourceManager: jest.Mocked<CalendarSourceManager>;
  let mockGoogleCalendarService: {
    createEvent: jest.Mock;
    updateEvent: jest.Mock;
    deleteEvent: jest.Mock;
    getEvent: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      user: { name: 'Test User', role: 'Engineer' },
      calendar: { sources: { google: { enabled: true } } },
    } as UserConfig;

    mockGoogleCalendarService = {
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEvent: jest.fn(),
    };

    mockCalendarSourceManager = {
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEnabledSources: jest.fn().mockReturnValue(['google']),
    } as any;

    mockContext = {
      getConfig: jest.fn().mockReturnValue(mockConfig),
      getCalendarSourceManager: jest.fn().mockReturnValue(mockCalendarSourceManager),
      getGoogleCalendarService: jest.fn().mockReturnValue(mockGoogleCalendarService),
      getCalendarEventResponseService: jest.fn().mockReturnValue(null),
      getWorkingCadenceService: jest.fn().mockReturnValue(null),
      setWorkingCadenceService: jest.fn(),
      initializeServices: jest.fn(),
    };
  });

  describe('handleCreateCalendarEvent - recurrence parameter', () => {
    // Arrange - Act - Assert pattern

    it('should pass recurrence parameter to createEvent when provided', async () => {
      // Arrange
      const mockEvent = {
        id: 'event-123',
        title: 'Weekly Standup',
        start: '2026-01-13T09:00:00+09:00',
        end: '2026-01-13T09:30:00+09:00',
        isAllDay: false,
        source: 'google' as const,
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
      };
      mockCalendarSourceManager.createEvent.mockResolvedValue(mockEvent);

      // Act
      const result = await handleCreateCalendarEvent(mockContext, {
        title: 'Weekly Standup',
        startDate: '2026-01-13T09:00:00+09:00',
        endDate: '2026-01-13T09:30:00+09:00',
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Weekly Standup',
          start: '2026-01-13T09:00:00+09:00',
          end: '2026-01-13T09:30:00+09:00',
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
        }),
        'google' // Forced to Google Calendar for recurrence
      );
    });

    it('should require Google Calendar when recurrence is provided', async () => {
      // Arrange
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);
      mockContext.getGoogleCalendarService = jest.fn().mockReturnValue(null);

      // Act
      const result = await handleCreateCalendarEvent(mockContext, {
        title: 'Weekly Meeting',
        startDate: '2026-01-13T10:00:00+09:00',
        endDate: '2026-01-13T11:00:00+09:00',
        recurrence: ['RRULE:FREQ=WEEKLY'],
      });

      // Assert
      const responseText = result.content[0].text;
      expect(responseText).toContain('error');
      // Should indicate Google Calendar is required
      // (Implementation will add this check)
    });

    it('should handle multiple RRULE strings in recurrence array', async () => {
      // Arrange
      const mockEvent = {
        id: 'event-123',
        title: 'Complex Recurring Event',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE:20260119T100000Z'],
      };
      mockCalendarSourceManager.createEvent.mockResolvedValue(mockEvent);

      // Act
      const result = await handleCreateCalendarEvent(mockContext, {
        title: 'Complex Recurring Event',
        startDate: '2026-01-15T10:00:00+09:00',
        endDate: '2026-01-15T11:00:00+09:00',
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE:20260119T100000Z'],
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Complex Recurring Event',
          start: '2026-01-15T10:00:00+09:00',
          end: '2026-01-15T11:00:00+09:00',
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE:20260119T100000Z'],
        }),
        'google' // Forced to Google Calendar for recurrence
      );
    });
  });

  describe('handleUpdateCalendarEvent - updateScope parameter', () => {
    // Arrange - Act - Assert pattern

    it('should pass updateScope "thisEvent" to updateEvent', async () => {
      // Arrange
      const mockUpdatedEvent = {
        id: 'event-123',
        title: 'Updated Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
      };
      mockGoogleCalendarService.updateEvent.mockResolvedValue(mockUpdatedEvent);

      // Act
      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        title: 'Updated Meeting',
        updateScope: 'thisEvent' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockGoogleCalendarService.updateEvent).toHaveBeenCalledWith(
        'event-123',
        { title: 'Updated Meeting' },
        undefined,
        'thisEvent'
      );
    });

    it('should pass updateScope "thisAndFuture" to updateEvent', async () => {
      // Arrange
      const mockUpdatedEvent = {
        id: 'event-123',
        title: 'Future Updated Meeting',
        start: '2026-01-15T14:00:00+09:00',
        end: '2026-01-15T15:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
      };
      mockGoogleCalendarService.updateEvent.mockResolvedValue(mockUpdatedEvent);

      // Act
      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123_20260115T140000Z',
        startDate: '2026-01-15T15:00:00+09:00',
        endDate: '2026-01-15T16:00:00+09:00',
        updateScope: 'thisAndFuture' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockGoogleCalendarService.updateEvent).toHaveBeenCalledWith(
        'event-123_20260115T140000Z',
        expect.objectContaining({
          start: '2026-01-15T15:00:00+09:00',
          end: '2026-01-15T16:00:00+09:00',
        }),
        undefined,
        'thisAndFuture'
      );
    });

    it('should pass updateScope "allEvents" to updateEvent', async () => {
      // Arrange
      const mockUpdatedEvent = {
        id: 'event-123',
        title: 'All Events Updated',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
      };
      mockGoogleCalendarService.updateEvent.mockResolvedValue(mockUpdatedEvent);

      // Act
      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        location: 'New Location',
        updateScope: 'allEvents' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockGoogleCalendarService.updateEvent).toHaveBeenCalledWith(
        'event-123',
        { location: 'New Location' },
        undefined,
        'allEvents'
      );
    });

    it('should handle updateEvent without updateScope (defaults to service logic)', async () => {
      // Arrange
      const mockUpdatedEvent = {
        id: 'event-123',
        title: 'Updated without scope',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
      };
      mockGoogleCalendarService.updateEvent.mockResolvedValue(mockUpdatedEvent);

      // Act
      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        notes: 'Updated notes',
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockGoogleCalendarService.updateEvent).toHaveBeenCalledWith(
        'event-123',
        { description: 'Updated notes' },
        undefined,
        undefined
      );
    });
  });

  describe('handleDeleteCalendarEvent - deleteScope parameter', () => {
    // Arrange - Act - Assert pattern

    it('should pass deleteScope "thisEvent" to deleteEvent', async () => {
      // Arrange
      mockCalendarSourceManager.deleteEvent.mockResolvedValue(undefined);

      // Act
      const result = await handleDeleteCalendarEvent(mockContext, {
        eventId: 'event-123_20260115T100000Z',
        deleteScope: 'thisEvent' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockCalendarSourceManager.deleteEvent).toHaveBeenCalledWith(
        'event-123_20260115T100000Z',
        undefined,
        'thisEvent'
      );
    });

    it('should pass deleteScope "thisAndFuture" to deleteEvent', async () => {
      // Arrange
      mockCalendarSourceManager.deleteEvent.mockResolvedValue(undefined);

      // Act
      const result = await handleDeleteCalendarEvent(mockContext, {
        eventId: 'event-123_20260115T100000Z',
        source: 'google',
        deleteScope: 'thisAndFuture' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockCalendarSourceManager.deleteEvent).toHaveBeenCalledWith(
        'event-123_20260115T100000Z',
        'google',
        'thisAndFuture'
      );
    });

    it('should pass deleteScope "allEvents" to deleteEvent', async () => {
      // Arrange
      mockCalendarSourceManager.deleteEvent.mockResolvedValue(undefined);

      // Act
      const result = await handleDeleteCalendarEvent(mockContext, {
        eventId: 'event-123',
        deleteScope: 'allEvents' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockCalendarSourceManager.deleteEvent).toHaveBeenCalledWith(
        'event-123',
        undefined,
        'allEvents'
      );
    });

    it('should handle deleteEvent without deleteScope (defaults to service logic)', async () => {
      // Arrange
      mockCalendarSourceManager.deleteEvent.mockResolvedValue(undefined);

      // Act
      const result = await handleDeleteCalendarEvent(mockContext, {
        eventId: 'event-123',
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockCalendarSourceManager.deleteEvent).toHaveBeenCalledWith(
        'event-123',
        undefined,
        undefined
      );
    });

    it('should pass source and deleteScope together correctly', async () => {
      // Arrange
      mockCalendarSourceManager.deleteEvent.mockResolvedValue(undefined);

      // Act
      const result = await handleDeleteCalendarEvent(mockContext, {
        eventId: 'event-123',
        source: 'google',
        deleteScope: 'thisAndFuture' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('success');
      expect(mockCalendarSourceManager.deleteEvent).toHaveBeenCalledWith(
        'event-123',
        'google',
        'thisAndFuture'
      );
    });
  });

  describe('error handling', () => {
    it('should return error when config is not set for update', async () => {
      // Arrange
      mockContext.getConfig = jest.fn().mockReturnValue(null);

      // Act
      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        title: 'New Title',
        updateScope: 'thisEvent' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('設定されていません');
    });

    it('should return error when config is not set for delete', async () => {
      // Arrange
      mockContext.getConfig = jest.fn().mockReturnValue(null);

      // Act
      const result = await handleDeleteCalendarEvent(mockContext, {
        eventId: 'event-123',
        deleteScope: 'allEvents' as RecurrenceScope,
      });

      // Assert
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('設定されていません');
    });
  });
});
