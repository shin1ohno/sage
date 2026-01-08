/**
 * MCP Handler Context Creation Tests
 *
 * Tests that private context creation methods (SetupContext, TaskToolsContext,
 * CalendarToolsContext, OAuthToolsContext) work correctly through the public API.
 *
 * Since the context methods are private, we test them indirectly through
 * handleRequest with tools/call.
 */

import {
  MCPHandler,
  MCPRequest,
  createMCPHandler,
} from '../../src/cli/mcp-handler.js';
import {
  createMockUserConfig,
  setupGoogleOAuthEnv,
  clearGoogleOAuthEnv,
} from '../utils/mock-config.js';

describe('MCPHandler Context Creation', () => {
  let handler: MCPHandler;

  beforeEach(async () => {
    handler = await createMCPHandler();
  });

  describe('SetupContext', () => {
    describe('through check_setup_status', () => {
      it('should return setup status response', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'check_setup_status',
            arguments: {},
          },
        };

        const response = await handler.handleRequest(request);

        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe(1);
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          content: Array<{ type: string; text: string }>;
        };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');

        // Parse the response to verify structure
        const parsed = JSON.parse(result.content[0].text);
        expect(typeof parsed.setupComplete).toBe('boolean');
        expect(typeof parsed.configExists).toBe('boolean');
      });
    });

    describe('through start_setup_wizard', () => {
      it('should start wizard in quick mode', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'start_setup_wizard',
            arguments: { mode: 'quick' },
          },
        };

        const response = await handler.handleRequest(request);

        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          content: Array<{ type: string; text: string }>;
        };
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.sessionId).toBeDefined();
        expect(parsed.question).toBeDefined();
        expect(parsed.question.id).toBeDefined();
      });

      it('should start wizard in full mode', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'start_setup_wizard',
            arguments: { mode: 'full' },
          },
        };

        const response = await handler.handleRequest(request);

        expect(response.error).toBeUndefined();

        const result = response.result as {
          content: Array<{ type: string; text: string }>;
        };
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.sessionId).toBeDefined();
        expect(parsed.question).toBeDefined();
        expect(parsed.question.id).toBeDefined();
      });
    });
  });

  describe('TaskToolsContext', () => {
    describe('through analyze_tasks', () => {
      it('should return valid response for analyze_tasks', async () => {
        // analyze_tasks returns either success (with config) or error (without config)
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'analyze_tasks',
            arguments: {
              tasks: [{ title: 'Test task' }],
            },
          },
        };

        const response = await handler.handleRequest(request);

        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          content: Array<{ type: string; text: string }>;
        };
        const parsed = JSON.parse(result.content[0].text);

        // Response should be either success or error depending on config availability
        if (parsed.success) {
          // With config: successful analysis
          expect(parsed.summary).toBeDefined();
          expect(parsed.tasks).toBeDefined();
          expect(Array.isArray(parsed.tasks)).toBe(true);
        } else {
          // Without config: error message
          expect(parsed.error).toBe(true);
          expect(parsed.message).toContain('check_setup_status');
        }
      });

      it('should accept valid task input structure', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'analyze_tasks',
            arguments: {
              tasks: [
                { title: 'Task 1', description: 'Description 1' },
                { title: 'Task 2', deadline: '2025-12-31' },
              ],
            },
          },
        };

        const response = await handler.handleRequest(request);

        // Should not have JSON-RPC error
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
      });
    });
  });

  describe('CalendarToolsContext', () => {
    describe('through list_calendar_events', () => {
      it('should return error when config is not set', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'list_calendar_events',
            arguments: {
              startDate: '2025-01-01',
              endDate: '2025-01-31',
            },
          },
        };

        const response = await handler.handleRequest(request);

        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          content: Array<{ type: string; text: string }>;
        };
        const parsed = JSON.parse(result.content[0].text);

        // Should return error about missing config or calendar source
        expect(parsed.error).toBe(true);
      });

      it('should accept valid date range input', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'list_calendar_events',
            arguments: {
              startDate: '2025-01-15',
              endDate: '2025-01-20',
              calendarId: 'test-calendar',
            },
          },
        };

        const response = await handler.handleRequest(request);

        // Should not have JSON-RPC level error
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
      });
    });

    describe('through list_calendar_sources', () => {
      it('should return available calendar sources', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {
            name: 'list_calendar_sources',
            arguments: {},
          },
        };

        const response = await handler.handleRequest(request);

        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          content: Array<{ type: string; text: string }>;
        };
        expect(result.content[0].type).toBe('text');
      });
    });
  });

  describe('OAuthToolsContext', () => {
    describe('through authenticate_google', () => {
      it('should return error when OAuth env vars are not set', async () => {
        // Ensure env vars are cleared
        clearGoogleOAuthEnv();

        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'authenticate_google',
            arguments: {},
          },
        };

        const response = await handler.handleRequest(request);

        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();

        const result = response.result as {
          content: Array<{ type: string; text: string }>;
        };
        const parsed = JSON.parse(result.content[0].text);

        // Should return error about missing OAuth config
        expect(parsed.success).toBe(false);
        expect(parsed.error).toBeDefined();
      });

      describe('with OAuth env vars set', () => {
        beforeEach(() => {
          setupGoogleOAuthEnv();
        });

        afterEach(() => {
          clearGoogleOAuthEnv();
        });

        it('should attempt authentication when env vars are set', async () => {
          // Create new handler after setting env vars
          const handlerWithEnv = await createMCPHandler();

          const request: MCPRequest = {
            jsonrpc: '2.0',
            id: 10,
            method: 'tools/call',
            params: {
              name: 'authenticate_google',
              arguments: {
                force: false,
                timeout: 1, // Short timeout to fail fast
              },
            },
          };

          const response = await handlerWithEnv.handleRequest(request);

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          // The response should be structured (either success or error)
          const result = response.result as {
            content: Array<{ type: string; text: string }>;
          };
          expect(result.content).toBeDefined();
          expect(result.content[0].type).toBe('text');
        }, 15000); // Extended timeout for OAuth initialization
      });
    });
  });
});

describe('MCPHandler mock config utility', () => {
  it('should create valid mock user config', () => {
    const config = createMockUserConfig();

    expect(config.user).toBeDefined();
    expect(config.user.name).toBe('Test User');
    expect(config.calendar).toBeDefined();
    expect(config.calendar.workingHours).toBeDefined();
    expect(config.priorityRules).toBeDefined();
    expect(config.integrations).toBeDefined();
    expect(config.preferences).toBeDefined();
  });
});
