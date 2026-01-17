/**
 * MCP Sampling capability type definitions
 *
 * This module provides type definitions for MCP Sampling requests/responses.
 * Sampling allows the MCP server to request LLM completions from the client.
 */

/**
 * Client information detected during MCP initialization
 *
 * This simplified interface replaces the legacy DetectedPlatform type.
 * The server only needs to know:
 * 1. Client capability: Does the client support MCP Sampling?
 * 2. Client identification for logging purposes
 *
 * Platform-specific behavior is determined by:
 * - supportsSampling → use Sampling for native integrations
 * - process.platform === 'darwin' → EventKit/AppleScript available (server-side check)
 */
export interface ClientInfo {
  /** Whether the client supports MCP Sampling capability */
  supportsSampling: boolean;
  /** Client name (e.g., "Claude for iOS", "Claude Desktop") */
  clientName?: string;
  /** Client version */
  clientVersion?: string;
}

/**
 * Detect client info from MCP capabilities
 *
 * Creates a ClientInfo object by checking if the client supports Sampling.
 *
 * @param capabilities - MCP client capabilities from initialization
 * @param clientVersion - Optional client version info
 * @returns ClientInfo with sampling support status
 */
export function detectClientInfo(
  capabilities: Record<string, unknown>,
  clientVersion?: { name?: string; version?: string }
): ClientInfo {
  // Check if client supports Sampling capability
  const supportsSampling = capabilities?.sampling !== undefined;

  return {
    supportsSampling,
    clientName: clientVersion?.name,
    clientVersion: clientVersion?.version,
  };
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
