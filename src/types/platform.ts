/**
 * MCP client capability type definitions
 *
 * This module provides type definitions for MCP client capabilities
 * received during server initialization.
 */

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
