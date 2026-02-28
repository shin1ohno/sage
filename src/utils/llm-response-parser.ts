/**
 * LLM Response Parser
 * Extracts JSON from LLM responses that may be wrapped in markdown code blocks.
 */

import { createLogger } from './logger.js';

const logger = createLogger('llm-response-parser');

/**
 * Extract JSON from an LLM response text.
 * Handles responses wrapped in markdown code blocks (```json ... ```)
 * as well as raw JSON strings.
 */
export function extractJsonFromLlmResponse(text: string): unknown {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] || text).trim();
  return JSON.parse(jsonStr);
}

export interface ExtractedMeetingContent {
  summary: string;
  actionItems: Array<{ description: string; assignee?: string; dueDate?: string }>;
  sourceLanguage: string;
}

/**
 * Parse the extraction response from the LLM.
 * Expects JSON with summary, actionItems[], and sourceLanguage.
 */
export function parseExtractResponse(text: string): ExtractedMeetingContent {
  try {
    const parsed = extractJsonFromLlmResponse(text) as Record<string, unknown>;
    return {
      summary: (parsed.summary as string) || '',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      sourceLanguage: (parsed.sourceLanguage as string) || 'en',
    };
  } catch {
    logger.warn('Failed to parse extraction response as JSON, using raw text as summary');
    return {
      summary: text,
      actionItems: [],
      sourceLanguage: 'en',
    };
  }
}
