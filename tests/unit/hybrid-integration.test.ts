/**
 * Hybrid Integration System Tests
 * Requirement: 12.5
 * Tests for Remote MCP + Native integration coordination
 */

import { HybridIntegrationManager, IntegrationCapability } from '../../src/remote/hybrid-integration.js';

describe('HybridIntegrationManager', () => {
  let manager: HybridIntegrationManager;

  beforeEach(() => {
    manager = new HybridIntegrationManager();
  });

  describe('Capability Detection', () => {
    it('should detect available capabilities on macOS', () => {
      const capabilities = manager.detectCapabilities('macos');

      expect(capabilities.reminders).toBe('native');
      expect(capabilities.calendar).toBe('native');
      expect(capabilities.notion).toBe('mcp');
    });

    it('should detect available capabilities on iOS', () => {
      const capabilities = manager.detectCapabilities('ios');

      expect(capabilities.reminders).toBe('native');
      expect(capabilities.calendar).toBe('native');
      expect(capabilities.notion).toBe('remote');
    });

    it('should detect available capabilities on web', () => {
      const capabilities = manager.detectCapabilities('web');

      expect(capabilities.reminders).toBe('remote');
      expect(capabilities.calendar).toBe('remote');
      expect(capabilities.notion).toBe('remote');
    });
  });

  describe('Integration Strategy Selection', () => {
    it('should select best integration strategy for reminders', () => {
      const strategy = manager.selectStrategy('reminders', 'macos');

      expect(strategy.primary).toBe('native');
      expect(strategy.fallback).toBe('remote');
    });

    it('should select remote strategy when native is unavailable', () => {
      const strategy = manager.selectStrategy('reminders', 'web');

      expect(strategy.primary).toBe('remote');
      expect(strategy.fallback).toBeUndefined();
    });

    it('should prefer native integration when available', () => {
      const strategy = manager.selectStrategy('calendar', 'ios');

      expect(strategy.primary).toBe('native');
    });
  });

  describe('Hybrid Task Execution', () => {
    it('should execute task using primary integration', async () => {
      const result = await manager.executeTask({
        type: 'create_reminder',
        platform: 'macos',
        payload: {
          title: 'Test Task',
          dueDate: new Date().toISOString(),
        },
      });

      // In test environment, should fall back gracefully
      expect(result).toBeDefined();
      expect(result.attempted).toContain('native');
    });

    it('should fall back to remote when native fails', async () => {
      const result = await manager.executeTask({
        type: 'create_reminder',
        platform: 'web',
        payload: {
          title: 'Test Task',
        },
      });

      expect(result.attempted).toContain('remote');
    });
  });

  describe('Platform Coordination', () => {
    it('should coordinate between multiple platforms', () => {
      const coordination = manager.planCoordination(['macos', 'ios', 'web']);

      expect(coordination.syncStrategy).toBeDefined();
      expect(coordination.platforms).toHaveLength(3);
    });

    it('should identify conflict resolution strategy', () => {
      const coordination = manager.planCoordination(['macos', 'ios']);

      expect(coordination.conflictResolution).toBe('last-write-wins');
    });
  });
});

describe('IntegrationCapability', () => {
  describe('Capability Comparison', () => {
    it('should compare capability priorities', () => {
      const native = new IntegrationCapability('native', 'reminders', 100);
      const remote = new IntegrationCapability('remote', 'reminders', 50);

      expect(native.isPreferredOver(remote)).toBe(true);
      expect(remote.isPreferredOver(native)).toBe(false);
    });

    it('should handle equal priorities', () => {
      const cap1 = new IntegrationCapability('native', 'calendar', 100);
      const cap2 = new IntegrationCapability('native', 'calendar', 100);

      expect(cap1.isPreferredOver(cap2)).toBe(false);
    });
  });
});
