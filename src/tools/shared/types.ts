/**
 * Shared Tool Definition Types
 *
 * Provides a unified way to define MCP tools that can be used in both
 * stdio mode (index.ts) and remote mode (mcp-handler.ts).
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Tool definition that can be used in both modes
 */
export interface SharedToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Zod schema for input validation */
  schema: TSchema;
}

/**
 * JSON Schema format expected by mcp-handler.ts
 */
export interface McpInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Convert a Zod schema to JSON Schema format for mcp-handler.ts
 */
export function toJsonSchema(schema: z.ZodTypeAny): McpInputSchema {
  const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7' }) as Record<string, unknown>;

  // Ensure the result has the expected structure
  return {
    type: 'object',
    properties: (jsonSchema.properties as Record<string, unknown>) || {},
    required: jsonSchema.required as string[] | undefined,
  };
}

/**
 * Create a shared tool definition
 */
export function defineTool<TSchema extends z.ZodTypeAny>(
  name: string,
  description: string,
  schema: TSchema
): SharedToolDefinition<TSchema> {
  return { name, description, schema };
}
