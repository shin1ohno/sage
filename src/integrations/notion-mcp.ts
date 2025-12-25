/**
 * Notion MCP Service
 * Notion integration via MCP Server
 * Requirements: 8.1-8.5
 *
 * 現行実装: Notion MCP Server経由（Desktop/Code）
 * 将来対応予定: iOS/iPadOS Notion Connector統合（Claude Skills APIが対応した時点）
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
 * Notion MCP Client configuration
 */
export interface NotionMCPClientConfig {
  allowedDatabaseIds: string[];
  mcpServerCommand?: string;
  mcpServerArgs?: string[];
}

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
 * Notion query request
 */
export interface NotionQueryRequest {
  databaseId: string;
  filter?: Record<string, any>;
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>;
  pageSize?: number;
}

/**
 * Notion query result
 */
export interface NotionQueryResult {
  success: boolean;
  results?: NotionPageInfo[];
  hasMore?: boolean;
  nextCursor?: string;
  error?: string;
}

/**
 * Notion page info from query
 */
export interface NotionPageInfo {
  id: string;
  title: string;
  properties: Record<string, any>;
  url: string;
  createdTime: string;
  lastEditedTime: string;
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
 * MCP response content
 */
interface MCPResponseContent {
  type: string;
  text: string;
}

/**
 * MCP response format
 */
interface MCPResponse {
  content: MCPResponseContent[];
}

/**
 * Notion MCP Client
 * Handles actual communication with Notion MCP server
 * Enforces database ID restrictions for security
 */
export class NotionMCPClient {
  private config: NotionMCPClientConfig;
  private mcpClient: any = null;
  private connected: boolean = false;

  constructor(config: NotionMCPClientConfig) {
    this.config = config;
  }

  /**
   * Check if a database ID is in the allowed list
   */
  isValidDatabaseId(databaseId: string): boolean {
    if (!databaseId || databaseId.trim() === '') {
      return false;
    }
    return this.config.allowedDatabaseIds.includes(databaseId);
  }

  /**
   * Validate database ID and throw if not allowed
   */
  private validateDatabaseId(databaseId: string): void {
    if (!this.isValidDatabaseId(databaseId)) {
      throw new Error(`Database ID ${databaseId} is not in the allowed list`);
    }
  }

  /**
   * Connect to the Notion MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Dynamic import to avoid issues in environments without MCP SDK
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

      this.mcpClient = new Client(
        {
          name: 'sage-notion-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Note: In a real implementation, we would use StdioClientTransport
      // to connect to the Notion MCP server process.
      // For now, we assume the MCP client is already connected via the
      // MCP host (Claude Desktop/Code) which handles the connection.

      if (this.mcpClient.connect) {
        await this.mcpClient.connect();
      }

      this.connected = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to connect to Notion MCP server: ${message}`);
    }
  }

  /**
   * Disconnect from the Notion MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.mcpClient) {
      return;
    }

    try {
      if (this.mcpClient.close) {
        await this.mcpClient.close();
      }
    } finally {
      this.connected = false;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Create a page in Notion via MCP
   */
  async createPage(request: NotionPageRequest): Promise<NotionPageResult> {
    // Validate database ID first
    this.validateDatabaseId(request.databaseId);

    if (!this.connected || !this.mcpClient) {
      return {
        success: false,
        method: 'mcp',
        error: 'MCP client not connected. Call connect() first.',
      };
    }

    try {
      const result = await retryWithBackoff<NotionPageResult>(
        async () => {
          const mcpRequest = this.buildCreatePageRequest(request);
          const response: MCPResponse = await this.mcpClient.request(mcpRequest);

          return this.parseCreatePageResponse(response);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`Notion MCP createPage retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        method: 'mcp',
        error: `Notion MCP error: ${message}`,
      };
    }
  }

  /**
   * Query a Notion database via MCP
   */
  async queryDatabase(query: NotionQueryRequest): Promise<NotionQueryResult> {
    // Validate database ID first
    this.validateDatabaseId(query.databaseId);

    if (!this.connected || !this.mcpClient) {
      return {
        success: false,
        error: 'MCP client not connected. Call connect() first.',
      };
    }

    try {
      const result = await retryWithBackoff<NotionQueryResult>(
        async () => {
          const mcpRequest = this.buildQueryDatabaseRequest(query);
          const response: MCPResponse = await this.mcpClient.request(mcpRequest);

          return this.parseQueryDatabaseResponse(response);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`Notion MCP queryDatabase retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Notion MCP query error: ${message}`,
      };
    }
  }

  /**
   * Update a Notion page via MCP
   * Requirement: 12.5
   */
  async updatePage(
    pageId: string,
    properties: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.connected || !this.mcpClient) {
      return {
        success: false,
        error: 'MCP client not connected. Call connect() first.',
      };
    }

    try {
      const result = await retryWithBackoff(
        async () => {
          const mcpRequest = this.buildUpdatePageRequest(pageId, properties);
          const response: MCPResponse = await this.mcpClient.request(mcpRequest);
          return this.parseUpdatePageResponse(response);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`Notion MCP updatePage retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Notion MCP update error: ${message}`,
      };
    }
  }

  /**
   * Build MCP request for updating a page
   */
  private buildUpdatePageRequest(
    pageId: string,
    properties: Record<string, any>
  ): MCPRequest {
    return {
      method: 'tools/call',
      params: {
        name: 'notion-update-page',
        arguments: {
          data: {
            page_id: pageId,
            command: 'update_properties',
            properties,
          },
        },
      },
    };
  }

  /**
   * Parse response from updatePage MCP call
   */
  private parseUpdatePageResponse(response: MCPResponse): { success: boolean; error?: string } {
    try {
      const textContent = response.content?.find((c) => c.type === 'text');
      if (!textContent) {
        return {
          success: false,
          error: 'No text content in MCP response',
        };
      }

      // If we got a response, consider it successful
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse MCP response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Build MCP request for creating a page
   */
  private buildCreatePageRequest(request: NotionPageRequest): MCPRequest {
    const children = request.content?.map((block) => this.buildNotionBlock(block)) || [];

    return {
      method: 'tools/call',
      params: {
        name: 'notion-create-pages',
        arguments: {
          parent: {
            type: 'database_id',
            database_id: request.databaseId,
          },
          pages: [
            {
              properties: {
                title: request.title,
                ...request.properties,
              },
              content: children.length > 0 ? this.formatContentForNotion(children) : undefined,
            },
          ],
        },
      },
    };
  }

  /**
   * Format content blocks for Notion markdown format
   */
  private formatContentForNotion(blocks: Record<string, any>[]): string {
    return blocks
      .map((block) => {
        if (block.type === 'paragraph') {
          return block.paragraph?.rich_text?.[0]?.text?.content || '';
        } else if (block.type === 'heading_2') {
          return `## ${block.heading_2?.rich_text?.[0]?.text?.content || ''}`;
        } else if (block.type === 'bulleted_list_item') {
          return `- ${block.bulleted_list_item?.rich_text?.[0]?.text?.content || ''}`;
        }
        return '';
      })
      .join('\n');
  }

