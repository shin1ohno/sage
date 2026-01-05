/**
 * E2E Tests: Calendar Event Types MCP Tools
 * Tasks 47-48: End-to-end tests for MCP tools with event type support
 * Requirements: 1, 7.1, 7.2, 6.4 (Event Type Filtering and Creation via MCP Tools)
 *
 * These tests verify MCP tool handlers work correctly with Google Calendar event types:
 * - Task 47: list_calendar_events with eventTypes filter
 * - Task 48: create_calendar_event with eventType parameter
 *
 * Tests call the handler functions directly with mocked services to simulate
 * the complete MCP tool invocation flow without requiring actual Google Calendar API access.
 */

import {
  handleListCalendarEvents,
  handleCreateCalendarEvent,
  type CalendarToolsContext,
  type ListCalendarEventsInput,
  type CreateCalendarEventInput,
} from '../../src/tools/calendar/handlers.js';
import { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';
import { DEFAULT_CONFIG, type UserConfig } from '../../src/types/config.js';

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

jest.mock('../../src/utils/retry.js', () => {
  const actual = jest.requireActual('../../src/utils/retry.js');
  return {
    ...actual,
    retryWithBackoff: jest.fn(async (fn) => fn()),
  };
});

jest.mock('../../src/config/loader.js', () => {
  return {
    ConfigLoader: {
      load: jest.fn(async () => ({
        version: '0.8.8',
        user: {
          name: 'Test User',
          email: 'test@example.com',
          timezone: 'Asia/Tokyo',
        },
        calendar: {
          workingHours: { start: '09:00', end: '18:00' },
          deepWorkDays: ['Tuesday', 'Thursday'],
          meetingHeavyDays: ['Monday', 'Wednesday'],
          deepWorkBlocks: [],
          sources: {
            eventkit: { enabled: false },
            google: {
              enabled: true,
              defaultCalendar: 'primary',
              excludedCalendars: [],
              syncInterval: 300,
              enableNotifications: true,
            },
          },
        },
        lastUpdated: new Date().toISOString(),
      })),
      save: jest.fn(async () => {}),
      exists: jest.fn(async () => true),
      getConfigPath: jest.fn(() => '/mock/path/config.json'),
      getConfigDir: jest.fn(() => '/mock/path'),
    },
  };
});

// Mock CalendarService (EventKit - disabled for these tests)
jest.mock('../../src/integrations/calendar-service.js', () => {
  return {
    CalendarService: jest.fn().mockImplementation(() => ({
      isAvailable: jest.fn(async () => false),
      listEvents: jest.fn(async () => ({ events: [] })),
    })),
  };
});

/**
 * Task 47: E2E test for list_calendar_events with eventTypes filter
 * Requirement: 7.1, 7.2 (Event Type Filtering in List Operations)
 *
 * Tests:
 * - MCP tool list_calendar_events with eventTypes=["focusTime"]
 * - Verifies response contains only focusTime events
 * - Verifies eventType field is included in response
 */
describe('Task 47: E2E list_calendar_events with eventTypes filter', () => {
  let mockCalendarSourceManager: jest.Mocked<CalendarSourceManager>;
  let mockGoogleCalendarService: jest.Mocked<GoogleCalendarService>;
  let mockConfig: UserConfig;
  let ctx: CalendarToolsContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock config based on DEFAULT_CONFIG
    mockConfig = {
      ...DEFAULT_CONFIG,
      user: {
        ...DEFAULT_CONFIG.user,
        name: 'Test User',
        email: 'test@example.com',
      },
      calendar: {
        ...DEFAULT_CONFIG.calendar,
        deepWorkDays: ['Tuesday', 'Thursday'],
        meetingHeavyDays: ['Monday', 'Wednesday'],
        sources: {
          eventkit: { enabled: false },
          google: {
            enabled: true,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        },
      },
      lastUpdated: new Date().toISOString(),
    };

    // Create mock Google Calendar Service
    mockGoogleCalendarService = {
      listEvents: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      authenticate: jest.fn(),
    } as unknown as jest.Mocked<GoogleCalendarService>;

    // Create mock CalendarSourceManager
    mockCalendarSourceManager = {
      getEvents: jest.fn(),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEnabledSources: jest.fn().mockReturnValue(['google']),
      findAvailableSlots: jest.fn(),
      detectAvailableSources: jest.fn(),
      healthCheck: jest.fn(),
      respondToEvent: jest.fn(),
    } as unknown as jest.Mocked<CalendarSourceManager>;

    // Create mock context
    ctx = {
      getConfig: () => mockConfig,
      getCalendarSourceManager: () => mockCalendarSourceManager,
      getCalendarEventResponseService: () => null,
      getGoogleCalendarService: () => mockGoogleCalendarService,
      getWorkingCadenceService: () => null,
      setWorkingCadenceService: () => {},
      initializeServices: () => {},
    };
  });

  it('should return only focusTime events when eventTypes=["focusTime"]', async () => {
    // Setup: Mock events with mixed types
    const mixedEvents: CalendarEvent[] = [
      {
        id: 'focus-1',
        title: 'Deep Work Session',
        start: '2026-01-15T09:00:00Z',
        end: '2026-01-15T12:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'focusTime',
        typeSpecificProperties: {
          eventType: 'focusTime',
          properties: {
            autoDeclineMode: 'declineAllConflictingInvitations',
            chatStatus: 'doNotDisturb',
          },
        },
      },
      {
        id: 'meeting-1',
        title: 'Team Meeting',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T15:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'default',
      },
      {
        id: 'ooo-1',
        title: 'Vacation',
        start: '2026-01-16',
        end: '2026-01-20',
        isAllDay: true,
        source: 'google',
        eventType: 'outOfOffice',
        typeSpecificProperties: {
          eventType: 'outOfOffice',
          properties: {
            autoDeclineMode: 'declineAllConflictingInvitations',
          },
        },
      },
      {
        id: 'focus-2',
        title: 'Afternoon Focus',
        start: '2026-01-15T16:00:00Z',
        end: '2026-01-15T18:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'focusTime',
        typeSpecificProperties: {
          eventType: 'focusTime',
          properties: {
            autoDeclineMode: 'declineNone',
          },
        },
      },
    ];

    mockCalendarSourceManager.getEvents.mockResolvedValue(mixedEvents);

    // Execute: Call list_calendar_events with eventTypes filter
    const input: ListCalendarEventsInput = {
      startDate: '2026-01-15',
      endDate: '2026-01-20',
      eventTypes: ['focusTime'],
    };

    const result = await handleListCalendarEvents(ctx, input);

    // Verify: Parse response
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].type).toBe('text');

    const response = JSON.parse(result.content[0].text);

    // Verify: Only focusTime events returned
    expect(response.success).toBe(true);
    expect(response.totalEvents).toBe(2);
    expect(response.events).toHaveLength(2);

    // Verify: All returned events are focusTime type
    response.events.forEach((event: any) => {
      expect(event.eventType).toBe('focusTime');
    });

    // Verify: Event IDs match expected focusTime events
    const eventIds = response.events.map((e: any) => e.id);
    expect(eventIds).toContain('focus-1');
    expect(eventIds).toContain('focus-2');
    expect(eventIds).not.toContain('meeting-1');
    expect(eventIds).not.toContain('ooo-1');

    // Verify: eventType field is included in response
    expect(response.events[0]).toHaveProperty('eventType');
    expect(response.eventTypesFilter).toEqual(['focusTime']);
  });

  it('should return events of multiple types when eventTypes=["focusTime", "outOfOffice"]', async () => {
    // Setup: Mock events with mixed types
    const mixedEvents: CalendarEvent[] = [
      {
        id: 'focus-1',
        title: 'Focus Block',
        start: '2026-01-15T09:00:00Z',
        end: '2026-01-15T12:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'focusTime',
      },
      {
        id: 'meeting-1',
        title: 'Team Meeting',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T15:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'default',
      },
      {
        id: 'ooo-1',
        title: 'Out of Office',
        start: '2026-01-16',
        end: '2026-01-17',
        isAllDay: true,
        source: 'google',
        eventType: 'outOfOffice',
      },
      {
        id: 'wl-1',
        title: 'Working from Home',
        start: '2026-01-15',
        end: '2026-01-16',
        isAllDay: true,
        source: 'google',
        eventType: 'workingLocation',
      },
    ];

    mockCalendarSourceManager.getEvents.mockResolvedValue(mixedEvents);

    // Execute: Call with multiple event types filter
    const input: ListCalendarEventsInput = {
      startDate: '2026-01-15',
      endDate: '2026-01-20',
      eventTypes: ['focusTime', 'outOfOffice'],
    };

    const result = await handleListCalendarEvents(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: focusTime and outOfOffice events returned, others filtered out
    expect(response.success).toBe(true);
    expect(response.totalEvents).toBe(2);

    const eventTypes = response.events.map((e: any) => e.eventType);
    expect(eventTypes).toContain('focusTime');
    expect(eventTypes).toContain('outOfOffice');
    expect(eventTypes).not.toContain('default');
    expect(eventTypes).not.toContain('workingLocation');
  });

  it('should return all events when eventTypes is not specified', async () => {
    // Setup: Mock events with mixed types
    const mixedEvents: CalendarEvent[] = [
      {
        id: 'event-1',
        title: 'Focus Block',
        start: '2026-01-15T09:00:00Z',
        end: '2026-01-15T12:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'focusTime',
      },
      {
        id: 'event-2',
        title: 'Meeting',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T15:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'default',
      },
      {
        id: 'event-3',
        title: 'OOO',
        start: '2026-01-16',
        end: '2026-01-17',
        isAllDay: true,
        source: 'google',
        eventType: 'outOfOffice',
      },
    ];

    mockCalendarSourceManager.getEvents.mockResolvedValue(mixedEvents);

    // Execute: Call without eventTypes filter
    const input: ListCalendarEventsInput = {
      startDate: '2026-01-15',
      endDate: '2026-01-20',
    };

    const result = await handleListCalendarEvents(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: All events returned
    expect(response.success).toBe(true);
    expect(response.totalEvents).toBe(3);
    expect(response.eventTypesFilter).toBeUndefined();
  });

  it('should return empty list when no events match the filter', async () => {
    // Setup: Mock events with no focusTime
    const events: CalendarEvent[] = [
      {
        id: 'meeting-1',
        title: 'Meeting',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T15:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'default',
      },
    ];

    mockCalendarSourceManager.getEvents.mockResolvedValue(events);

    // Execute: Call with focusTime filter (no focusTime events exist)
    const input: ListCalendarEventsInput = {
      startDate: '2026-01-15',
      endDate: '2026-01-20',
      eventTypes: ['focusTime'],
    };

    const result = await handleListCalendarEvents(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Empty list returned
    expect(response.success).toBe(true);
    expect(response.totalEvents).toBe(0);
    expect(response.events).toHaveLength(0);
  });

  it('should include typeSpecificProperties in response for focusTime events', async () => {
    // Setup: focusTime event with properties
    const events: CalendarEvent[] = [
      {
        id: 'focus-1',
        title: 'Deep Work',
        start: '2026-01-15T09:00:00Z',
        end: '2026-01-15T12:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'focusTime',
        typeSpecificProperties: {
          eventType: 'focusTime',
          properties: {
            autoDeclineMode: 'declineAllConflictingInvitations',
            chatStatus: 'doNotDisturb',
            declineMessage: 'Focus time - will respond later',
          },
        },
      },
    ];

    mockCalendarSourceManager.getEvents.mockResolvedValue(events);

    // Execute
    const input: ListCalendarEventsInput = {
      startDate: '2026-01-15',
      endDate: '2026-01-16',
      eventTypes: ['focusTime'],
    };

    const result = await handleListCalendarEvents(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: typeSpecificProperties included in response
    expect(response.events[0].typeSpecificProperties).toBeDefined();
    expect(response.events[0].typeSpecificProperties.eventType).toBe('focusTime');
    expect(response.events[0].typeSpecificProperties.properties).toEqual(
      expect.objectContaining({
        autoDeclineMode: 'declineAllConflictingInvitations',
        chatStatus: 'doNotDisturb',
      })
    );
  });

  it('should handle EventKit events without eventType as default', async () => {
    // Setup: Mix of Google and EventKit events
    const events: CalendarEvent[] = [
      {
        id: 'eventkit-1',
        title: 'EventKit Meeting',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
        isAllDay: false,
        source: 'eventkit',
        // No eventType - EventKit doesn't support event types
      } as CalendarEvent,
      {
        id: 'google-focus',
        title: 'Focus Block',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T16:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'focusTime',
      },
    ];

    mockCalendarSourceManager.getEvents.mockResolvedValue(events);

    // Execute: Filter for default events
    const input: ListCalendarEventsInput = {
      startDate: '2026-01-15',
      endDate: '2026-01-16',
      eventTypes: ['default'],
    };

    const result = await handleListCalendarEvents(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: EventKit event (no eventType) treated as default
    expect(response.success).toBe(true);
    expect(response.totalEvents).toBe(1);
    expect(response.events[0].id).toBe('eventkit-1');
    expect(response.events[0].eventType).toBe('default');
  });
});

/**
 * Task 48: E2E test for create_calendar_event with eventType
 * Requirement: 1, 6.4 (Event Type Creation via MCP Tool)
 *
 * Tests:
 * - MCP tool create_calendar_event with eventType="outOfOffice" and autoDeclineMode
 * - Verifies event is created with correct properties
 * - Verifies response includes eventType and typeSpecificProperties
 */
describe('Task 48: E2E create_calendar_event with eventType', () => {
  let mockCalendarSourceManager: jest.Mocked<CalendarSourceManager>;
  let mockGoogleCalendarService: jest.Mocked<GoogleCalendarService>;
  let mockConfig: UserConfig;
  let ctx: CalendarToolsContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock config based on DEFAULT_CONFIG
    mockConfig = {
      ...DEFAULT_CONFIG,
      user: {
        ...DEFAULT_CONFIG.user,
        name: 'Test User',
        email: 'test@example.com',
      },
      calendar: {
        ...DEFAULT_CONFIG.calendar,
        deepWorkDays: ['Tuesday', 'Thursday'],
        meetingHeavyDays: ['Monday', 'Wednesday'],
        sources: {
          eventkit: { enabled: false },
          google: {
            enabled: true,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        },
      },
      lastUpdated: new Date().toISOString(),
    };

    // Create mock Google Calendar Service
    mockGoogleCalendarService = {
      listEvents: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      authenticate: jest.fn(),
    } as unknown as jest.Mocked<GoogleCalendarService>;

    // Create mock CalendarSourceManager
    mockCalendarSourceManager = {
      getEvents: jest.fn(),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEnabledSources: jest.fn().mockReturnValue(['google']),
      findAvailableSlots: jest.fn(),
      detectAvailableSources: jest.fn(),
      healthCheck: jest.fn(),
      respondToEvent: jest.fn(),
    } as unknown as jest.Mocked<CalendarSourceManager>;

    // Create mock context
    ctx = {
      getConfig: () => mockConfig,
      getCalendarSourceManager: () => mockCalendarSourceManager,
      getCalendarEventResponseService: () => null,
      getGoogleCalendarService: () => mockGoogleCalendarService,
      getWorkingCadenceService: () => null,
      setWorkingCadenceService: () => {},
      initializeServices: () => {},
    };
  });

  it('should create outOfOffice event with autoDeclineMode', async () => {
    // Setup: Mock successful event creation
    const mockCreatedEvent: CalendarEvent = {
      id: 'ooo-123',
      title: 'Winter Vacation',
      start: '2026-01-20',
      end: '2026-01-25',
      isAllDay: true,
      source: 'google',
      eventType: 'outOfOffice',
      typeSpecificProperties: {
        eventType: 'outOfOffice',
        properties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'On vacation until Jan 25.',
        },
      },
    };

    mockCalendarSourceManager.createEvent.mockResolvedValue(mockCreatedEvent);

    // Execute: Create outOfOffice event
    const input: CreateCalendarEventInput = {
      title: 'Winter Vacation',
      startDate: '2026-01-20T00:00:00Z',
      endDate: '2026-01-25T00:00:00Z',
      eventType: 'outOfOffice',
      autoDeclineMode: 'declineAllConflictingInvitations',
      declineMessage: 'On vacation until Jan 25.',
    };

    const result = await handleCreateCalendarEvent(ctx, input);

    // Verify: Parse response
    expect(result.content).toBeDefined();
    const response = JSON.parse(result.content[0].text);

    // Verify: Event created successfully
    expect(response.success).toBe(true);
    expect(response.eventId).toBe('ooo-123');
    expect(response.title).toBe('Winter Vacation');
    expect(response.source).toBe('google');
    expect(response.eventType).toBe('outOfOffice');

    // Verify: CalendarSourceManager.createEvent was called with correct request
    expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Winter Vacation',
        start: '2026-01-20T00:00:00Z',
        end: '2026-01-25T00:00:00Z',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'On vacation until Jan 25.',
        },
      }),
      'google' // Non-default event types are routed to Google Calendar
    );
  });

  it('should create focusTime event with chatStatus', async () => {
    // Setup: Mock successful event creation
    const mockCreatedEvent: CalendarEvent = {
      id: 'focus-456',
      title: 'Deep Work Block',
      start: '2026-01-15T09:00:00+09:00',
      end: '2026-01-15T12:00:00+09:00',
      isAllDay: false,
      source: 'google',
      eventType: 'focusTime',
      typeSpecificProperties: {
        eventType: 'focusTime',
        properties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          chatStatus: 'doNotDisturb',
        },
      },
    };

    mockCalendarSourceManager.createEvent.mockResolvedValue(mockCreatedEvent);

    // Execute: Create focusTime event
    const input: CreateCalendarEventInput = {
      title: 'Deep Work Block',
      startDate: '2026-01-15T09:00:00+09:00',
      endDate: '2026-01-15T12:00:00+09:00',
      eventType: 'focusTime',
      autoDeclineMode: 'declineAllConflictingInvitations',
      chatStatus: 'doNotDisturb',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Event created successfully with focusTime type
    expect(response.success).toBe(true);
    expect(response.eventType).toBe('focusTime');
    expect(response.message).toContain('フォーカスタイム');

    // Verify: CalendarSourceManager.createEvent was called correctly
    expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'focusTime',
        focusTimeProperties: expect.objectContaining({
          autoDeclineMode: 'declineAllConflictingInvitations',
          chatStatus: 'doNotDisturb',
        }),
      }),
      'google'
    );
  });

  it('should create workingLocation event with homeOffice type', async () => {
    // Setup: Mock successful event creation
    const mockCreatedEvent: CalendarEvent = {
      id: 'wl-789',
      title: 'Working from Home',
      start: '2026-01-15',
      end: '2026-01-16',
      isAllDay: true,
      source: 'google',
      eventType: 'workingLocation',
      typeSpecificProperties: {
        eventType: 'workingLocation',
        properties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      },
    };

    mockCalendarSourceManager.createEvent.mockResolvedValue(mockCreatedEvent);

    // Execute: Create workingLocation event
    const input: CreateCalendarEventInput = {
      title: 'Working from Home',
      startDate: '2026-01-15',
      endDate: '2026-01-16',
      eventType: 'workingLocation',
      workingLocationType: 'homeOffice',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Event created successfully
    expect(response.success).toBe(true);
    expect(response.eventType).toBe('workingLocation');
    expect(response.isAllDay).toBe(true);
    expect(response.message).toContain('勤務場所');

    // Verify: Request includes workingLocationProperties
    expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'workingLocation',
        isAllDay: true,
        workingLocationProperties: expect.objectContaining({
          type: 'homeOffice',
          homeOffice: true,
        }),
      }),
      'google'
    );
  });

  it('should reject fromGmail event creation', async () => {
    // Execute: Attempt to create fromGmail event (should fail)
    const input: CreateCalendarEventInput = {
      title: 'Gmail Event',
      startDate: '2026-01-15T10:00:00Z',
      endDate: '2026-01-15T11:00:00Z',
      eventType: 'fromGmail',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Creation rejected
    expect(response.success).toBe(false);
    expect(response.error).toBe(true);
    expect(response.message).toContain('fromGmail');
    expect(response.message).toContain('APIから作成できません');

    // Verify: createEvent was not called
    expect(mockCalendarSourceManager.createEvent).not.toHaveBeenCalled();
  });

  it('should reject invalid eventType', async () => {
    // Execute: Attempt to create event with invalid type
    const input: CreateCalendarEventInput = {
      title: 'Invalid Type Event',
      startDate: '2026-01-15T10:00:00Z',
      endDate: '2026-01-15T11:00:00Z',
      eventType: 'invalidType',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Creation rejected
    expect(response.success).toBe(false);
    expect(response.error).toBe(true);
    expect(response.message).toContain('無効なイベントタイプ');

    // Verify: createEvent was not called
    expect(mockCalendarSourceManager.createEvent).not.toHaveBeenCalled();
  });

  it('should require Google Calendar for non-default event types', async () => {
    // Setup: Google Calendar disabled
    mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);

    // Execute: Attempt to create focusTime without Google Calendar
    const input: CreateCalendarEventInput = {
      title: 'Focus Time',
      startDate: '2026-01-15T09:00:00Z',
      endDate: '2026-01-15T12:00:00Z',
      eventType: 'focusTime',
      autoDeclineMode: 'declineNone',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Creation rejected because Google Calendar is required
    expect(response.success).toBe(false);
    expect(response.error).toBe(true);
    expect(response.message).toContain('Google Calendarが必要');

    // Verify: createEvent was not called
    expect(mockCalendarSourceManager.createEvent).not.toHaveBeenCalled();
  });

  it('should create default event without eventType parameter', async () => {
    // Setup: Mock successful event creation
    const mockCreatedEvent: CalendarEvent = {
      id: 'default-111',
      title: 'Team Meeting',
      start: '2026-01-15T10:00:00Z',
      end: '2026-01-15T11:00:00Z',
      isAllDay: false,
      source: 'google',
    };

    mockCalendarSourceManager.createEvent.mockResolvedValue(mockCreatedEvent);

    // Execute: Create event without eventType (should default to 'default')
    const input: CreateCalendarEventInput = {
      title: 'Team Meeting',
      startDate: '2026-01-15T10:00:00Z',
      endDate: '2026-01-15T11:00:00Z',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Event created successfully
    expect(response.success).toBe(true);
    expect(response.title).toBe('Team Meeting');

    // eventType should not be in response for default events
    expect(response.eventType).toBeUndefined();

    // Verify: Request does not include eventType for default events
    expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ eventType: expect.anything() }),
      undefined // No preferred source for default events
    );
  });

  it('should create birthday event with yearly recurrence', async () => {
    // Setup: Mock successful event creation
    const mockCreatedEvent: CalendarEvent = {
      id: 'birthday-222',
      title: "John's Birthday",
      start: '2026-03-15',
      end: '2026-03-16',
      isAllDay: true,
      source: 'google',
      eventType: 'birthday',
      typeSpecificProperties: {
        eventType: 'birthday',
        properties: {
          type: 'birthday',
        },
      },
    };

    mockCalendarSourceManager.createEvent.mockResolvedValue(mockCreatedEvent);

    // Execute: Create birthday event
    const input: CreateCalendarEventInput = {
      title: "John's Birthday",
      startDate: '2026-03-15',
      endDate: '2026-03-16',
      eventType: 'birthday',
      birthdayType: 'birthday',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Event created successfully
    expect(response.success).toBe(true);
    expect(response.eventType).toBe('birthday');
    expect(response.isAllDay).toBe(true);
    expect(response.message).toContain('誕生日/記念日');

    // Verify: Request includes birthdayProperties and isAllDay
    expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'birthday',
        isAllDay: true,
        birthdayProperties: {
          type: 'birthday',
        },
      }),
      'google'
    );
  });

  it('should create workingLocation event with customLocation', async () => {
    // Setup: Mock successful event creation
    const mockCreatedEvent: CalendarEvent = {
      id: 'wl-custom-333',
      title: 'Working from Cafe',
      start: '2026-01-15',
      end: '2026-01-16',
      isAllDay: true,
      source: 'google',
      eventType: 'workingLocation',
      typeSpecificProperties: {
        eventType: 'workingLocation',
        properties: {
          type: 'customLocation',
          customLocation: {
            label: 'Downtown Cafe',
          },
        },
      },
    };

    mockCalendarSourceManager.createEvent.mockResolvedValue(mockCreatedEvent);

    // Execute: Create workingLocation with custom location
    const input: CreateCalendarEventInput = {
      title: 'Working from Cafe',
      startDate: '2026-01-15',
      endDate: '2026-01-16',
      eventType: 'workingLocation',
      workingLocationType: 'customLocation',
      workingLocationLabel: 'Downtown Cafe',
    };

    const result = await handleCreateCalendarEvent(ctx, input);
    const response = JSON.parse(result.content[0].text);

    // Verify: Event created successfully
    expect(response.success).toBe(true);
    expect(response.eventType).toBe('workingLocation');

    // Verify: Request includes customLocation with label
    expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workingLocationProperties: expect.objectContaining({
          type: 'customLocation',
          customLocation: {
            label: 'Downtown Cafe',
          },
        }),
      }),
      'google'
    );
  });
});

