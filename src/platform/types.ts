/**
 * Platform Types
 * Defines types for multi-platform support
 * Requirements: 7.1, 7.2, 7.3
 *
 * 現行実装: desktop_mcp（Claude Desktop/Code）
 * 将来対応予定: ios_skills, ipados_skills, web_skills
 * （Claude Skills APIがデバイスAPIへのアクセスを提供した時点で実装）
 */

/**
 * Platform type enumeration
 */
export type PlatformType = 'desktop_mcp' | 'ios_skills' | 'ipados_skills' | 'web_skills';

/**
 * Platform information
 */
export interface PlatformInfo {
  type: PlatformType;
  version: string;
  capabilities: PlatformCapability[];
  nativeIntegrations: string[];
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
 * Permission status for native integrations
 */
export interface PermissionStatus {
  reminders: 'granted' | 'denied' | 'not_determined';
  calendar: 'granted' | 'denied' | 'not_determined';
  notion: 'granted' | 'denied' | 'not_determined';
  canRequestPermission: boolean;
}

/**
 * Platform-specific configuration
 */
export interface PlatformSpecificConfig {
  type: PlatformType;
  nativeIntegrationsEnabled: boolean;
  fallbackMethods: string[];
  permissionsGranted: Record<string, boolean>;
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
 * Native integration service interface
 * Used for iOS/iPadOS native integrations
 */
export interface NativeIntegrationService {
  /**
   * Create a reminder using native API
   */
  createReminder(request: NativeReminderRequest): Promise<NativeReminderResult>;

  /**
   * Fetch calendar events using native API
   */
  fetchCalendarEvents(startDate: string, endDate: string): Promise<NativeCalendarEvent[]>;

  /**
   * Create a Notion page using Connector API
   */
  createNotionPage(request: NativeNotionRequest): Promise<NativeNotionResult>;

  /**
   * Check permission status
   */
  checkPermissions(): Promise<PermissionStatus>;

  /**
   * Request permissions from user
   */
  requestPermissions(): Promise<PermissionStatus>;
}

/**
 * Native reminder request
 */
export interface NativeReminderRequest {
  title: string;
  notes?: string;
  dueDate?: string;
  list?: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Native reminder result
 */
export interface NativeReminderResult {
  success: boolean;
  method: 'native' | 'applescript' | 'fallback';
  reminderId?: string;
  reminderUrl?: string;
  error?: string;
}

/**
 * Native calendar event
 */
export interface NativeCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  source: string;
}

/**
 * Native Notion page request
 */
export interface NativeNotionRequest {
  databaseId: string;
  title: string;
  properties?: Record<string, unknown>;
  content?: string;
}

/**
 * Native Notion page result
 */
export interface NativeNotionResult {
  success: boolean;
  method: 'connector' | 'mcp' | 'fallback';
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
  SESSION_STORAGE: 'session_storage',
  ICLOUD_SYNC: 'icloud_sync',
  NATIVE_REMINDERS: 'native_reminders',
  NATIVE_CALENDAR: 'native_calendar',
  NOTION_CONNECTOR: 'notion_connector',
} as const;

/**
 * Integration names
 */
export const INTEGRATION_NAMES = {
  APPLESCRIPT: 'applescript',
  NOTION_MCP: 'notion_mcp',
  NOTION_CONNECTOR: 'notion_connector',
  REMINDERS: 'reminders',
  CALENDAR: 'calendar',
} as const;
