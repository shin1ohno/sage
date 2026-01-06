/**
 * Browser Opener Tests
 * Requirements: FR-3 (Browser Opening)
 */

import { openBrowser, getBrowserCommand } from '../../../src/utils/browser-opener.js';
import { exec } from 'child_process';

// Mock child_process.exec
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;

describe('BrowserOpener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBrowserCommand', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
    });

    it('should return "open" command for macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const command = getBrowserCommand('https://example.com');

      expect(command).toBe('open "https://example.com"');
    });

    it('should return "start" command for Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const command = getBrowserCommand('https://example.com');

      expect(command).toBe('start "" "https://example.com"');
    });

    it('should return "xdg-open" command for Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const command = getBrowserCommand('https://example.com');

      expect(command).toBe('xdg-open "https://example.com"');
    });

    it('should default to xdg-open for unknown platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });

      const command = getBrowserCommand('https://example.com');

      expect(command).toBe('xdg-open "https://example.com"');
    });
  });

  describe('openBrowser', () => {
    it('should return success when command succeeds', async () => {
      // Mock successful execution
      mockExec.mockImplementation((_cmd, callback) => {
        if (callback) {
          (callback as any)(null, '', '');
        }
        return {} as any;
      });

      const result = await openBrowser('https://example.com');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error when command fails', async () => {
      // Mock failed execution
      mockExec.mockImplementation((_cmd, callback) => {
        if (callback) {
          (callback as any)(new Error('Command not found'), '', '');
        }
        return {} as any;
      });

      const result = await openBrowser('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to open browser');
    });

    it('should properly quote URLs with special characters', async () => {
      mockExec.mockImplementation((_cmd, callback) => {
        if (callback) {
          (callback as any)(null, '', '');
        }
        return {} as any;
      });

      await openBrowser('https://example.com?param=value&other=123');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com?param=value&other=123'),
        expect.any(Function)
      );
    });
  });
});
