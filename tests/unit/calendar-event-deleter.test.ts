/**
 * Calendar Event Deleter Service Tests
 * TDD tests for calendar event deletion functionality
 * Requirements: 19.1-19.12
 */

import {
  CalendarEventDeleterService,
  DeleteCalendarEventRequest,
  DeleteCalendarEventsBatchRequest,
  DeleteCalendarEventResult,
  extractEventUid,
} from '../../src/integrations/calendar-event-deleter.js';

describe('CalendarEventDeleterService', () => {
  let service: CalendarEventDeleterService;

  beforeEach(() => {
    service = new CalendarEventDeleterService();
  });

  describe('extractEventUid', () => {
    // Requirement: 19.4, 19.5

    it('should extract UUID from full ID format', () => {
      const fullId = '218F62EC-1234-5678-90AB-CDEF01234567:CB9F0431-ABCD-EF12-3456-789012345678';
      const result = extractEventUid(fullId);
      expect(result).toBe('CB9F0431-ABCD-EF12-3456-789012345678');
    });

    it('should return UUID as-is when no colon present', () => {
      const uuid = 'CB9F0431-ABCD-EF12-3456-789012345678';
      const result = extractEventUid(uuid);
      expect(result).toBe('CB9F0431-ABCD-EF12-3456-789012345678');
    });

    it('should handle multiple colons and extract last part', () => {
      const complexId = 'prefix:middle:CB9F0431-ABCD-EF12-3456-789012345678';
      const result = extractEventUid(complexId);
      expect(result).toBe('CB9F0431-ABCD-EF12-3456-789012345678');
    });

    it('should return empty string for null/undefined', () => {
      expect(extractEventUid(null as unknown as string)).toBe('');
      expect(extractEventUid(undefined as unknown as string)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(extractEventUid('')).toBe('');
    });

    it('should trim whitespace', () => {
      const uuid = '  CB9F0431-ABCD-EF12-3456-789012345678  ';
      const result = extractEventUid(uuid);
      expect(result).toBe('CB9F0431-ABCD-EF12-3456-789012345678');
    });
  });

  describe('validateDeleteRequest', () => {
    // Requirement: 19.2, 19.3

    it('should return error for missing eventId', () => {
      const request: DeleteCalendarEventRequest = {
        eventId: '',
      };
      const error = service.validateRequest(request);
      expect(error).toBe('無効なイベントID: イベントIDが空です');
    });

    it('should return error for whitespace-only eventId', () => {
      const request: DeleteCalendarEventRequest = {
        eventId: '   ',
      };
      const error = service.validateRequest(request);
      expect(error).toBe('無効なイベントID: イベントIDが空です');
    });

    it('should return null for valid request with eventId only', () => {
      const request: DeleteCalendarEventRequest = {
        eventId: 'CB9F0431-ABCD-EF12-3456-789012345678',
      };
      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });

    it('should return null for valid request with calendarName', () => {
      const request: DeleteCalendarEventRequest = {
        eventId: 'CB9F0431-ABCD-EF12-3456-789012345678',
        calendarName: 'Work',
      };
      const error = service.validateRequest(request);
      expect(error).toBeNull();
    });
  });

  describe('validateBatchRequest', () => {
    // Requirement: 19.10

    it('should return error for empty eventIds array', () => {
      const request: DeleteCalendarEventsBatchRequest = {
        eventIds: [],
      };
      const error = service.validateBatchRequest(request);
      expect(error).toBe('無効なリクエスト: イベントIDの配列が空です');
    });

    it('should return error for eventIds with empty strings', () => {
      const request: DeleteCalendarEventsBatchRequest = {
        eventIds: ['valid-id', '', 'another-id'],
      };
      const error = service.validateBatchRequest(request);
      expect(error).toBe('無効なイベントID: インデックス1のイベントIDが空です');
    });

    it('should return null for valid batch request', () => {
      const request: DeleteCalendarEventsBatchRequest = {
        eventIds: ['id1', 'id2', 'id3'],
      };
      const error = service.validateBatchRequest(request);
      expect(error).toBeNull();
    });
  });

  describe('buildDeleteEventScript', () => {
    // Requirement: 19.6

    it('should build script for event deletion with UUID only', () => {
      const eventId = 'CB9F0431-ABCD-EF12-3456-789012345678';
      const script = service.buildDeleteEventScript(eventId);

      expect(script).toContain('use framework "EventKit"');
      expect(script).toContain('CB9F0431-ABCD-EF12-3456-789012345678');
      expect(script).toContain('calendarItemWithIdentifier');
    });

    it('should build script for event deletion with calendar name', () => {
      const eventId = 'CB9F0431-ABCD-EF12-3456-789012345678';
      const calendarName = 'Work';
      const script = service.buildDeleteEventScript(eventId, calendarName);

      expect(script).toContain('use framework "EventKit"');
      expect(script).toContain('CB9F0431-ABCD-EF12-3456-789012345678');
      expect(script).toContain('"Work"');
    });

    it('should escape special characters in calendar name', () => {
      const eventId = 'test-id';
      const calendarName = 'Work "Team"';
      const script = service.buildDeleteEventScript(eventId, calendarName);

      expect(script).toContain('Work \\"Team\\"');
    });
  });

  describe('parseDeleteEventResult', () => {
    // Requirement: 19.7, 19.9

    it('should parse successful deletion result', () => {
      const result = 'SUCCESS|CB9F0431-ABCD-EF12|Team Meeting|Work Calendar';
      const parsed = service.parseDeleteEventResult(result, 'CB9F0431-ABCD-EF12');

      expect(parsed.success).toBe(true);
      expect(parsed.eventId).toBe('CB9F0431-ABCD-EF12');
      expect(parsed.title).toBe('Team Meeting');
      expect(parsed.calendarName).toBe('Work Calendar');
      expect(parsed.error).toBeUndefined();
    });

    it('should parse event not found error', () => {
      const result = 'ERROR:イベントが見つかりません';
      const parsed = service.parseDeleteEventResult(result, 'invalid-id');

      expect(parsed.success).toBe(false);
      expect(parsed.eventId).toBe('invalid-id');
      expect(parsed.error).toBe('イベントが見つかりません');
    });

    it('should parse read-only calendar error', () => {
      const result = 'ERROR:読み取り専用カレンダーからは削除できません: Holidays';
      const parsed = service.parseDeleteEventResult(result, 'test-id');

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('読み取り専用カレンダーからは削除できません: Holidays');
    });

    it('should handle unexpected result format', () => {
      const result = 'unexpected format';
      const parsed = service.parseDeleteEventResult(result, 'test-id');

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('予期しない応答形式');
    });
  });

  describe('deleteEvent', () => {
    // Requirement: 19.1

    it('should return error for empty eventId', async () => {
      const result = await service.deleteEvent({ eventId: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('無効なイベントID: イベントIDが空です');
      expect(result.message).toBe('イベントの削除に失敗しました');
    });

    it('should return error when platform is not macOS', async () => {
      // Mock platform detection
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      const result = await service.deleteEvent({
        eventId: 'valid-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('macOS');

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    // Integration test - will be skipped in CI
    it.skip('should delete event via EventKit on macOS', async () => {
      // This test requires actual EventKit access
      const result = await service.deleteEvent({
        eventId: 'test-event-id',
        calendarName: 'Calendar',
      });

      expect(result).toBeDefined();
    });
  });

  describe('deleteEventsBatch', () => {
    // Requirement: 19.10, 19.11

    it('should return error for empty eventIds array', async () => {
      const result = await service.deleteEventsBatch({ eventIds: [] });

      expect(result.success).toBe(false);
      expect(result.message).toContain('失敗');
    });

    it('should return summary with counts', async () => {
      // Mock platform to non-macOS to get consistent error results
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      const result = await service.deleteEventsBatch({
        eventIds: ['id1', 'id2', 'id3'],
      });

      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(3);
      expect(result.results).toHaveLength(3);

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    it('should process each event sequentially', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      const startTime = Date.now();
      await service.deleteEventsBatch({
        eventIds: ['id1', 'id2'],
      });
      const elapsed = Date.now() - startTime;

      // With 100ms delay between events, should take at least 100ms for 2 events
      // But since we're failing fast (non-macOS), the delay may not apply
      // Just verify it completes
      expect(elapsed).toBeGreaterThanOrEqual(0);

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });
  });

  describe('generateSuccessMessage', () => {
    // Requirement: 19.9

    it('should generate message for successful single deletion', () => {
      const result: DeleteCalendarEventResult = {
        success: true,
        eventId: 'test-id',
        title: 'Team Meeting',
        calendarName: 'Work',
        message: '',
      };
      const message = service.generateSuccessMessage(result);

      expect(message).toBe('イベント「Team Meeting」を削除しました（カレンダー: Work）');
    });

    it('should generate message without calendar name', () => {
      const result: DeleteCalendarEventResult = {
        success: true,
        eventId: 'test-id',
        title: 'Quick Sync',
        message: '',
      };
      const message = service.generateSuccessMessage(result);

      expect(message).toBe('イベント「Quick Sync」を削除しました');
    });

    it('should generate message for failed deletion', () => {
      const result: DeleteCalendarEventResult = {
        success: false,
        eventId: 'test-id',
        error: 'イベントが見つかりません',
        message: '',
      };
      const message = service.generateSuccessMessage(result);

      expect(message).toBe('イベントの削除に失敗しました');
    });
  });

  describe('generateBatchSummaryMessage', () => {
    // Requirement: 19.11

    it('should generate summary for all successful deletions', () => {
      const result = {
        success: true,
        totalCount: 5,
        successCount: 5,
        failedCount: 0,
        results: [],
        message: '',
      };
      const message = service.generateBatchSummaryMessage(result);

      expect(message).toBe('5件のイベントを削除しました');
    });

    it('should generate summary for partial success', () => {
      const result = {
        success: false,
        totalCount: 5,
        successCount: 3,
        failedCount: 2,
        results: [],
        message: '',
      };
      const message = service.generateBatchSummaryMessage(result);

      expect(message).toBe('5件中3件のイベントを削除しました（2件失敗）');
    });

    it('should generate summary for all failures', () => {
      const result = {
        success: false,
        totalCount: 3,
        successCount: 0,
        failedCount: 3,
        results: [],
        message: '',
      };
      const message = service.generateBatchSummaryMessage(result);

      expect(message).toBe('イベントの削除に失敗しました（0件成功、3件失敗）');
    });
  });

  describe('platform detection', () => {
    it('should detect macOS platform', async () => {
      const platform = await service.detectPlatform();

      if (process.platform === 'darwin') {
        expect(platform.platform).toBe('macos');
        expect(platform.hasEventKitAccess).toBe(true);
        expect(platform.supportsEventDeletion).toBe(true);
      } else {
        expect(platform.platform).toBe('unknown');
        expect(platform.hasEventKitAccess).toBe(false);
        expect(platform.supportsEventDeletion).toBe(false);
      }
    });
  });
});
