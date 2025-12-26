/**
 * Calendar Event Response Service Tests
 * TDD: Tests for Task 34 - Calendar event response functionality
 * Requirements: 17.1-17.12
 */

import {
  CalendarEventResponseService,
  EventResponseType,
  EventResponseRequest,
  BatchResponseRequest,
} from '../../src/integrations/calendar-event-response.js';

describe('CalendarEventResponseService', () => {
  let service: CalendarEventResponseService;

  beforeEach(() => {
    service = new CalendarEventResponseService();
  });

  describe('Type Definitions', () => {
    // Requirement: 17.2
    it('should define EventResponseType with accept, decline, tentative', () => {
      const types: EventResponseType[] = ['accept', 'decline', 'tentative'];
      expect(types).toContain('accept');
      expect(types).toContain('decline');
      expect(types).toContain('tentative');
    });

    // Requirement: 17.2
    it('should define EventResponseRequest with required fields', () => {
      const request: EventResponseRequest = {
        eventId: 'event-123',
        response: 'decline',
      };
      expect(request.eventId).toBe('event-123');
      expect(request.response).toBe('decline');
    });

    // Requirement: 17.2
    it('should accept optional comment in EventResponseRequest', () => {
      const request: EventResponseRequest = {
        eventId: 'event-123',
        response: 'decline',
        comment: '年末年始休暇のため',
      };
      expect(request.comment).toBe('年末年始休暇のため');
    });
  });

  describe('Calendar Type Detection', () => {
    // Requirement: 17.5
    it('should detect Google Calendar events by ID pattern', async () => {
      const googleEventId = 'abc123_20251230T100000Z@google.com';
      const calendarType = await service.detectCalendarType(googleEventId);
      expect(calendarType).toBe('google');
    });

    // Requirement: 17.6
    it('should detect iCloud events by ID pattern', async () => {
      const icloudEventId = '1234-5678-ABCD-EF01:12345678';
      const calendarType = await service.detectCalendarType(icloudEventId);
      expect(calendarType).toBe('icloud');
    });

    it('should detect Exchange events by ID pattern', async () => {
      const exchangeEventId = 'AAMkAGNjMmI5N2I5';
      const calendarType = await service.detectCalendarType(exchangeEventId);
      expect(calendarType).toBe('exchange');
    });

    it('should default to local for unknown ID patterns', async () => {
      const localEventId = 'local-event-uuid-12345';
      const calendarType = await service.detectCalendarType(localEventId);
      expect(calendarType).toBe('local');
    });
  });

  describe('Event Response Validation', () => {
    // Requirement: 17.7
    it('should check if event can be responded to', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Team Meeting',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: false,
      };
      const canRespond = await service.canRespondToEvent(mockEvent);
      expect(canRespond.canRespond).toBe(true);
    });

    // Requirement: 17.7
    it('should reject response when user is organizer', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'My Meeting',
        isOrganizer: true,
        hasAttendees: true,
        isReadOnly: false,
      };
      const canRespond = await service.canRespondToEvent(mockEvent);
      expect(canRespond.canRespond).toBe(false);
      expect(canRespond.reason).toContain('主催者');
    });

    // Requirement: 17.9
    it('should reject response when event has no attendees', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Personal Appointment',
        isOrganizer: false,
        hasAttendees: false,
        isReadOnly: false,
      };
      const canRespond = await service.canRespondToEvent(mockEvent);
      expect(canRespond.canRespond).toBe(false);
      expect(canRespond.reason).toContain('出席者');
    });

    // Requirement: 17.10
    it('should reject response for read-only calendar', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Team Meeting',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: true,
      };
      const canRespond = await service.canRespondToEvent(mockEvent);
      expect(canRespond.canRespond).toBe(false);
      expect(canRespond.reason).toContain('読み取り専用');
    });
  });

  describe('Single Event Response', () => {
    // Requirement: 17.1
    it('should respond to a single calendar event', async () => {
      const request: EventResponseRequest = {
        eventId: 'event-123',
        response: 'decline',
        comment: '年末年始休暇のため',
      };

      // Mock the EventKit response
      jest.spyOn(service as any, 'respondViaEventKit').mockResolvedValue({
        success: true,
        eventId: 'event-123',
        newStatus: 'declined',
        method: 'eventkit',
      });

      jest.spyOn(service as any, 'fetchEventDetails').mockResolvedValue({
        id: 'event-123',
        title: 'Team Meeting',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: false,
        calendarType: 'local',
      });

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(true);
      expect(result.eventId).toBe('event-123');
    });

    // Requirement: 17.11
    it('should return summary on successful response', async () => {
      const request: EventResponseRequest = {
        eventId: 'event-123',
        response: 'accept',
      };

      jest.spyOn(service as any, 'respondViaEventKit').mockResolvedValue({
        success: true,
        eventId: 'event-123',
        newStatus: 'accepted',
        method: 'eventkit',
      });

      jest.spyOn(service as any, 'fetchEventDetails').mockResolvedValue({
        id: 'event-123',
        title: 'Team Meeting',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: false,
        calendarType: 'local',
      });

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    // Requirement: 17.7
    it('should skip response when user is organizer', async () => {
      const request: EventResponseRequest = {
        eventId: 'organizer-event',
        response: 'decline',
      };

      jest.spyOn(service as any, 'fetchEventDetails').mockResolvedValue({
        id: 'organizer-event',
        title: 'My Meeting',
        isOrganizer: true,
        hasAttendees: true,
        isReadOnly: false,
        calendarType: 'local',
      });

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('主催者');
    });
  });

  describe('Batch Event Response', () => {
    // Requirement: 17.3
    it('should process batch response requests', async () => {
      const request: BatchResponseRequest = {
        eventIds: ['event-1', 'event-2', 'event-3'],
        response: 'decline',
        comment: '休暇中',
      };

      jest.spyOn(service as any, 'fetchEventDetails').mockImplementation((eventId) =>
        Promise.resolve({
          id: eventId as string,
          title: `Meeting ${eventId}`,
          isOrganizer: false,
          hasAttendees: true,
          isReadOnly: false,
          calendarType: 'local',
        })
      );

      jest.spyOn(service as any, 'respondViaEventKit').mockResolvedValue({
        success: true,
        newStatus: 'declined',
        method: 'eventkit',
      });

      const result = await service.respondToEventsBatch(request);
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(3);
    });

    // Requirement: 17.4
    it('should accept eventIds array and response type', async () => {
      const request: BatchResponseRequest = {
        eventIds: ['event-1', 'event-2'],
        response: 'tentative',
      };
      expect(request.eventIds).toHaveLength(2);
      expect(request.response).toBe('tentative');
    });

    // Requirement: 17.12
    it('should return detailed summary for batch operations', async () => {
      const request: BatchResponseRequest = {
        eventIds: ['event-1', 'event-organizer', 'event-personal'],
        response: 'decline',
      };

      jest.spyOn(service as any, 'fetchEventDetails').mockImplementation((eventId) => {
        const id = eventId as string;
        if (id === 'event-organizer') {
          return Promise.resolve({
            id,
            title: 'My Meeting',
            isOrganizer: true,
            hasAttendees: true,
            isReadOnly: false,
            calendarType: 'local',
          });
        }
        if (id === 'event-personal') {
          return Promise.resolve({
            id,
            title: 'Personal Time',
            isOrganizer: false,
            hasAttendees: false,
            isReadOnly: false,
            calendarType: 'local',
          });
        }
        return Promise.resolve({
          id,
          title: 'Team Meeting',
          isOrganizer: false,
          hasAttendees: true,
          isReadOnly: false,
          calendarType: 'local',
        });
      });

      jest.spyOn(service as any, 'respondViaEventKit').mockResolvedValue({
        success: true,
        newStatus: 'declined',
        method: 'eventkit',
      });

      const result = await service.respondToEventsBatch(request);
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.skipped).toBe(2);
      expect(result.details.skipped).toHaveLength(2);
    });
  });

  describe('EventKit Integration', () => {
    // Requirement: 17.6
    it('should respond to iCloud/local events via EventKit', async () => {
      const request: EventResponseRequest = {
        eventId: 'local-event-123',
        response: 'decline',
      };

      jest.spyOn(service as any, 'fetchEventDetails').mockResolvedValue({
        id: 'local-event-123',
        title: 'Local Meeting',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: false,
        calendarType: 'local',
      });

      // Mock the actual EventKit call
      jest.spyOn(service as any, 'respondViaEventKit').mockResolvedValue({
        success: true,
        eventId: 'local-event-123',
        newStatus: 'declined',
        method: 'eventkit',
      });

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(true);
      expect(result.method).toBe('eventkit');
    });

    it('should handle EventKit errors gracefully', async () => {
      const request: EventResponseRequest = {
        eventId: 'error-event',
        response: 'decline',
      };

      jest.spyOn(service as any, 'fetchEventDetails').mockResolvedValue({
        id: 'error-event',
        title: 'Problem Meeting',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: false,
        calendarType: 'local',
      });

      jest.spyOn(service as any, 'respondViaEventKit').mockRejectedValue(
        new Error('EventKit access denied')
      );

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('EventKit');
    });
  });

  describe('Edge Cases', () => {
    // Requirement: 17.8
    it('should handle recurring event single instance', async () => {
      const request: EventResponseRequest = {
        eventId: 'recurring-event:20251230',
        response: 'decline',
      };

      jest.spyOn(service as any, 'fetchEventDetails').mockResolvedValue({
        id: 'recurring-event:20251230',
        title: 'Weekly Standup',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: false,
        calendarType: 'local',
        isRecurringInstance: true,
      });

      jest.spyOn(service as any, 'respondViaEventKit').mockResolvedValue({
        success: true,
        eventId: 'recurring-event:20251230',
        newStatus: 'declined',
        method: 'eventkit',
        instanceOnly: true,
      });

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(true);
      expect(result.instanceOnly).toBe(true);
    });

    it('should handle all-day events', async () => {
      const request: EventResponseRequest = {
        eventId: 'allday-event',
        response: 'decline',
      };

      jest.spyOn(service as any, 'fetchEventDetails').mockResolvedValue({
        id: 'allday-event',
        title: 'Company Holiday',
        isOrganizer: false,
        hasAttendees: true,
        isReadOnly: false,
        calendarType: 'local',
        isAllDay: true,
      });

      jest.spyOn(service as any, 'respondViaEventKit').mockResolvedValue({
        success: true,
        eventId: 'allday-event',
        newStatus: 'declined',
        method: 'eventkit',
      });

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(true);
    });

    it('should handle empty event ID array in batch', async () => {
      const request: BatchResponseRequest = {
        eventIds: [],
        response: 'decline',
      };

      const result = await service.respondToEventsBatch(request);
      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(0);
    });

    it('should validate event ID format', async () => {
      const request: EventResponseRequest = {
        eventId: '',
        response: 'decline',
      };

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('無効なイベントID');
    });

    it('should validate response type', async () => {
      const request: EventResponseRequest = {
        eventId: 'event-123',
        response: 'invalid' as EventResponseType,
      };

      const result = await service.respondToEvent(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('無効な返信タイプ');
    });
  });

  describe('Platform Detection', () => {
    it('should detect macOS platform', async () => {
      const platform = await service.detectPlatform();
      expect(['macos', 'web', 'unknown']).toContain(platform.platform);
    });

    it('should check EventKit availability', async () => {
      const isAvailable = await service.isEventKitAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Response Messages', () => {
    it('should generate Japanese message for decline', () => {
      const message = service.generateResponseMessage('decline', 'Team Meeting');
      expect(message).toContain('辞退');
    });

    it('should generate Japanese message for accept', () => {
      const message = service.generateResponseMessage('accept', 'Team Meeting');
      expect(message).toContain('承諾');
    });

    it('should generate Japanese message for tentative', () => {
      const message = service.generateResponseMessage('tentative', 'Team Meeting');
      expect(message).toContain('仮承諾');
    });
  });
});
