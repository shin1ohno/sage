/**
 * Notion MCP Service
 * MCP-based Notion integration (Desktop/Code only)
 * Requirements: 8.1-8.5
 */

/**
 * Notion page request
 */
export interface NotionPageRequest {
  databaseId: string;
  title: string;
  properties: Record<string, any>;
  content?: NotionBlock[];
}

/**
 * Notion block
 */
export interface NotionBlock {
  type: 'paragraph' | 'heading' | 'bulleted_list_item';
  content: string;
}

/**
 * Notion page result
 */
export interface NotionPageResult {
  success: boolean;
  pageId?: string;
  pageUrl?: string;
  error?: string;
}

/**
 * Task info for template generation
 */
export interface TaskInfo {
  title: string;
  priority?: string;
  deadline?: string;
  stakeholders?: string[];
  estimatedMinutes?: number;
  description?: string;
}

/**
 * MCP request format
 */
export interface MCPRequest {
  method: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
}

/**
 * Notion MCP Service
 * Provides Notion integration via MCP for Desktop/Code environments
 */
export class NotionMCPService {
  /**
   * Check if Notion MCP is available
   * Only available in MCP server environment
   */
  async isAvailable(): Promise<boolean> {
    return typeof process !== 'undefined' && process.env?.MCP_SERVER === 'true';
  }

  /**
   * Create a page in Notion
   * Requirement: 8.1, 8.2, 8.3
   */
  async createPage(request: NotionPageRequest): Promise<NotionPageResult> {
    if (!(await this.isAvailable())) {
      return {
        success: false,
        error: 'Notion MCP統合は現在利用できません。Desktop/Code環境でのみ利用可能です。',
      };
    }

    try {
      // In a real implementation, this would use MCP Client to call Notion MCP server
      // For now, we return a placeholder that indicates MCP integration is needed
      // Build request to validate format
      this.buildMCPRequest(request);

      // TODO: Actually call MCP server
      // const result = await this.mcpClient.request(mcpRequest);

      return {
        success: false,
        error: 'MCP統合は実装中です。MCPクライアント接続が必要です。',
      };
    } catch (error) {
      return {
        success: false,
        error: `Notion MCP エラー: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Build MCP request for Notion page creation
   */
  buildMCPRequest(request: NotionPageRequest): MCPRequest {
    const children = request.content?.map((block) => this.buildNotionBlock(block)) || [];

    return {
      method: 'tools/call',
      params: {
        name: 'create_page',
        arguments: {
          database_id: request.databaseId,
          properties: request.properties,
          children,
        },
      },
    };
  }

  /**
   * Build Notion block format
   */
  private buildNotionBlock(block: NotionBlock): Record<string, any> {
    switch (block.type) {
      case 'paragraph':
        return {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: block.content } }],
          },
        };

      case 'heading':
        return {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: block.content } }],
          },
        };

      case 'bulleted_list_item':
        return {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: block.content } }],
          },
        };

      default:
        return {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: block.content } }],
          },
        };
    }
  }

  /**
   * Build Notion properties format
   */
  buildNotionProperties(taskInfo: TaskInfo): Record<string, any> {
    const properties: Record<string, any> = {
      Name: {
        title: [
          {
            text: {
              content: taskInfo.title,
            },
          },
        ],
      },
    };

    if (taskInfo.priority) {
      properties.Priority = {
        select: {
          name: taskInfo.priority,
        },
      };
    }

    if (taskInfo.deadline) {
      properties.DueDate = {
        date: {
          start: taskInfo.deadline,
        },
      };
    }

    if (taskInfo.estimatedMinutes) {
      properties.EstimatedTime = {
        number: taskInfo.estimatedMinutes,
      };
    }

    if (taskInfo.stakeholders && taskInfo.stakeholders.length > 0) {
      properties.Stakeholders = {
        multi_select: taskInfo.stakeholders.map((s) => ({ name: s })),
      };
    }

    return properties;
  }

  /**
   * Generate fallback template for manual Notion copy
   * Requirement: 8.4
   */
  generateFallbackTemplate(taskInfo: TaskInfo): string {
    let template = `📋 Notionに追加するタスク\n\n`;
    template += `**タイトル:** ${taskInfo.title}\n`;

    if (taskInfo.priority) {
      template += `**優先度:** ${taskInfo.priority}\n`;
    }

    if (taskInfo.deadline) {
      template += `**期限:** ${taskInfo.deadline}\n`;
    }

    if (taskInfo.estimatedMinutes) {
      template += `**見積時間:** ${taskInfo.estimatedMinutes}分\n`;
    }

    if (taskInfo.stakeholders && taskInfo.stakeholders.length > 0) {
      template += `**関係者:** ${taskInfo.stakeholders.join(', ')}\n`;
    }

    if (taskInfo.description) {
      template += `\n**詳細:**\n${taskInfo.description}\n`;
    }

    template += `\n---\nこのテキストをNotionにコピーしてページを作成してください。`;

    return template;
  }

  /**
   * Determine if a task should be synced to Notion based on deadline
   * Requirement: 8.1 (8日以上先のタスク)
   */
  shouldSyncToNotion(deadline: string | undefined, thresholdDays: number = 8): boolean {
    if (!deadline) {
      return false;
    }

    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays >= thresholdDays;
  }
}
