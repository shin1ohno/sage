/**
 * MCP Sampling capability type definitions
 *
 * This module provides type definitions for MCP Sampling requests/responses.
 * Sampling allows the MCP server to request LLM completions from the client.
 */

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
