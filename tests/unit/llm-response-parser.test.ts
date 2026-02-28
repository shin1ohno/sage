/**
 * LLM Response Parser Tests
 *
 * Tests for extractJsonFromLlmResponse: raw JSON, markdown code block wrapped JSON,
 * and invalid JSON handling.
 * Tests for parseExtractResponse: successful parsing and JSON parse failure fallback.
 */

import { extractJsonFromLlmResponse, parseExtractResponse } from '../../src/utils/llm-response-parser.js';

describe('extractJsonFromLlmResponse', () => {
  it('parses raw JSON string', () => {
    const input = '{"summary": "test", "items": [1, 2]}';
    const result = extractJsonFromLlmResponse(input);
    expect(result).toEqual({ summary: 'test', items: [1, 2] });
  });

  it('parses JSON wrapped in ```json code block', () => {
    const input = '```json\n{"summary": "wrapped"}\n```';
    const result = extractJsonFromLlmResponse(input);
    expect(result).toEqual({ summary: 'wrapped' });
  });

  it('parses JSON wrapped in ``` code block without json annotation', () => {
    const input = '```\n{"key": "value"}\n```';
    const result = extractJsonFromLlmResponse(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('throws on invalid JSON', () => {
    expect(() => extractJsonFromLlmResponse('not json at all')).toThrow();
  });

  it('handles JSON with surrounding text when wrapped in code block', () => {
    const input = 'Here is the result:\n```json\n{"data": true}\n```\nDone.';
    const result = extractJsonFromLlmResponse(input);
    expect(result).toEqual({ data: true });
  });
});

describe('parseExtractResponse', () => {
  it('parses valid extraction response', () => {
    const input = JSON.stringify({
      summary: 'Meeting about X',
      actionItems: [{ description: 'Do Y', assignee: 'Alice' }],
      sourceLanguage: 'ja',
    });
    const result = parseExtractResponse(input);
    expect(result.summary).toBe('Meeting about X');
    expect(result.actionItems).toHaveLength(1);
    expect(result.actionItems[0].description).toBe('Do Y');
    expect(result.sourceLanguage).toBe('ja');
  });

  it('returns raw text as summary when JSON parsing fails', () => {
    const input = 'This is not JSON';
    const result = parseExtractResponse(input);
    expect(result.summary).toBe('This is not JSON');
    expect(result.actionItems).toEqual([]);
    expect(result.sourceLanguage).toBe('en');
  });

  it('defaults missing fields', () => {
    const input = JSON.stringify({});
    const result = parseExtractResponse(input);
    expect(result.summary).toBe('');
    expect(result.actionItems).toEqual([]);
    expect(result.sourceLanguage).toBe('en');
  });
});
