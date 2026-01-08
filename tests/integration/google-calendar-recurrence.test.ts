/**
 * Google Calendar Recurrence Integration Tests
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1
 *
 * End-to-end integration tests for Google Calendar recurring events.
 * Tests recurring event creation, single instance modification,
 * series split (thisAndFuture), and series deletion with mocked API.
 */

import { GoogleOAuthHandler, GOOGLE_CALENDAR_SCOPES } from '../../src/oauth/google-oauth-handler.js';
import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import type { GoogleOAuthTokens } from '../../src/oauth/google-oauth-handler.js';
import type { GoogleCalendarEvent } from '../../src/types/google-calendar-types.js';
import * as fs from 'fs/promises';
import * as syncFs from 'fs';

// Mock modules
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(),
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

jest.mock('fs/promises');

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

jest.mock('../../src/utils/retry.js', () => {
  const actual = jest.requireActual('../../src/utils/retry.js');
  return {
    ...actual,
    retryWithBackoff: jest.fn(async (fn) => fn()),
  };
});

describe('Google Calendar Recurrence Integration', () => {
  const mockConfig = {
    clientId: 'recurrence-test-client-id',
    clientSecret: 'recurrence-test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const mockEncryptionKey = 'test-recurrence-key-32-chars!!';
  const mockUserId = 'recurrence-test-user';

  let oauthHandler: GoogleOAuthHandler;
  let calendarService: GoogleCalendarService;
  let mockOAuth2Client: any;
  let mockCalendarClient: any;
  let mockFileStore: Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset file store for each test
    mockFileStore = {};

    // Create mock OAuth2Client
    mockOAuth2Client = {
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeToken: jest.fn(),
      credentials: {},
    };

    // Create mock calendar client
    mockCalendarClient = {
      calendarList: {
        list: jest.fn(),
        get: jest.fn(),
      },
      events: {
        list: jest.fn(),
        insert: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        get: jest.fn(),
      },
    };

    // Mock googleapis
    const { google } = require('googleapis');
    google.calendar.mockReturnValue(mockCalendarClient);
    google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

    // Mock fs operations with file store pattern
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockImplementation(async (filePath: string, data: string) => {
      mockFileStore[filePath] = data;
    });
    (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (mockFileStore[filePath]) {
        return mockFileStore[filePath];
      }
      throw new Error('File not found');
    });
    (fs.chmod as jest.Mock).mockResolvedValue(undefined);
    (fs.rename as jest.Mock).mockImplementation(async (oldPath: string, newPath: string) => {
      if (mockFileStore[oldPath]) {
        mockFileStore[newPath] = mockFileStore[oldPath];
        delete mockFileStore[oldPath];
      }
    });
    (syncFs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return filePath in mockFileStore;
    });

    // Create handler and service instances
    oauthHandler = new GoogleOAuthHandler(mockConfig, mockEncryptionKey, mockUserId);
    calendarService = new GoogleCalendarService(oauthHandler, { userId: mockUserId });
  });

  describe('End-to-End Recurring Event Creation', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-recurrence-token',
      refreshToken: 'valid-recurrence-refresh',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      await oauthHandler.storeTokens(validTokens);
      await calendarService.authenticate();
      jest.clearAllMocks();

      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should create daily recurring event with COUNT', async () => {
      // Requirement: 1.1, 1.2
      const recurringEvent = {
        title: 'Daily Standup',
        start: '2026-02-01T09:00:00Z',
        end: '2026-02-01T09:30:00Z',
        recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
      };

      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'recurring-daily-event-123',
        summary: recurringEvent.title,
        start: { dateTime: recurringEvent.start },
        end: { dateTime: recurringEvent.end },
        recurrence: recurringEvent.recurrence,
        iCalUID: 'ical-recurring-123',
        status: 'confirmed',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const createdEvent = await calendarService.createEvent(recurringEvent);

      expect(createdEvent.id).toBe('recurring-daily-event-123');
      expect(createdEvent.recurrence).toEqual(['RRULE:FREQ=DAILY;COUNT=10']);
      expect(createdEvent.recurrenceDescription).toContain('毎日');

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: 'Daily Standup',
            recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
          }),
        })
      );
    });

    it('should create weekly recurring event with BYDAY', async () => {
      // Requirement: 1.1, 1.2, 1.8
      const recurringEvent = {
        title: 'Weekly Team Meeting',
        start: '2026-02-03T14:00:00Z',
        end: '2026-02-03T15:00:00Z',
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20'],
      };

      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'recurring-weekly-event-123',
        summary: recurringEvent.title,
        start: { dateTime: recurringEvent.start },
        end: { dateTime: recurringEvent.end },
        recurrence: recurringEvent.recurrence,
        iCalUID: 'ical-recurring-weekly-123',
        status: 'confirmed',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const createdEvent = await calendarService.createEvent(recurringEvent);

      expect(createdEvent.id).toBe('recurring-weekly-event-123');
      expect(createdEvent.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20']);
      expect(createdEvent.recurrenceDescription).toContain('毎週');
      expect(createdEvent.recurrenceDescription).toMatch(/月|水|金/);
    });

    it('should create monthly recurring event with UNTIL', async () => {
      // Requirement: 1.1, 1.2, 1.7
      const recurringEvent = {
        title: 'Monthly Review',
        start: '2026-02-15T10:00:00Z',
        end: '2026-02-15T11:00:00Z',
        recurrence: ['RRULE:FREQ=MONTHLY;UNTIL=20261231T235959Z'],
      };

      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'recurring-monthly-event-123',
        summary: recurringEvent.title,
        start: { dateTime: recurringEvent.start },
        end: { dateTime: recurringEvent.end },
        recurrence: recurringEvent.recurrence,
        iCalUID: 'ical-recurring-monthly-123',
        status: 'confirmed',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const createdEvent = await calendarService.createEvent(recurringEvent);

      expect(createdEvent.id).toBe('recurring-monthly-event-123');
      expect(createdEvent.recurrence).toEqual(['RRULE:FREQ=MONTHLY;UNTIL=20261231T235959Z']);
      expect(createdEvent.recurrenceDescription).toContain('毎月');
    });

    it('should create recurring event with INTERVAL', async () => {
      // Requirement: 1.1, 1.5
      const recurringEvent = {
        title: 'Bi-weekly Sync',
        start: '2026-02-01T15:00:00Z',
        end: '2026-02-01T16:00:00Z',
        recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=10'],
      };

      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'recurring-interval-event-123',
        summary: recurringEvent.title,
        start: { dateTime: recurringEvent.start },
        end: { dateTime: recurringEvent.end },
        recurrence: recurringEvent.recurrence,
        iCalUID: 'ical-recurring-interval-123',
        status: 'confirmed',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const createdEvent = await calendarService.createEvent(recurringEvent);

      expect(createdEvent.recurrence).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=10']);
      expect(createdEvent.recurrenceDescription).toMatch(/2週間ごと|隔週/);
    });
  });

  describe('Single Instance Modification', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-recurrence-token',
      refreshToken: 'valid-recurrence-refresh',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      await oauthHandler.storeTokens(validTokens);
      await calendarService.authenticate();
      jest.clearAllMocks();

      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should update single instance without affecting others', async () => {
      // Requirement: 2.1, 2.2, 2.3
      const recurringInstanceId = 'recurring-instance-20260203T140000Z';
      const parentEventId = 'parent-recurring-event-123';

      // Mock existing recurring instance
      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Team Meeting',
        start: { dateTime: '2026-02-03T14:00:00Z' },
        end: { dateTime: '2026-02-03T15:00:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-123',
        status: 'confirmed',
      };

      mockCalendarClient.events.get.mockResolvedValue({
        data: mockInstance,
      });

      // Mock updated instance
      const mockUpdatedInstance: GoogleCalendarEvent = {
        ...mockInstance,
        summary: 'Team Meeting - Rescheduled',
        start: { dateTime: '2026-02-03T15:00:00Z' },
        end: { dateTime: '2026-02-03T16:00:00Z' },
      };

      mockCalendarClient.events.patch.mockResolvedValue({
        data: mockUpdatedInstance,
      });

      // Update with scope 'thisEvent'
      const updatedEvent = await calendarService.updateEvent(
        recurringInstanceId,
        {
          title: 'Team Meeting - Rescheduled',
          start: '2026-02-03T15:00:00Z',
          end: '2026-02-03T16:00:00Z',
        },
        undefined,
        'thisEvent'
      );

      expect(updatedEvent.id).toBe(recurringInstanceId);
      expect(updatedEvent.title).toBe('Team Meeting - Rescheduled');

      // Verify only instance was patched, not parent
      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: recurringInstanceId,
          requestBody: expect.objectContaining({
            summary: 'Team Meeting - Rescheduled',
          }),
        })
      );
    });

    it('should default to thisEvent scope when updating recurring instance without explicit scope', async () => {
      // Requirement: 2.4
      const recurringInstanceId = 'recurring-instance-20260204T140000Z';
      const parentEventId = 'parent-recurring-event-456';

      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Daily Standup',
        start: { dateTime: '2026-02-04T09:00:00Z' },
        end: { dateTime: '2026-02-04T09:30:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-456',
        status: 'confirmed',
      };

      mockCalendarClient.events.get.mockResolvedValue({
        data: mockInstance,
      });

      const mockUpdatedInstance: GoogleCalendarEvent = {
        ...mockInstance,
        summary: 'Daily Standup - Cancelled Today',
        status: 'cancelled',
      };

      mockCalendarClient.events.patch.mockResolvedValue({
        data: mockUpdatedInstance,
      });

      // Update without specifying scope (should default to thisEvent)
      const updatedEvent = await calendarService.updateEvent(recurringInstanceId, {
        title: 'Daily Standup - Cancelled Today',
      });

      expect(updatedEvent.title).toBe('Daily Standup - Cancelled Today');

      // Verify instance was patched directly
      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: recurringInstanceId,
        })
      );
    });
  });

  describe('Series Split (This and Future)', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-recurrence-token',
      refreshToken: 'valid-recurrence-refresh',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      await oauthHandler.storeTokens(validTokens);
      await calendarService.authenticate();
      jest.clearAllMocks();

      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should split series when updating with thisAndFuture scope', async () => {
      // Requirement: 3.1, 3.2, 3.3, 3.4
      const recurringInstanceId = 'recurring-instance-20260210T140000Z';
      const parentEventId = 'parent-recurring-event-789';

      // Mock existing recurring instance
      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Weekly Meeting',
        start: { dateTime: '2026-02-10T14:00:00Z' },
        end: { dateTime: '2026-02-10T15:00:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-789',
        status: 'confirmed',
      };

      mockCalendarClient.events.get
        .mockResolvedValueOnce({
          data: mockInstance,
        })
        .mockResolvedValueOnce({
          // Parent event
          data: {
            id: parentEventId,
            summary: 'Weekly Meeting',
            start: { dateTime: '2026-02-03T14:00:00Z' },
            end: { dateTime: '2026-02-03T15:00:00Z' },
            recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10'],
            iCalUID: 'ical-parent-789',
            status: 'confirmed',
          },
        });

      // Mock patch parent event (add UNTIL)
      mockCalendarClient.events.patch.mockResolvedValue({
        data: {
          id: parentEventId,
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-02-03T14:00:00Z' },
          end: { dateTime: '2026-02-03T15:00:00Z' },
          recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20260209T235959Z'],
          iCalUID: 'ical-parent-789',
          status: 'confirmed',
        },
      });

      // Mock insert new series
      mockCalendarClient.events.insert.mockResolvedValue({
        data: {
          id: 'new-recurring-series-789',
          summary: 'Weekly Meeting - Updated',
          start: { dateTime: '2026-02-10T15:00:00Z' }, // New time
          end: { dateTime: '2026-02-10T16:00:00Z' },
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=9'], // Remaining count
          iCalUID: 'ical-new-series-789',
          status: 'confirmed',
        },
      });

      // Update with thisAndFuture scope
      const updatedEvent = await calendarService.updateEvent(
        recurringInstanceId,
        {
          title: 'Weekly Meeting - Updated',
          start: '2026-02-10T15:00:00Z',
          end: '2026-02-10T16:00:00Z',
        },
        undefined,
        'thisAndFuture'
      );

      expect(updatedEvent.id).toBe('new-recurring-series-789');
      expect(updatedEvent.title).toBe('Weekly Meeting - Updated');

      // Verify parent event was updated with UNTIL
      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: parentEventId,
          requestBody: expect.objectContaining({
            recurrence: expect.arrayContaining([
              expect.stringMatching(/UNTIL=20260209T235959Z/),
            ]),
          }),
        })
      );

      // Verify new series was created
      // Note: New series inherits the original instance start time as its base time,
      // and uses the updated properties (title, end time, etc.)
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: 'Weekly Meeting - Updated',
            start: { dateTime: '2026-02-10T14:00:00Z' }, // Original instance time
            end: { dateTime: '2026-02-10T16:00:00Z' }, // Updated end time
            recurrence: expect.arrayContaining([
              expect.stringMatching(/RRULE:FREQ=WEEKLY/),
            ]),
          }),
        })
      );
    });

    it('should preserve past occurrences when splitting series', async () => {
      // Requirement: 3.3
      const recurringInstanceId = 'recurring-instance-20260215T100000Z';
      const parentEventId = 'parent-recurring-event-abc';

      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Monthly Review',
        start: { dateTime: '2026-02-15T10:00:00Z' },
        end: { dateTime: '2026-02-15T11:00:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-abc',
        status: 'confirmed',
      };

      mockCalendarClient.events.get
        .mockResolvedValueOnce({ data: mockInstance })
        .mockResolvedValueOnce({
          data: {
            id: parentEventId,
            summary: 'Monthly Review',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T11:00:00Z' },
            recurrence: ['RRULE:FREQ=MONTHLY;UNTIL=20261231T235959Z'],
            iCalUID: 'ical-parent-abc',
            status: 'confirmed',
          },
        });

      mockCalendarClient.events.patch.mockResolvedValue({
        data: {
          id: parentEventId,
          recurrence: ['RRULE:FREQ=MONTHLY;UNTIL=20260214T235959Z'],
        },
      });

      mockCalendarClient.events.insert.mockResolvedValue({
        data: {
          id: 'new-recurring-series-abc',
          summary: 'Monthly Review - New Format',
          start: { dateTime: '2026-02-15T14:00:00Z' },
          end: { dateTime: '2026-02-15T15:00:00Z' },
          recurrence: ['RRULE:FREQ=MONTHLY;UNTIL=20261231T235959Z'],
          iCalUID: 'ical-new-series-abc',
          status: 'confirmed',
        },
      });

      await calendarService.updateEvent(
        recurringInstanceId,
        {
          title: 'Monthly Review - New Format',
          start: '2026-02-15T14:00:00Z',
          end: '2026-02-15T15:00:00Z',
        },
        undefined,
        'thisAndFuture'
      );

      // Verify parent event was ended before the selected instance date
      const patchCall = mockCalendarClient.events.patch.mock.calls[0][0];
      expect(patchCall.requestBody.recurrence[0]).toMatch(/UNTIL=20260214T235959Z/);
    });
  });

  describe('All Events Update', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-recurrence-token',
      refreshToken: 'valid-recurrence-refresh',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      await oauthHandler.storeTokens(validTokens);
      await calendarService.authenticate();
      jest.clearAllMocks();

      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should update all events in series when scope is allEvents', async () => {
      // Requirement: 4.1, 4.2, 4.3
      const recurringInstanceId = 'recurring-instance-20260220T090000Z';
      const parentEventId = 'parent-recurring-event-def';

      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Daily Standup',
        start: { dateTime: '2026-02-20T09:00:00Z' },
        end: { dateTime: '2026-02-20T09:30:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-def',
        status: 'confirmed',
      };

      mockCalendarClient.events.get
        .mockResolvedValueOnce({ data: mockInstance })
        .mockResolvedValueOnce({
          // Parent event
          data: {
            id: parentEventId,
            summary: 'Daily Standup',
            start: { dateTime: '2026-02-01T09:00:00Z' },
            end: { dateTime: '2026-02-01T09:30:00Z' },
            recurrence: ['RRULE:FREQ=DAILY;COUNT=30'],
            iCalUID: 'ical-parent-def',
            status: 'confirmed',
          },
        });

      mockCalendarClient.events.patch.mockResolvedValue({
        data: {
          id: parentEventId,
          summary: 'Daily Standup - Extended',
          start: { dateTime: '2026-02-01T09:00:00Z' },
          end: { dateTime: '2026-02-01T10:00:00Z' }, // Extended 30 min
          recurrence: ['RRULE:FREQ=DAILY;COUNT=30'],
          iCalUID: 'ical-parent-def',
          status: 'confirmed',
        },
      });

      const updatedEvent = await calendarService.updateEvent(
        recurringInstanceId,
        {
          title: 'Daily Standup - Extended',
          end: '2026-02-01T10:00:00Z',
        },
        undefined,
        'allEvents'
      );

      expect(updatedEvent.title).toBe('Daily Standup - Extended');

      // Verify parent event was patched (not the instance)
      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: parentEventId,
          requestBody: expect.objectContaining({
            summary: 'Daily Standup - Extended',
          }),
        })
      );
    });
  });

  describe('Series Deletion', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-recurrence-token',
      refreshToken: 'valid-recurrence-refresh',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      await oauthHandler.storeTokens(validTokens);
      await calendarService.authenticate();
      jest.clearAllMocks();

      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should delete single instance with thisEvent scope', async () => {
      // Requirement: 5.1, 5.2
      const recurringInstanceId = 'recurring-instance-20260225T140000Z';
      const parentEventId = 'parent-recurring-event-ghi';

      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Team Meeting',
        start: { dateTime: '2026-02-25T14:00:00Z' },
        end: { dateTime: '2026-02-25T15:00:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-ghi',
        status: 'confirmed',
      };

      mockCalendarClient.events.get.mockResolvedValue({
        data: mockInstance,
      });

      mockCalendarClient.events.delete.mockResolvedValue({});

      await calendarService.deleteEvent(recurringInstanceId, undefined, 'thisEvent');

      // Verify only instance was deleted
      expect(mockCalendarClient.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: recurringInstanceId,
      });
    });

    it('should delete this and future instances with thisAndFuture scope', async () => {
      // Requirement: 5.1, 5.3
      const recurringInstanceId = 'recurring-instance-20260301T090000Z';
      const parentEventId = 'parent-recurring-event-jkl';

      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Daily Standup',
        start: { dateTime: '2026-03-01T09:00:00Z' },
        end: { dateTime: '2026-03-01T09:30:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-jkl',
        status: 'confirmed',
      };

      mockCalendarClient.events.get
        .mockResolvedValueOnce({ data: mockInstance })
        .mockResolvedValueOnce({
          // Parent event
          data: {
            id: parentEventId,
            summary: 'Daily Standup',
            start: { dateTime: '2026-02-01T09:00:00Z' },
            end: { dateTime: '2026-02-01T09:30:00Z' },
            recurrence: ['RRULE:FREQ=DAILY;UNTIL=20260331T235959Z'],
            iCalUID: 'ical-parent-jkl',
            status: 'confirmed',
          },
        });

      mockCalendarClient.events.patch.mockResolvedValue({
        data: {
          id: parentEventId,
          recurrence: ['RRULE:FREQ=DAILY;UNTIL=20260228T235959Z'],
        },
      });

      await calendarService.deleteEvent(recurringInstanceId, undefined, 'thisAndFuture');

      // Verify parent event was updated with UNTIL before selected instance
      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: parentEventId,
          requestBody: expect.objectContaining({
            recurrence: expect.arrayContaining([
              expect.stringMatching(/UNTIL=20260228T235959Z/),
            ]),
          }),
        })
      );
    });

    it('should delete entire series with allEvents scope', async () => {
      // Requirement: 5.1, 5.4
      const recurringInstanceId = 'recurring-instance-20260315T140000Z';
      const parentEventId = 'parent-recurring-event-mno';

      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Weekly Meeting',
        start: { dateTime: '2026-03-15T14:00:00Z' },
        end: { dateTime: '2026-03-15T15:00:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-mno',
        status: 'confirmed',
      };

      mockCalendarClient.events.get.mockResolvedValue({
        data: mockInstance,
      });

      mockCalendarClient.events.delete.mockResolvedValue({});

      await calendarService.deleteEvent(recurringInstanceId, undefined, 'allEvents');

      // Verify parent event was deleted (not the instance)
      expect(mockCalendarClient.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: parentEventId,
      });
    });

    it('should default to thisEvent scope for recurring instance deletion', async () => {
      // Requirement: 5.5
      const recurringInstanceId = 'recurring-instance-20260320T100000Z';
      const parentEventId = 'parent-recurring-event-pqr';

      const mockInstance: GoogleCalendarEvent = {
        id: recurringInstanceId,
        summary: 'Monthly Review',
        start: { dateTime: '2026-03-20T10:00:00Z' },
        end: { dateTime: '2026-03-20T11:00:00Z' },
        recurringEventId: parentEventId,
        iCalUID: 'ical-instance-pqr',
        status: 'confirmed',
      };

      mockCalendarClient.events.get.mockResolvedValue({
        data: mockInstance,
      });

      mockCalendarClient.events.delete.mockResolvedValue({});

      // Delete without specifying scope (should default to thisEvent)
      await calendarService.deleteEvent(recurringInstanceId);

      // Verify instance was deleted, not parent
      expect(mockCalendarClient.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: recurringInstanceId,
      });
    });
  });

  describe('Recurrence Information in Response', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-recurrence-token',
      refreshToken: 'valid-recurrence-refresh',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      await oauthHandler.storeTokens(validTokens);
      await calendarService.authenticate();
      jest.clearAllMocks();

      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should include recurrence array for recurring series parent', async () => {
      // Requirement: 6.1
      mockCalendarClient.events.list.mockResolvedValue({
        data: {
          items: [
            {
              id: 'parent-recurring-event-stu',
              summary: 'Weekly Team Meeting',
              start: { dateTime: '2026-02-03T14:00:00Z' },
              end: { dateTime: '2026-02-03T15:00:00Z' },
              recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=12'],
              iCalUID: 'ical-parent-stu',
              status: 'confirmed',
            },
          ],
        },
      });

      const events = await calendarService.listEvents({
        startDate: '2026-02-01T00:00:00Z',
        endDate: '2026-05-01T00:00:00Z',
      });

      expect(events).toHaveLength(1);
      expect(events[0].recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=12']);
    });

    it('should include recurringEventId for recurring event instances', async () => {
      // Requirement: 6.2
      const parentEventId = 'parent-recurring-event-vwx';

      mockCalendarClient.events.list.mockResolvedValue({
        data: {
          items: [
            {
              id: 'recurring-instance-20260210T090000Z',
              summary: 'Daily Standup',
              start: { dateTime: '2026-02-10T09:00:00Z' },
              end: { dateTime: '2026-02-10T09:30:00Z' },
              recurringEventId: parentEventId,
              iCalUID: 'ical-instance-vwx',
              status: 'confirmed',
            },
            {
              id: 'recurring-instance-20260211T090000Z',
              summary: 'Daily Standup',
              start: { dateTime: '2026-02-11T09:00:00Z' },
              end: { dateTime: '2026-02-11T09:30:00Z' },
              recurringEventId: parentEventId,
              iCalUID: 'ical-instance-vwx',
              status: 'confirmed',
            },
          ],
        },
      });

      const events = await calendarService.listEvents({
        startDate: '2026-02-10T00:00:00Z',
        endDate: '2026-02-12T00:00:00Z',
      });

      expect(events).toHaveLength(2);
      expect(events[0].recurringEventId).toBe(parentEventId);
      expect(events[1].recurringEventId).toBe(parentEventId);
    });

    it('should include human-readable recurrence description', async () => {
      // Requirement: 6.3
      mockCalendarClient.events.list.mockResolvedValue({
        data: {
          items: [
            {
              id: 'parent-recurring-event-yz1',
              summary: 'Team Meeting',
              start: { dateTime: '2026-02-03T14:00:00Z' },
              end: { dateTime: '2026-02-03T15:00:00Z' },
              recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20'],
              iCalUID: 'ical-parent-yz1',
              status: 'confirmed',
            },
          ],
        },
      });

      const events = await calendarService.listEvents({
        startDate: '2026-02-01T00:00:00Z',
        endDate: '2026-04-01T00:00:00Z',
      });

      expect(events).toHaveLength(1);
      expect(events[0].recurrenceDescription).toBeDefined();
      expect(events[0].recurrenceDescription).toContain('毎週');
      expect(events[0].recurrenceDescription).toMatch(/月|水|金/);
    });
  });
});
