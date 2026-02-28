/**
 * Google Drive Service Tests
 *
 * Tests for GoogleDriveService transcript discovery and content retrieval.
 */

import type { CalendarEvent } from '../../src/types/google-calendar-types.js';
import type { DriveFile } from '../../src/integrations/google-drive-service.js';

const mockDrive = {
  files: {
    list: jest.fn(),
    export: jest.fn(),
  },
};

jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn().mockReturnValue(mockDrive),
  },
}));

const mockOAuthHandler = {
  getTokens: jest.fn().mockResolvedValue({
    accessToken: 'mock-token',
    refreshToken: 'mock-refresh',
    expiresAt: Date.now() + 3600000,
    scope: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/calendar'],
  }),
  ensureValidToken: jest.fn().mockResolvedValue('mock-token'),
  getOAuth2Client: jest.fn().mockReturnValue({}),
};

jest.mock('../../src/utils/retry.js', () => ({
  retryWithBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

// Must import after mocks are set up
import { GoogleDriveService } from '../../src/integrations/google-drive-service.js';

const testEvent: CalendarEvent = {
  id: 'evt-001',
  title: 'Team Meeting',
  start: '2026-02-28T09:00:00Z',
  end: '2026-02-28T09:30:00Z',
  isAllDay: false,
  source: 'google',
  conferenceData: { conferenceId: 'abc-defg-hij' },
};

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOAuthHandler.getTokens.mockResolvedValue({
      accessToken: 'mock-token',
      refreshToken: 'mock-refresh',
      expiresAt: Date.now() + 3600000,
      scope: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/calendar'],
    });
    mockOAuthHandler.ensureValidToken.mockResolvedValue('mock-token');
    mockOAuthHandler.getOAuth2Client.mockReturnValue({});
    service = new GoogleDriveService(mockOAuthHandler as never);
  });

  describe('findTranscript', () => {
    it('should return null when conferenceData is undefined', async () => {
      const eventWithoutConference: CalendarEvent = {
        ...testEvent,
        conferenceData: undefined,
      };

      const result = await service.findTranscript(eventWithoutConference);
      expect(result).toBeNull();
    });

    it('should return null when conferenceId is undefined', async () => {
      const eventWithoutId: CalendarEvent = {
        ...testEvent,
        conferenceData: {},
      };

      const result = await service.findTranscript(eventWithoutId);
      expect(result).toBeNull();
    });

    it('should search by conferenceId and return DriveFile', async () => {
      const driveFile: DriveFile = {
        id: 'file-1',
        name: 'Transcript abc-defg-hij',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-02-28T09:35:00Z',
      };

      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [driveFile] },
      });

      const result = await service.findTranscript(testEvent);

      expect(result).toEqual(driveFile);
      expect(mockDrive.files.list).toHaveBeenCalledTimes(1);
      expect(mockDrive.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringContaining('abc-defg-hij'),
        }),
      );
    });

    it('should fall back to title search when conferenceId search yields nothing', async () => {
      // First call (conferenceId search) returns empty
      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [] },
      });

      const titleFile: DriveFile = {
        id: 'file-2',
        name: 'Team Meeting Notes',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-02-28T09:40:00Z',
      };

      // Second call (title search) returns result
      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [titleFile] },
      });

      const result = await service.findTranscript(testEvent);

      expect(result).toEqual(titleFile);
      expect(mockDrive.files.list).toHaveBeenCalledTimes(2);
      expect(mockDrive.files.list).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          q: expect.stringContaining('Team Meeting'),
        }),
      );
    });

    it('should return null when both searches find nothing', async () => {
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });

      const result = await service.findTranscript(testEvent);

      expect(result).toBeNull();
      expect(mockDrive.files.list).toHaveBeenCalledTimes(2);
    });

    it('should return latest modifiedTime when multiple results', async () => {
      const olderFile: DriveFile = {
        id: 'file-old',
        name: 'Transcript old',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-02-28T09:30:00Z',
      };

      const newerFile: DriveFile = {
        id: 'file-new',
        name: 'Transcript new',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-02-28T10:00:00Z',
      };

      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [olderFile, newerFile] },
      });

      const result = await service.findTranscript(testEvent);

      expect(result).toEqual(newerFile);
    });
  });

  describe('getFileContent', () => {
    beforeEach(async () => {
      // Initialize the drive client by triggering ensureDriveClient through findTranscript
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      mockDrive.files.list.mockResolvedValueOnce({ data: { files: [] } });
      await service.findTranscript(testEvent);
      jest.clearAllMocks();
    });

    it('should call files.export with text/plain', async () => {
      mockDrive.files.export.mockResolvedValueOnce({
        data: 'Exported document text',
      });

      await service.getFileContent('file-123');

      expect(mockDrive.files.export).toHaveBeenCalledWith({
        fileId: 'file-123',
        mimeType: 'text/plain',
      });
    });

    it('should return exported text content', async () => {
      mockDrive.files.export.mockResolvedValueOnce({
        data: 'Meeting transcript content here',
      });

      const content = await service.getFileContent('file-456');

      expect(content).toBe('Meeting transcript content here');
    });
  });
});
