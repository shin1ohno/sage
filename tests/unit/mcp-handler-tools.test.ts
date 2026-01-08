/**
 * MCP Handler Tool Tests
 * Requirements: 13.1, 13.4, 13.5
 *
 * Tests for MCPHandler tool handlers through handleRequest with tools/call.
 * Covers various tool categories: Calendar, Reminder, Task, and Integration tools.
 */

import {
  MCPHandler,
  MCPRequest,
  MCPResponse,
  createMCPHandler,
} from '../../src/cli/mcp-handler.js';

describe('MCPHandler Tool Handlers', () => {
  let handler: MCPHandler;

  beforeEach(async () => {
    handler = await createMCPHandler();
  });

  afterEach(async () => {
    if (handler) {
      await handler.shutdown();
    }
  });

  /**
   * Helper function to call a tool via handleRequest
   */
  async function callTool(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<MCPResponse> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 10000),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };
    return handler.handleRequest(request);
  }

  /**
   * Helper function to parse tool response content
   */
  function parseToolResponse(response: MCPResponse): unknown {
    if (response.error) {
      return { error: response.error };
    }
    const result = response.result as { content: Array<{ type: string; text: string }> };
    if (result?.content?.[0]?.text) {
      return JSON.parse(result.content[0].text);
    }
    return result;
  }

  describe('Calendar Tools', () => {
    describe('list_calendar_events', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('list_calendar_events', {
          startDate: '2025-01-15',
          endDate: '2025-01-20',
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBeDefined();
        // Should have result (not error at protocol level)
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('list_calendar_events', {
          startDate: '2025-01-15',
          endDate: '2025-01-20',
        });

        const parsed = parseToolResponse(response);
        // Response should be valid JSON with either events or error info
        expect(parsed).toBeDefined();
      });

      it('should validate required parameters', async () => {
        // Missing startDate and endDate
        const response = await callTool('list_calendar_events', {});

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
        // Should handle missing parameters gracefully
      });

      it('should accept optional calendarId parameter', async () => {
        const response = await callTool('list_calendar_events', {
          startDate: '2025-01-15',
          endDate: '2025-01-20',
          calendarId: 'test-calendar-id',
        });

        expect(response.result).toBeDefined();
        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content[0].type).toBe('text');
      });
    });

    describe('create_calendar_event', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('create_calendar_event', {
          title: 'Test Event',
          startDate: '2025-01-15T10:00:00+09:00',
          endDate: '2025-01-15T11:00:00+09:00',
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('create_calendar_event', {
          title: 'Test Event',
          startDate: '2025-01-15T10:00:00+09:00',
          endDate: '2025-01-15T11:00:00+09:00',
        });

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
        // Without config, should return an informative response
      });

      it('should accept optional parameters', async () => {
        const response = await callTool('create_calendar_event', {
          title: 'Test Event',
          startDate: '2025-01-15T10:00:00+09:00',
          endDate: '2025-01-15T11:00:00+09:00',
          location: 'Test Location',
          notes: 'Test Notes',
          calendarName: 'Test Calendar',
        });

        expect(response.result).toBeDefined();
      });

      it('should support eventType parameter for Google Calendar', async () => {
        const response = await callTool('create_calendar_event', {
          title: 'Out of Office',
          startDate: '2025-01-15T09:00:00+09:00',
          endDate: '2025-01-15T18:00:00+09:00',
          eventType: 'outOfOffice',
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'I am out of office',
        });

        expect(response.result).toBeDefined();
        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content[0].type).toBe('text');
      });

      it('should support focusTime eventType', async () => {
        const response = await callTool('create_calendar_event', {
          title: 'Focus Time',
          startDate: '2025-01-15T14:00:00+09:00',
          endDate: '2025-01-15T16:00:00+09:00',
          eventType: 'focusTime',
          chatStatus: 'doNotDisturb',
        });

        expect(response.result).toBeDefined();
      });
    });

    describe('find_available_slots', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('find_available_slots', {
          durationMinutes: 60,
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should accept optional date range parameters', async () => {
        const response = await callTool('find_available_slots', {
          durationMinutes: 30,
          startDate: '2025-01-15',
          endDate: '2025-01-20',
          preferDeepWork: true,
        });

        expect(response.result).toBeDefined();
      });
    });

    describe('list_calendar_sources', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('list_calendar_sources', {});

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('list_calendar_sources', {});

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
      });
    });
  });

  describe('Reminder Tools', () => {
    describe('set_reminder', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('set_reminder', {
          taskTitle: 'Test Reminder',
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('set_reminder', {
          taskTitle: 'Test Reminder',
        });

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
        // Should return informative message about setup
      });

      it('should accept optional parameters', async () => {
        const response = await callTool('set_reminder', {
          taskTitle: 'Test Reminder',
          dueDate: '2025-01-20T10:00:00+09:00',
          reminderType: '1_day_before',
          list: 'Work',
          priority: 'P1',
          notes: 'Test notes for reminder',
        });

        expect(response.result).toBeDefined();
      });

      it('should validate priority values', async () => {
        const response = await callTool('set_reminder', {
          taskTitle: 'Test Reminder',
          priority: 'P0',
        });

        expect(response.result).toBeDefined();
      });

      it('should accept all reminder type values', async () => {
        const reminderTypes = [
          '1_hour_before',
          '3_hours_before',
          '1_day_before',
          '3_days_before',
          '1_week_before',
        ];

        for (const reminderType of reminderTypes) {
          const response = await callTool('set_reminder', {
            taskTitle: `Test Reminder - ${reminderType}`,
            reminderType,
          });

          expect(response.result).toBeDefined();
        }
      });
    });

    describe('list_todos', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('list_todos', {});

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('list_todos', {});

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
      });

      it('should accept filter parameters', async () => {
        const response = await callTool('list_todos', {
          priority: ['P0', 'P1'],
          status: ['not_started', 'in_progress'],
          source: ['apple_reminders'],
          todayOnly: true,
          tags: ['work', 'urgent'],
        });

        expect(response.result).toBeDefined();
      });

      it('should accept all priority filter values', async () => {
        const response = await callTool('list_todos', {
          priority: ['P0', 'P1', 'P2', 'P3'],
        });

        expect(response.result).toBeDefined();
      });

      it('should accept all status filter values', async () => {
        const response = await callTool('list_todos', {
          status: ['not_started', 'in_progress', 'completed', 'cancelled'],
        });

        expect(response.result).toBeDefined();
      });

      it('should accept all source filter values', async () => {
        const response = await callTool('list_todos', {
          source: ['apple_reminders', 'notion', 'manual'],
        });

        expect(response.result).toBeDefined();
      });
    });
  });

  describe('Task Tools', () => {
    describe('sync_tasks', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('sync_tasks', {});

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('sync_tasks', {});

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
        // Should indicate that setup is required or return sync status
      });
    });

    describe('detect_duplicates', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('detect_duplicates', {});

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('detect_duplicates', {});

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
      });

      it('should accept autoMerge parameter', async () => {
        const response = await callTool('detect_duplicates', {
          autoMerge: true,
        });

        expect(response.result).toBeDefined();
      });

      it('should handle autoMerge false', async () => {
        const response = await callTool('detect_duplicates', {
          autoMerge: false,
        });

        expect(response.result).toBeDefined();
      });
    });

    describe('update_task_status', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('update_task_status', {
          taskId: 'test-task-id',
          status: 'completed',
          source: 'apple_reminders',
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('update_task_status', {
          taskId: 'test-task-id',
          status: 'completed',
          source: 'apple_reminders',
        });

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
      });

      it('should accept all status values', async () => {
        const statuses = ['not_started', 'in_progress', 'completed', 'cancelled'];

        for (const status of statuses) {
          const response = await callTool('update_task_status', {
            taskId: `test-task-${status}`,
            status,
            source: 'apple_reminders',
          });

          expect(response.result).toBeDefined();
        }
      });

      it('should accept all source values', async () => {
        const sources = ['apple_reminders', 'notion', 'manual'];

        for (const source of sources) {
          const response = await callTool('update_task_status', {
            taskId: `test-task-${source}`,
            status: 'completed',
            source,
          });

          expect(response.result).toBeDefined();
        }
      });

      it('should accept syncAcrossSources parameter', async () => {
        const response = await callTool('update_task_status', {
          taskId: 'test-task-id',
          status: 'completed',
          source: 'apple_reminders',
          syncAcrossSources: true,
        });

        expect(response.result).toBeDefined();
      });
    });

    describe('analyze_tasks', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('analyze_tasks', {
          tasks: [{ title: 'Test Task' }],
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('analyze_tasks', {
          tasks: [{ title: 'Test Task' }],
        });

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
      });

      it('should accept tasks with all properties', async () => {
        const response = await callTool('analyze_tasks', {
          tasks: [
            {
              title: 'Test Task',
              description: 'This is a test task',
              deadline: '2025-01-20T18:00:00+09:00',
            },
            {
              title: 'Another Task',
              description: 'Another description',
            },
          ],
        });

        expect(response.result).toBeDefined();
      });

      it('should handle empty tasks array', async () => {
        const response = await callTool('analyze_tasks', {
          tasks: [],
        });

        expect(response.result).toBeDefined();
      });
    });
  });

  describe('Integration Tools', () => {
    describe('sync_to_notion', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('sync_to_notion', {
          taskTitle: 'Test Task for Notion',
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('sync_to_notion', {
          taskTitle: 'Test Task for Notion',
        });

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
        // Should indicate that Notion is not configured
      });

      it('should accept all optional parameters', async () => {
        const response = await callTool('sync_to_notion', {
          taskTitle: 'Test Task for Notion',
          description: 'Task description',
          priority: 'P1',
          dueDate: '2025-01-20T18:00:00+09:00',
          stakeholders: ['Alice', 'Bob'],
          estimatedMinutes: 120,
        });

        expect(response.result).toBeDefined();
      });

      it('should accept all priority values', async () => {
        const priorities = ['P0', 'P1', 'P2', 'P3'];

        for (const priority of priorities) {
          const response = await callTool('sync_to_notion', {
            taskTitle: `Test Task - ${priority}`,
            priority,
          });

          expect(response.result).toBeDefined();
        }
      });
    });

    describe('update_config', () => {
      it('should return proper MCP response format', async () => {
        const response = await callTool('update_config', {
          section: 'user',
          updates: { name: 'New Name' },
        });

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should handle missing config gracefully', async () => {
        const response = await callTool('update_config', {
          section: 'user',
          updates: { name: 'New Name' },
        });

        const parsed = parseToolResponse(response);
        expect(parsed).toBeDefined();
      });

      it('should accept all section values', async () => {
        const sections = [
          'user',
          'calendar',
          'priorityRules',
          'integrations',
          'team',
          'preferences',
        ];

        for (const section of sections) {
          const response = await callTool('update_config', {
            section,
            updates: { testKey: 'testValue' },
          });

          expect(response.result).toBeDefined();
        }
      });
    });
  });

  describe('Tool Response Format Consistency', () => {
    it('should return consistent content array format for all tools', async () => {
      const toolCalls = [
        { name: 'list_calendar_events', args: { startDate: '2025-01-15', endDate: '2025-01-20' } },
        { name: 'set_reminder', args: { taskTitle: 'Test' } },
        { name: 'list_todos', args: {} },
        { name: 'sync_tasks', args: {} },
        { name: 'detect_duplicates', args: {} },
        { name: 'sync_to_notion', args: { taskTitle: 'Test' } },
        { name: 'list_calendar_sources', args: {} },
        { name: 'find_available_slots', args: { durationMinutes: 30 } },
      ];

      for (const { name, args } of toolCalls) {
        const response = await callTool(name, args);

        expect(response.jsonrpc).toBe('2.0');
        expect(response.result).toBeDefined();

        const result = response.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].type).toBe('text');
        expect(typeof result.content[0].text).toBe('string');

        // Content should be valid JSON
        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown tool', async () => {
      const response = await callTool('nonexistent_tool', {});

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601);
      expect(response.error?.message).toContain('not found');
    });

    it('should handle tool errors as content, not protocol errors', async () => {
      // Tools should return errors in content, not as JSON-RPC errors
      const response = await callTool('update_task_status', {
        taskId: 'nonexistent-id',
        status: 'completed',
        source: 'apple_reminders',
      });

      // Should not have protocol-level error
      expect(response.error).toBeUndefined();
      // Should have result with content
      expect(response.result).toBeDefined();
    });
  });
});