  /**
   * Build MCP request for querying a database
   */
  private buildQueryDatabaseRequest(query: NotionQueryRequest): MCPRequest {
    return {
      method: 'tools/call',
      params: {
        name: 'notion-query-data-sources',
        arguments: {
          data: {
            mode: 'sql',
            data_source_urls: [`collection://${query.databaseId}`],
            query: `SELECT * FROM "collection://${query.databaseId}" LIMIT ${query.pageSize || 100}`,
          },
        },
      },
    };
  }

  /**
   * Parse response from createPage MCP call
   */
  private parseCreatePageResponse(response: MCPResponse): NotionPageResult {
    try {
      const textContent = response.content?.find((c) => c.type === 'text');
      if (!textContent) {
        return {
          success: false,
          method: 'mcp',
          error: 'No text content in MCP response',
        };
      }

      const data = JSON.parse(textContent.text);

      return {
        success: true,
        method: 'mcp',
        pageId: data.id || data.pageId,
        pageUrl: data.url || data.pageUrl,
      };
    } catch (error) {
      return {
        success: false,
        method: 'mcp',
        error: `Failed to parse MCP response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Parse response from queryDatabase MCP call
   */
  private parseQueryDatabaseResponse(response: MCPResponse): NotionQueryResult {
    try {
      const textContent = response.content?.find((c) => c.type === 'text');
      if (!textContent) {
        return {
          success: false,
          error: 'No text content in MCP response',
        };
      }

      const data = JSON.parse(textContent.text);

      // Parse results from SQL query response
      const results: NotionPageInfo[] = (data.results || data.rows || []).map((row: any) => ({
        id: row.id || row._id,
        title: row.title || row.Name || row.name || '',
        properties: row,
        url: row.url || `https://notion.so/${row.id}`,
        createdTime: row.created_time || row.createdTime || '',
        lastEditedTime: row.last_edited_time || row.lastEditedTime || '',
      }));

      return {
        success: true,
        results,
        hasMore: data.has_more || false,
        nextCursor: data.next_cursor,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse MCP response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
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
}

/**
 * Notion MCP Service
 * Provides platform-adaptive Notion integration
 * - Desktop/Code: MCP経由
 * - iOS/iPadOS: Notion Connector経由
 * - Web: フォールバック
 */
export class NotionMCPService {
  private mcpClient: NotionMCPClient | null = null;

  /**
   * Set the MCP client for Notion integration
   */
  setMCPClient(client: NotionMCPClient): void {
    this.mcpClient = client;
  }

  /**
   * Get the MCP client
   */
  getMCPClient(): NotionMCPClient | null {
    return this.mcpClient;
  }

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
    // If MCP client is configured, use it
    if (this.mcpClient) {
      try {
        return await this.mcpClient.createPage(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          method: 'mcp',
          error: message,
          fallbackText: this.generateFallbackTemplate({
            title: request.title,
            ...request.properties,
          }),
        };
      }
    }

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
   * Query Notion database
   * Only queries the configured database ID
   */
  async queryDatabase(query: NotionQueryRequest): Promise<NotionQueryResult> {
    if (this.mcpClient) {
      try {
        return await this.mcpClient.queryDatabase(query);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          error: message,
        };
      }
    }

    return {
      success: false,
      error: 'Notion MCP client not configured',
    };
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
   * 🔮 将来対応予定: Claude Skills APIがデバイスAPIへのアクセスを提供した時点で実装
   * 現時点では window.claude?.notion API は存在しません
   * Requirement: 8.1, 8.2
   */
  private async createPageViaConnector(request: NotionPageRequest): Promise<NotionPageResult> {
    // 🔮 将来対応予定: Notion Connector統合
    // 現時点では、iOS/iPadOSでの実行時はフォールバックを返す
    return {
      success: false,
      method: 'connector',
      error:
        'Notion Connector統合は将来対応予定です。現在はNotion MCP Server経由のみサポートしています。',
      fallbackText: this.generateFallbackTemplate({
        title: request.title,
        ...request.properties,
      }),
    };
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
   * Now also validates that database ID is configured
   */
  shouldSyncToNotion(
    deadline: string | undefined,
    thresholdDays: number = 8,
    configuredDatabaseId?: string
  ): boolean {
    // Require a configured database ID
    if (!configuredDatabaseId || configuredDatabaseId.trim() === '') {
      return false;
    }

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
