/**
 * Platform-adaptive integration type definitions
 *
 * This module provides type definitions for integration strategy decisions
 * based on MCP client capabilities.
 */

/**
 * Client capability information
 *
 * Contains information used for integration strategy decisions.
 */
export interface ClientCapabilityInfo {
  /** Whether the client supports MCP Sampling capability */
  supportsSampling: boolean;
  /** Available integration methods for different services */
  availableIntegrations: {
    calendar: {
      /** Google Calendar API available (requires OAuth) */
      google: boolean;
      /** EventKit available (macOS/iOS native) */
      eventkit: boolean;
      /** Native calendar integration via MCP Sampling */
      native: boolean;
      /** @deprecated Use native instead */
      sampling?: boolean;
    };
    reminders: {
      /** AppleScript available (macOS only) */
      applescript: boolean;
      /** Native reminders integration via MCP Sampling */
      native: boolean;
      /** @deprecated Use native instead */
      sampling?: boolean;
    };
  };
}

/**
 * MCP client capabilities from server initialization
 *
 * This interface represents the capabilities object provided by MCP clients
 * during the initialization handshake.
 */
export interface ClientCapabilities {
  /** Sampling capability - allows server to request LLM completions from client */
  sampling?: Record<string, unknown>;
  /** Roots capability - allows server to access client file system roots */
  roots?: {
    listChanged?: boolean;
  };
  /** Experimental capabilities */
  experimental?: Record<string, unknown>;
}

/**
 * Content item for Sampling messages
 */
export interface SamplingTextContent {
  /** Content type - always 'text' for text content */
  type: 'text';
  /** The text content */
  text: string;
}

/**
 * Image content for Sampling messages
 */
export interface SamplingImageContent {
  /** Content type - always 'image' for image content */
  type: 'image';
  /** Base64 encoded image data */
  data: string;
  /** MIME type of the image */
  mimeType: string;
}

/**
 * Union type for all Sampling content types
 */
export type SamplingContent = SamplingTextContent | SamplingImageContent;

/**
 * A message in the Sampling request
 */
export interface SamplingMessage {
  /** Message role - 'user' or 'assistant' */
  role: 'user' | 'assistant';
  /** Message content */
  content: SamplingContent;
}

/**
 * Model preferences for Sampling requests
 */
export interface ModelPreferences {
  /** Hints for model selection */
  hints?: Array<{
    name?: string;
  }>;
  /** Cost priority (0-1, lower = prefer cheaper) */
  costPriority?: number;
  /** Speed priority (0-1, lower = prefer faster) */
  speedPriority?: number;
  /** Intelligence priority (0-1, lower = prefer smarter) */
  intelligencePriority?: number;
}

/**
 * Request to the MCP client for Sampling (LLM completion)
 *
 * This allows the server to leverage the client's LLM capabilities
 * for tasks like natural language analysis.
 */
export interface SamplingRequest {
  /** Messages to send to the LLM */
  messages: SamplingMessage[];
  /** Optional system prompt */
  systemPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** Model preferences */
  modelPreferences?: ModelPreferences;
  /** Stop sequences */
  stopSequences?: string[];
  /** Include context from MCP servers */
  includeContext?: 'none' | 'thisServer' | 'allServers';
  /** Temperature for sampling (0-1) */
  temperature?: number;
  /** Metadata for the request */
  metadata?: Record<string, unknown>;
}

/**
 * Response from the MCP client for Sampling
 */
export interface SamplingResponse {
  /** Generated content from the LLM */
  content: SamplingTextContent;
  /** Model that was used */
  model: string;
  /** Reason for stopping generation */
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | string;
}

/**
 * Error that can occur during Sampling
 */
export interface SamplingError {
  /** Error code */
  code: 'SAMPLING_NOT_SUPPORTED' | 'SAMPLING_REJECTED' | 'SAMPLING_FAILED';
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * Detected platform information (legacy, for backward compatibility)
 * @deprecated Use ClientCapabilityInfo instead
 */
export interface DetectedPlatform {
  /** Platform type */
  platform: 'ios' | 'ipados' | 'macos' | 'desktop' | 'web' | 'unknown';
  /** Whether the client supports Sampling */
  supportsSampling: boolean;
  /** Client name (e.g., "Claude for iOS") */
  clientName?: string;
  /** Client version */
  clientVersion?: string;
  /** Detection confidence (0-1) */
  detectionConfidence?: number;
}

/**
 * Platform type alias (legacy)
 * @deprecated Use DetectedPlatform instead
 */
export type Platform = DetectedPlatform;

/**
 * Platform information (legacy)
 * @deprecated Use ClientCapabilityInfo instead
 */
export interface PlatformInfo {
  platform: DetectedPlatform['platform'];
  supportsSampling: boolean;
  clientName?: string;
  clientVersion?: string;
  availableIntegrations?: ClientCapabilityInfo['availableIntegrations'];
}

/**
 * Calendar integrations type
 */
export interface CalendarIntegrations {
  google: boolean;
  eventkit: boolean;
  native: boolean;
  sampling?: boolean;
}

/**
 * Reminders integrations type
 */
export interface RemindersIntegrations {
  applescript: boolean;
  native: boolean;
  sampling?: boolean;
}

/**
 * Configuration storage interface (legacy, moved from platform/types.ts)
 * Different platforms use different storage mechanisms
 * @deprecated Consider moving to src/types/storage.ts
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
 * Platform type enumeration (legacy, from platform/types.ts)
 * @deprecated Not used in new capability-based system
 */
export type PlatformType = 'desktop_mcp' | 'remote_mcp';