/**
 * Additional E2E test for combined workflow
 * Verifies that created events appear correctly in list with eventType filter
 */
describe('E2E: Combined Create and List Workflow', () => {
  let mockCalendarSourceManager: jest.Mocked<CalendarSourceManager>;
  let mockConfig: UserConfig;
  let ctx: CalendarToolsContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock config based on DEFAULT_CONFIG
    mockConfig = {
      ...DEFAULT_CONFIG,
      user: {
        ...DEFAULT_CONFIG.user,
        name: 'Test',
        email: 'test@example.com',
      },
      calendar: {
        ...DEFAULT_CONFIG.calendar,
        deepWorkDays: [],
        meetingHeavyDays: [],
        sources: {
          eventkit: { enabled: false },
          google: {
            enabled: true,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        },
      },
      lastUpdated: new Date().toISOString(),
    };

    mockCalendarSourceManager = {
      getEvents: jest.fn(),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEnabledSources: jest.fn().mockReturnValue(['google']),
      findAvailableSlots: jest.fn(),
      detectAvailableSources: jest.fn(),
      healthCheck: jest.fn(),
      respondToEvent: jest.fn(),
    } as unknown as jest.Mocked<CalendarSourceManager>;

    ctx = {
      getConfig: () => mockConfig,
      getCalendarSourceManager: () => mockCalendarSourceManager,
      getCalendarEventResponseService: () => null,
      getGoogleCalendarService: () => null,
      getWorkingCadenceService: () => null,
      setWorkingCadenceService: () => {},
      initializeServices: () => {},
    };
  });

  it('should create focusTime event and verify it appears in filtered list', async () => {
    // Step 1: Create focusTime event
    const createdEvent: CalendarEvent = {
      id: 'focus-new',
      title: 'Focus Block',
      start: '2026-01-15T09:00:00Z',
      end: '2026-01-15T12:00:00Z',
      isAllDay: false,
      source: 'google',
      eventType: 'focusTime',
      typeSpecificProperties: {
        eventType: 'focusTime',
        properties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
        },
      },
    };

    mockCalendarSourceManager.createEvent.mockResolvedValue(createdEvent);

    const createInput: CreateCalendarEventInput = {
      title: 'Focus Block',
      startDate: '2026-01-15T09:00:00Z',
      endDate: '2026-01-15T12:00:00Z',
      eventType: 'focusTime',
      autoDeclineMode: 'declineAllConflictingInvitations',
    };

    const createResult = await handleCreateCalendarEvent(ctx, createInput);
    const createResponse = JSON.parse(createResult.content[0].text);

    expect(createResponse.success).toBe(true);
    expect(createResponse.eventType).toBe('focusTime');

    // Step 2: List events with focusTime filter - should include the new event
    mockCalendarSourceManager.getEvents.mockResolvedValue([
      createdEvent,
      {
        id: 'meeting-1',
        title: 'Meeting',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T15:00:00Z',
        isAllDay: false,
        source: 'google',
        eventType: 'default',
      } as CalendarEvent,
    ]);

    const listInput: ListCalendarEventsInput = {
      startDate: '2026-01-15',
      endDate: '2026-01-16',
      eventTypes: ['focusTime'],
    };

    const listResult = await handleListCalendarEvents(ctx, listInput);
    const listResponse = JSON.parse(listResult.content[0].text);

    // Verify: Only the focusTime event appears in the filtered list
    expect(listResponse.success).toBe(true);
    expect(listResponse.totalEvents).toBe(1);
    expect(listResponse.events[0].id).toBe('focus-new');
    expect(listResponse.events[0].eventType).toBe('focusTime');
    expect(listResponse.events[0].typeSpecificProperties).toBeDefined();
  });
});
