/**
 * Hybrid Integration System
 * Coordinates Remote MCP and Native integrations across platforms
 * Requirement: 12.5
 */

export type Platform = 'macos' | 'ios' | 'ipados' | 'web' | 'unknown';
export type IntegrationType = 'native' | 'remote' | 'mcp' | 'unavailable';
export type ServiceType = 'reminders' | 'calendar' | 'notion';

/**
 * Platform capabilities for each service
 */
export interface PlatformCapabilities {
  reminders: IntegrationType;
  calendar: IntegrationType;
  notion: IntegrationType;
}

/**
 * Integration strategy for a service
 */
export interface IntegrationStrategy {
  primary: IntegrationType;
  fallback?: IntegrationType;
  options?: Record<string, unknown>;
}

/**
 * Task execution request
 */
export interface TaskExecutionRequest {
  type: string;
  platform: Platform;
  payload: Record<string, unknown>;
}

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  success: boolean;
  attempted: IntegrationType[];
  result?: unknown;
  error?: string;
}

/**
 * Platform coordination plan
 */
export interface CoordinationPlan {
  platforms: Platform[];
  syncStrategy: 'real-time' | 'eventual' | 'manual';
  conflictResolution: 'last-write-wins' | 'merge' | 'manual';
  syncInterval?: number;
}

/**
 * Integration Capability class
 * Represents a capability with priority
 */
export class IntegrationCapability {
  constructor(
    public readonly type: IntegrationType,
    public readonly service: ServiceType,
    public readonly priority: number
  ) {}

  /**
   * Check if this capability is preferred over another
   */
  isPreferredOver(other: IntegrationCapability): boolean {
    return this.priority > other.priority;
  }
}

/**
 * Hybrid Integration Manager
 * Coordinates between native and remote integrations
 */
export class HybridIntegrationManager {
  private capabilityMap: Map<Platform, PlatformCapabilities>;

  constructor() {
    this.capabilityMap = this.initializeCapabilityMap();
  }

  /**
   * Initialize capability map for all platforms
   */
  private initializeCapabilityMap(): Map<Platform, PlatformCapabilities> {
    const map = new Map<Platform, PlatformCapabilities>();

    // macOS: Native AppleScript for Reminders/Calendar, MCP for Notion
    map.set('macos', {
      reminders: 'native',
      calendar: 'native',
      notion: 'mcp',
    });

    // iOS: Native integration for Reminders/Calendar, Remote for Notion
    map.set('ios', {
      reminders: 'native',
      calendar: 'native',
      notion: 'remote',
    });

    // iPadOS: Same as iOS
    map.set('ipados', {
      reminders: 'native',
      calendar: 'native',
      notion: 'remote',
    });

    // Web: All remote
    map.set('web', {
      reminders: 'remote',
      calendar: 'remote',
      notion: 'remote',
    });

    // Unknown: All unavailable
    map.set('unknown', {
      reminders: 'unavailable',
      calendar: 'unavailable',
      notion: 'unavailable',
    });

    return map;
  }

  /**
   * Detect available capabilities for a platform
   */
  detectCapabilities(platform: Platform): PlatformCapabilities {
    return (
      this.capabilityMap.get(platform) || {
        reminders: 'unavailable',
        calendar: 'unavailable',
        notion: 'unavailable',
      }
    );
  }

  /**
   * Select the best integration strategy for a service on a platform
   */
  selectStrategy(service: ServiceType, platform: Platform): IntegrationStrategy {
    const capabilities = this.detectCapabilities(platform);
    const primaryType = capabilities[service];

    // Define fallback based on primary type
    let fallback: IntegrationType | undefined;

    if (primaryType === 'native') {
      fallback = 'remote';
    } else if (primaryType === 'mcp') {
      fallback = 'remote';
    }

    return {
      primary: primaryType,
      fallback: fallback !== primaryType ? fallback : undefined,
    };
  }

  /**
   * Execute a task using the hybrid integration system
   */
  async executeTask(request: TaskExecutionRequest): Promise<TaskExecutionResult> {
    const attempted: IntegrationType[] = [];
    const { type, platform, payload } = request;

    // Determine service type from task type
    const service = this.getServiceFromTaskType(type);
    const strategy = this.selectStrategy(service, platform);

    // Try primary integration
    attempted.push(strategy.primary);

    try {
      if (strategy.primary === 'native') {
        const result = await this.executeNative(type, payload);
        return { success: true, attempted, result };
      } else if (strategy.primary === 'remote') {
        const result = await this.executeRemote(type, payload);
        return { success: true, attempted, result };
      } else if (strategy.primary === 'mcp') {
        const result = await this.executeMCP(type, payload);
        return { success: true, attempted, result };
      }
    } catch (error) {
      // Try fallback if available
      if (strategy.fallback) {
        attempted.push(strategy.fallback);
        try {
          if (strategy.fallback === 'remote') {
            const result = await this.executeRemote(type, payload);
            return { success: true, attempted, result };
          }
        } catch (fallbackError) {
          return {
            success: false,
            attempted,
            error: `All integrations failed. Last error: ${(fallbackError as Error).message}`,
          };
        }
      }

      return {
        success: false,
        attempted,
        error: (error as Error).message,
      };
    }

    return {
      success: false,
      attempted,
      error: 'Unknown integration type',
    };
  }

  /**
   * Plan coordination between multiple platforms
   */
  planCoordination(platforms: Platform[]): CoordinationPlan {
    // Determine sync strategy based on platform mix
    const hasRemoteOnly = platforms.some((p) => p === 'web');
    const hasNative = platforms.some((p) => ['macos', 'ios', 'ipados'].includes(p));

    let syncStrategy: 'real-time' | 'eventual' | 'manual';
    if (hasRemoteOnly && hasNative) {
      syncStrategy = 'eventual';
    } else if (hasNative) {
      syncStrategy = 'real-time';
    } else {
      syncStrategy = 'manual';
    }

    return {
      platforms,
      syncStrategy,
      conflictResolution: 'last-write-wins',
      syncInterval: syncStrategy === 'eventual' ? 60000 : undefined,
    };
  }

  /**
   * Get service type from task type
   */
  private getServiceFromTaskType(taskType: string): ServiceType {
    if (taskType.includes('reminder')) {
      return 'reminders';
    } else if (taskType.includes('calendar') || taskType.includes('event')) {
      return 'calendar';
    } else if (taskType.includes('notion') || taskType.includes('page')) {
      return 'notion';
    }
    return 'reminders'; // Default
  }

  /**
   * Execute task using native integration
   */
  private async executeNative(
    _type: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    // This would call the appropriate native service
    // In production, this connects to AppleRemindersService, CalendarService, etc.
    return {
      method: 'native',
      payload,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute task using remote MCP server
   */
  private async executeRemote(
    _type: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    // This would call the Remote MCP server
    return {
      method: 'remote',
      payload,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute task using MCP client
   */
  private async executeMCP(
    _type: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    // This would call the MCP client (e.g., Notion MCP)
    return {
      method: 'mcp',
      payload,
      timestamp: new Date().toISOString(),
    };
  }
}
