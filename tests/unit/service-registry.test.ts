/**
 * ServiceRegistry Unit Tests
 *
 * Tests for service lifecycle management and hot-reload coordination.
 */

import { ServiceRegistry } from '../../src/services/service-registry.js';
import type { ReloadableService } from '../../src/types/hot-reload.js';
import type { UserConfig } from '../../src/types/config.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';

// Mock service implementation for testing
function createMockService(
  name: string,
  dependsOnSections: string[],
  options?: {
    shutdownError?: Error;
    reinitializeError?: Error;
  }
): ReloadableService & {
  shutdownCalled: boolean;
  reinitializeCalled: boolean;
  lastConfig: UserConfig | null;
} {
  const service = {
    name,
    dependsOnSections,
    shutdownCalled: false,
    reinitializeCalled: false,
    lastConfig: null as UserConfig | null,
    async shutdown() {
      if (options?.shutdownError) {
        throw options.shutdownError;
      }
      this.shutdownCalled = true;
    },
    async reinitialize(config: UserConfig) {
      if (options?.reinitializeError) {
        throw options.reinitializeError;
      }
      this.reinitializeCalled = true;
      this.lastConfig = config;
    },
  };
  return service;
}

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  describe('register', () => {
    it('should register a service', () => {
      const service = createMockService('test-service', ['calendar']);

      registry.register(service);

      expect(registry.has('test-service')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should allow registering multiple services', () => {
      const service1 = createMockService('service-1', ['calendar']);
      const service2 = createMockService('service-2', ['integrations']);

      registry.register(service1);
      registry.register(service2);

      expect(registry.size).toBe(2);
      expect(registry.has('service-1')).toBe(true);
      expect(registry.has('service-2')).toBe(true);
    });

    it('should replace service with same name', () => {
      const service1 = createMockService('same-name', ['calendar']);
      const service2 = createMockService('same-name', ['integrations']);

      registry.register(service1);
      registry.register(service2);

      expect(registry.size).toBe(1);
      const registered = registry.get('same-name');
      expect(registered?.dependsOnSections).toEqual(['integrations']);
    });
  });

  describe('unregister', () => {
    it('should unregister an existing service', () => {
      const service = createMockService('test-service', ['calendar']);
      registry.register(service);

      registry.unregister('test-service');

      expect(registry.has('test-service')).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('should handle unregistering non-existent service gracefully', () => {
      // Should not throw
      expect(() => registry.unregister('non-existent')).not.toThrow();
    });
  });

  describe('getServicesForSections', () => {
    it('should return services that depend on given sections', () => {
      const calendarService = createMockService('calendar-service', ['calendar']);
      const integrationsService = createMockService('integrations-service', ['integrations']);
      const multiService = createMockService('multi-service', ['calendar', 'user']);

      registry.register(calendarService);
      registry.register(integrationsService);
      registry.register(multiService);

      const affected = registry.getServicesForSections(['calendar']);

      expect(affected).toHaveLength(2);
      expect(affected.map((s) => s.name).sort()).toEqual(['calendar-service', 'multi-service']);
    });

    it('should return empty array when no services match', () => {
      const service = createMockService('test-service', ['calendar']);
      registry.register(service);

      const affected = registry.getServicesForSections(['nonexistent']);

      expect(affected).toHaveLength(0);
    });

    it('should handle multiple sections', () => {
      const calendarService = createMockService('calendar-service', ['calendar']);
      const userService = createMockService('user-service', ['user']);
      const otherService = createMockService('other-service', ['preferences']);

      registry.register(calendarService);
      registry.register(userService);
      registry.register(otherService);

      const affected = registry.getServicesForSections(['calendar', 'user']);

      expect(affected).toHaveLength(2);
      expect(affected.map((s) => s.name).sort()).toEqual(['calendar-service', 'user-service']);
    });
  });

  describe('reinitializeForSections', () => {
    const testConfig: UserConfig = {
      ...DEFAULT_CONFIG,
      user: {
        name: 'Test User',
        timezone: 'UTC',
      },
    };

    it('should shutdown and reinitialize affected services', async () => {
      const service1 = createMockService('service-1', ['calendar']);
      const service2 = createMockService('service-2', ['integrations']);

      registry.register(service1);
      registry.register(service2);

      await registry.reinitializeForSections(['calendar'], testConfig);

      expect(service1.shutdownCalled).toBe(true);
      expect(service1.reinitializeCalled).toBe(true);
      expect(service1.lastConfig).toBe(testConfig);

      expect(service2.shutdownCalled).toBe(false);
      expect(service2.reinitializeCalled).toBe(false);
    });

    it('should do nothing when no services are affected', async () => {
      const service = createMockService('test-service', ['calendar']);
      registry.register(service);

      await registry.reinitializeForSections(['nonexistent'], testConfig);

      expect(service.shutdownCalled).toBe(false);
      expect(service.reinitializeCalled).toBe(false);
    });

    it('should continue reinitializing other services when one fails shutdown', async () => {
      const failingService = createMockService('failing-service', ['calendar'], {
        shutdownError: new Error('Shutdown failed'),
      });
      const workingService = createMockService('working-service', ['calendar']);

      registry.register(failingService);
      registry.register(workingService);

      // Should not throw despite individual service failure
      await expect(
        registry.reinitializeForSections(['calendar'], testConfig)
      ).resolves.not.toThrow();

      // Working service should still be processed
      expect(workingService.shutdownCalled).toBe(true);
      expect(workingService.reinitializeCalled).toBe(true);
    });

    it('should continue reinitializing other services when one fails reinitialize', async () => {
      const failingService = createMockService('failing-service', ['calendar'], {
        reinitializeError: new Error('Reinitialize failed'),
      });
      const workingService = createMockService('working-service', ['calendar']);

      registry.register(failingService);
      registry.register(workingService);

      // Should not throw despite individual service failure
      await expect(
        registry.reinitializeForSections(['calendar'], testConfig)
      ).resolves.not.toThrow();

      // Working service should still be processed
      expect(workingService.shutdownCalled).toBe(true);
      expect(workingService.reinitializeCalled).toBe(true);
    });
  });

  describe('shutdownAll', () => {
    it('should shutdown all registered services', async () => {
      const service1 = createMockService('service-1', ['calendar']);
      const service2 = createMockService('service-2', ['integrations']);

      registry.register(service1);
      registry.register(service2);

      await registry.shutdownAll();

      expect(service1.shutdownCalled).toBe(true);
      expect(service2.shutdownCalled).toBe(true);
    });

    it('should handle empty registry gracefully', async () => {
      await expect(registry.shutdownAll()).resolves.not.toThrow();
    });

    it('should continue shutting down other services when one fails', async () => {
      const failingService = createMockService('failing-service', ['calendar'], {
        shutdownError: new Error('Shutdown failed'),
      });
      const workingService = createMockService('working-service', ['integrations']);

      registry.register(failingService);
      registry.register(workingService);

      // Should not throw despite individual service failure
      await expect(registry.shutdownAll()).resolves.not.toThrow();

      // Working service should still be shutdown
      expect(workingService.shutdownCalled).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('should return correct size', () => {
      expect(registry.size).toBe(0);

      registry.register(createMockService('service-1', []));
      expect(registry.size).toBe(1);

      registry.register(createMockService('service-2', []));
      expect(registry.size).toBe(2);

      registry.unregister('service-1');
      expect(registry.size).toBe(1);
    });

    it('should check if service exists with has()', () => {
      const service = createMockService('test-service', []);
      registry.register(service);

      expect(registry.has('test-service')).toBe(true);
      expect(registry.has('non-existent')).toBe(false);
    });

    it('should get service by name', () => {
      const service = createMockService('test-service', ['calendar']);
      registry.register(service);

      const retrieved = registry.get('test-service');
      expect(retrieved).toBe(service);
      expect(registry.get('non-existent')).toBeUndefined();
    });

    it('should return all service names', () => {
      registry.register(createMockService('service-a', []));
      registry.register(createMockService('service-b', []));
      registry.register(createMockService('service-c', []));

      const names = registry.getServiceNames();
      expect(names.sort()).toEqual(['service-a', 'service-b', 'service-c']);
    });
  });
});
