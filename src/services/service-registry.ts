/**
 * ServiceRegistry
 *
 * Manages reloadable services lifecycle for hot-reload functionality.
 * Provides registration, deregistration, and coordinated re-initialization
 * of services when configuration changes.
 */

import type { ReloadableService } from '../types/hot-reload.js';
import type { UserConfig } from '../types/config.js';
import { servicesLogger } from '../utils/logger.js';

/**
 * Registry for managing reloadable services
 *
 * Services register themselves with the registry and declare which
 * configuration sections they depend on. When those sections change,
 * the registry coordinates shutting down and re-initializing affected services.
 */
export class ServiceRegistry {
  private services: Map<string, ReloadableService> = new Map();

  /**
   * Register a service with the registry
   *
   * @param service - The reloadable service to register
   * @throws Error if a service with the same name is already registered
   */
  register(service: ReloadableService): void {
    if (this.services.has(service.name)) {
      servicesLogger.warn(
        { serviceName: service.name },
        'Service already registered, replacing existing registration'
      );
    }

    this.services.set(service.name, service);
    servicesLogger.info(
      {
        serviceName: service.name,
        dependsOn: service.dependsOnSections,
      },
      'Service registered'
    );
  }

  /**
   * Unregister a service from the registry
   *
   * @param name - The name of the service to unregister
   */
  unregister(name: string): void {
    if (this.services.has(name)) {
      this.services.delete(name);
      servicesLogger.info({ serviceName: name }, 'Service unregistered');
    } else {
      servicesLogger.warn(
        { serviceName: name },
        'Attempted to unregister non-existent service'
      );
    }
  }

  /**
   * Get all services that depend on any of the given configuration sections
   *
   * @param sections - Array of configuration section names
   * @returns Array of services that depend on at least one of the sections
   */
  getServicesForSections(sections: string[]): ReloadableService[] {
    const affectedServices: ReloadableService[] = [];

    for (const service of this.services.values()) {
      const hasMatchingSection = service.dependsOnSections.some((dep) =>
        sections.includes(dep)
      );

      if (hasMatchingSection) {
        affectedServices.push(service);
      }
    }

    return affectedServices;
  }

  /**
   * Reinitialize all services affected by changes in the given sections
   *
   * Shuts down and re-initializes services sequentially to ensure
   * proper ordering and error isolation. Errors in individual services
   * are logged but do not prevent other services from re-initializing.
   *
   * @param sections - Array of changed configuration section names
   * @param config - The new configuration to use for re-initialization
   */
  async reinitializeForSections(
    sections: string[],
    config: UserConfig
  ): Promise<void> {
    const affectedServices = this.getServicesForSections(sections);

    if (affectedServices.length === 0) {
      servicesLogger.debug(
        { sections },
        'No services affected by configuration changes'
      );
      return;
    }

    servicesLogger.info(
      {
        sections,
        serviceCount: affectedServices.length,
        services: affectedServices.map((s) => s.name),
      },
      'Reinitializing services for changed sections'
    );

    for (const service of affectedServices) {
      try {
        servicesLogger.debug(
          { serviceName: service.name },
          'Shutting down service for reinitialize'
        );

        await service.shutdown();

        servicesLogger.debug(
          { serviceName: service.name },
          'Reinitializing service with new config'
        );

        await service.reinitialize(config);

        servicesLogger.info(
          { serviceName: service.name },
          'Service reinitialized successfully'
        );
      } catch (error) {
        // Error isolation: log the error but continue with other services
        servicesLogger.error(
          {
            serviceName: service.name,
            err: error,
          },
          'Failed to reinitialize service'
        );
      }
    }
  }

  /**
   * Gracefully shutdown all registered services
   *
   * Iterates through all services and calls their shutdown method.
   * Errors in individual services are logged but do not prevent
   * other services from shutting down.
   */
  async shutdownAll(): Promise<void> {
    if (this.services.size === 0) {
      servicesLogger.debug('No services to shutdown');
      return;
    }

    servicesLogger.info(
      { serviceCount: this.services.size },
      'Shutting down all services'
    );

    for (const service of this.services.values()) {
      try {
        servicesLogger.debug(
          { serviceName: service.name },
          'Shutting down service'
        );

        await service.shutdown();

        servicesLogger.info(
          { serviceName: service.name },
          'Service shutdown successfully'
        );
      } catch (error) {
        // Error isolation: log the error but continue with other services
        servicesLogger.error(
          {
            serviceName: service.name,
            err: error,
          },
          'Failed to shutdown service'
        );
      }
    }

    servicesLogger.info('All services shutdown complete');
  }

  /**
   * Get the number of registered services
   *
   * @returns The count of registered services
   */
  get size(): number {
    return this.services.size;
  }

  /**
   * Check if a service is registered
   *
   * @param name - The name of the service to check
   * @returns True if the service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get a registered service by name
   *
   * @param name - The name of the service to get
   * @returns The service if registered, undefined otherwise
   */
  get(name: string): ReloadableService | undefined {
    return this.services.get(name);
  }

  /**
   * Get all registered service names
   *
   * @returns Array of registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}
