/**
 * Notion MCP Service
 * Platform-adaptive Notion integration
 * - Desktop/Code: MCP経由
 * - iOS/iPadOS: Notion Connector経由
 * - Web: フォールバック（手動コピー）
 * Requirements: 8.1-8.5
 */

import { retryWithBackoff, isRetryableError } from '../utils/retry.js';

// Declare window for browser environment detection
declare const window: any;

/**
 * Default retry options for Notion operations
 */
const RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  shouldRetry: isRetryableError,
};

/**
 * Notion platform info
 */
export interface NotionPlatformInfo {
  platform: 'mcp' | 'connector' | 'web' | 'unknown';
  method: 'mcp' | 'connector' | 'fallback';
  available: boolean;
}

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
  method?: 'mcp' | 'connector' | 'fallback';
  pageId?: string;
  pageUrl?: string;
  error?: string;
  fallbackText?: string;
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
 * Provides platform-adaptive Notion integration
 * - Desktop/Code: MCP経由
 * - iOS/iPadOS: Notion Connector経由
 * - Web: フォールバック
 */
export class NotionMCPService {
  /**
   * Detect the current platform for Notion integration
   */
  async detectPlatform(): Promise<NotionPlatformInfo> {
    // Check for MCP environment (Desktop/Code)
    if (typeof process !== 'undefined' && process.env?.MCP_SERVER === 'true') {
      return {
        platform: 'mcp',
        method: 'mcp',
        available: true,
      };
    }

    // Check for Notion Connector (iOS/iPadOS Skills)
    if (typeof window !== 'undefined' && window.claude?.notion) {
      return {
        platform: 'connector',
        method: 'connector',
        available: true,
      };
    }

    // Web or unknown - fallback only
    return {
      platform: 'web',
      method: 'fallback',
      available: false,
    };
  }

  /**
   * Check if Notion integration is available
   */
  async isAvailable(): Promise<boolean> {
    const platform = await this.detectPlatform();
    return platform.available;
  }

  /**
   * Create a page in Notion
   * Routes to appropriate integration based on platform
   * Requirement: 8.1, 8.2, 8.3
   */
  async createPage(request: NotionPageRequest): Promise<NotionPageResult> {
    const platform = await this.detectPlatform();

    switch (platform.method) {
      case 'mcp':
        return this.createPageViaMCP(request);
      case 'connector':
        return this.createPageViaConnector(request);
      case 'fallback':
      default:
        return {
          success: false,
          method: 'fallback',
          error: 'Notion統合が利用できません。',
          fallbackText: this.generateFallbackTemplate({
            title: request.title,
            ...request.properties,
          }),
        };
    }
  }

  /**
   * Create page via MCP (Desktop/Code)
   */
  private async createPageViaMCP(request: NotionPageRequest): Promise<NotionPageResult> {
    try {
      // Build and validate request format
      this.buildMCPRequest(request);

      // Use retry with exponential backoff for MCP calls
      const result = await retryWithBackoff<{ pageId: string; pageUrl: string }>(
        async () => {
          // TODO: Actually call MCP server when connected
          // return await this.mcpClient.request(mcpRequest);
          throw new Error('MCP統合は実装中です。MCPクライアント接続が必要です。');
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`Notion MCP retry attempt ${attempt}: ${error.message}`);
          },
          shouldRetry: (error) => {
            if (error.message.includes('実装中')) {
              return false;
            }
            return isRetryableError(error);
          },
        }
      );

      return {
        success: true,
        method: 'mcp',
        pageId: result.pageId,
        pageUrl: result.pageUrl,
      };
    } catch (error) {
      return {
        success: false,
        method: 'mcp',
        error: `Notion MCP エラー: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Create page via Notion Connector (iOS/iPadOS Skills)
   * Requirement: 8.1, 8.2
   */
  private async createPageViaConnector(request: NotionPageRequest): Promise<NotionPageResult> {
    try {
      const notionConnector = window.claude?.notion;

      if (!notionConnector) {
        return {
          success: false,
          method: 'connector',
          error: 'Notion Connectorが利用できません',
        };
      }

      // Use retry with exponential backoff
      const result = await retryWithBackoff(
        async () => {
          return await notionConnector.createPage({
            databaseId: request.databaseId,
            title: request.title,
            properties: request.properties,
            content: request.content,
          });
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`Notion Connector retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return {
        success: true,
        method: 'connector',
        pageId: result.id,
        pageUrl: result.url,
      };
    } catch (error) {
      return {
        success: false,
        method: 'connector',
        error: `Notion Connector エラー: ${(error as Error).message}`,
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