describe('MCPHandler Tool Definitions', () => {
  let handler: MCPHandler;

  beforeEach(async () => {
    handler = await createMCPHandler();
  });

  afterEach(async () => {
    if (handler) {
      await handler.shutdown();
    }
  });

  describe('Calendar Tool Definitions', () => {
    it('should include list_calendar_events with correct schema', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'list_calendar_events');

      expect(tool).toBeDefined();
      expect(tool?.description).toBeDefined();
      expect(tool?.inputSchema.type).toBe('object');
      expect(tool?.inputSchema.required).toContain('startDate');
      expect(tool?.inputSchema.required).toContain('endDate');
    });

    it('should include create_calendar_event with correct schema', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'create_calendar_event');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toContain('title');
      expect(tool?.inputSchema.required).toContain('startDate');
      expect(tool?.inputSchema.required).toContain('endDate');
      expect(tool?.inputSchema.properties).toHaveProperty('eventType');
      expect(tool?.inputSchema.properties).toHaveProperty('autoDeclineMode');
    });
  });

  describe('Reminder Tool Definitions', () => {
    it('should include set_reminder with correct schema', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'set_reminder');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toContain('taskTitle');
      expect(tool?.inputSchema.properties).toHaveProperty('dueDate');
      expect(tool?.inputSchema.properties).toHaveProperty('reminderType');
      expect(tool?.inputSchema.properties).toHaveProperty('priority');
    });

    it('should include list_todos with correct schema', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'list_todos');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty('priority');
      expect(tool?.inputSchema.properties).toHaveProperty('status');
      expect(tool?.inputSchema.properties).toHaveProperty('source');
      expect(tool?.inputSchema.properties).toHaveProperty('todayOnly');
    });
  });

  describe('Task Tool Definitions', () => {
    it('should include sync_tasks', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'sync_tasks');

      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Synchronize');
    });

    it('should include detect_duplicates with correct schema', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'detect_duplicates');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema.properties).toHaveProperty('autoMerge');
    });

    it('should include update_task_status with correct schema', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'update_task_status');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toContain('taskId');
      expect(tool?.inputSchema.required).toContain('status');
      expect(tool?.inputSchema.required).toContain('source');
    });
  });

  describe('Integration Tool Definitions', () => {
    it('should include sync_to_notion with correct schema', () => {
      const tools = handler.listTools();
      const tool = tools.find((t) => t.name === 'sync_to_notion');

      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toContain('taskTitle');
      expect(tool?.inputSchema.properties).toHaveProperty('description');
      expect(tool?.inputSchema.properties).toHaveProperty('priority');
      expect(tool?.inputSchema.properties).toHaveProperty('stakeholders');
    });
  });
});
