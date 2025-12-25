/**
 * Platform Types
 * Defines types for multi-platform support
 * Requirements: 7.1, 7.2, 7.3
 *
 * 実装:
 * - desktop_mcp: Claude Desktop/Code（AppleScript統合）
 * - remote_mcp: iOS/iPadOS/Web（Remote MCPサーバー経由）
 */

/**
 * Platform type enumeration
 */
export type PlatformType = 'desktop_mcp' | 'remote_mcp';

/**
 * Platform information
 */
export interface PlatformInfo {
  type: PlatformType;
  version: string;
  capabilities: PlatformCapability[];
  integrations: string[];
}

/**
 * Platform capability definition
 */
export interface PlatformCapability {
  name: string;
  available: boolean;
  requiresPermission: boolean;
  fallbackAvailable: boolean;
}

/**
 * Feature set available on a platform
 */
export interface FeatureSet {
  taskAnalysis: boolean;
  persistentConfig: boolean;
  appleReminders: boolean;
  calendarIntegration: boolean;
  notionIntegration: boolean;
  fileSystemAccess: boolean;
}

/**
 * Platform-specific configuration
 */
export interface PlatformSpecificConfig {
  type: PlatformType;
  fallbackMethods: string[];
}

/**
 * Platform adapter interface
 * All platform-specific implementations must implement this interface
 */
export interface PlatformAdapter {
  /**
   * Get platform information
   */
  getPlatformInfo(): PlatformInfo;

  /**
   * Get available features on this platform
   */
  getAvailableFeatures(): FeatureSet;

  /**
   * Initialize the adapter
   */
  initialize(): Promise<void>;

  /**
   * Check if a specific capability is available
   */
  isCapabilityAvailable(capability: string): boolean;
}

/**
 * Configuration storage interface
 * Different platforms use different storage mechanisms
 */
export interface ConfigStorage {
  /**
   * Load configuration from storage
   */
  load(): Promise<Record<string, unknown> | null>;

  /**
   * Save configuration to storage
   */
  save(config: Record<string, unknown>): Promise<void>;

  /**
   * Check if configuration exists
   */
  exists(): Promise<boolean>;

  /**
   * Delete configuration
   */
  delete(): Promise<void>;
}

/**
 * Reminder request
 */
export interface ReminderRequest {
  title: string;
  notes?: string;
  dueDate?: string;
  list?: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Reminder result
 */
export interface ReminderResult {
  success: boolean;
  method: 'applescript' | 'fallback';
  reminderId?: string;
  reminderUrl?: string;
  error?: string;
}

/**
 * Calendar event
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  source: string;
}

/**
 * Notion page request
 */
export interface NotionRequest {
  databaseId: string;
  title: string;
  properties?: Record<string, unknown>;
  content?: string;
}

/**
 * Notion page result
 */
export interface NotionResult {
  success: boolean;
  method: 'mcp' | 'fallback';
  pageId?: string;
  pageUrl?: string;
  error?: string;
  fallbackText?: string;
}

/**
 * Capability names
 */
export const CAPABILITY_NAMES = {
  FILE_SYSTEM: 'file_system',
  EXTERNAL_PROCESS: 'external_process',
  MCP_INTEGRATION: 'mcp_integration',
  REMOTE_ACCESS: 'remote_access',
  CLOUD_STORAGE: 'cloud_storage',
} as const;

/**
 * Integration names
 */
export const INTEGRATION_NAMES = {
  APPLESCRIPT: 'applescript',
  NOTION_MCP: 'notion_mcp',
  REMOTE_MCP_SERVER: 'remote_mcp_server',
} as const;
