/**
 * SageCore
 * Core logic for sage task management
 * Requirements: 2.1, 2.2, 11.1, 7.3, 7.4
 *
 * sage は macOS 専用で、以下の方式で動作します：
 * - desktop_mcp: Claude Desktop/Code から直接実行（AppleScript統合）
 * - remote_mcp: macOS 上の Remote MCP Server 経由でアクセス（iOS/Web クライアント用）
 *
 * 注意: Remote MCP Server も macOS 上で実行する必要があります（AppleScript のため）
 */

import type { PlatformAdapter, PlatformInfo, FeatureSet } from '../platform/types.js';
import type { Task, UserConfig } from '../types/index.js';
import { TaskAnalyzer } from '../tools/analyze-tasks.js';
import type { AnalysisResult } from '../tools/analyze-tasks.js';
import { DEFAULT_CONFIG } from '../types/config.js';

/**
 * Integration recommendation for the platform
 */
export interface IntegrationRecommendation {
  integration: 'reminders' | 'calendar' | 'notion';
  available: boolean;
  method: 'applescript' | 'mcp' | 'remote';
  description: string;
}

/**
 * SageCore - The main entry point for sage functionality
 * Works with platform adapters to provide task management
 */
export class SageCore {
  private adapter: PlatformAdapter;
  private config: UserConfig | null = null;
  private initialized = false;

  constructor(adapter: PlatformAdapter) {
    this.adapter = adapter;
  }

  /**
   * Initialize the core with configuration
   */
  async initialize(config?: UserConfig): Promise<void> {
    await this.adapter.initialize();
    this.config = config ?? { ...DEFAULT_CONFIG };
    this.initialized = true;
  }

  /**
   * Check if core is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get platform information
   */
  getPlatformInfo(): PlatformInfo {
    return this.adapter.getPlatformInfo();
  }

  /**
   * Get available features on current platform
   */
  getAvailableFeatures(): FeatureSet {
    return this.adapter.getAvailableFeatures();
  }

  /**
   * Get current configuration
   */
  getConfig(): UserConfig {
    this.ensureInitialized();
    return this.config!;
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<UserConfig>): Promise<void> {
    this.ensureInitialized();
    this.config = {
      ...this.config!,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Analyze a list of tasks
   * Requirement: 2.1, 2.2
   */
  async analyzeTasks(tasks: Task[]): Promise<AnalysisResult> {
    this.ensureInitialized();
    return TaskAnalyzer.analyzeTasks(tasks, this.config!);
  }

  /**
   * Analyze tasks from text input
   * Requirement: 11.1
   */
  async analyzeFromText(input: string): Promise<AnalysisResult> {
    this.ensureInitialized();
    return TaskAnalyzer.analyzeFromText(input, this.config!);
  }

  /**
   * Format analysis result for display
   */
  formatResult(result: AnalysisResult): string {
    return TaskAnalyzer.formatResult(result);
  }

  /**
   * Get integration recommendations based on current platform
   * Requirement: 7.3, 7.4
   */
  getIntegrationRecommendations(): IntegrationRecommendation[] {
    const features = this.adapter.getAvailableFeatures();
    const platformType = this.adapter.getPlatformInfo().type;
    const recommendations: IntegrationRecommendation[] = [];

    // Reminders integration
    if (platformType === 'desktop_mcp') {
      recommendations.push({
        integration: 'reminders',
        available: features.appleReminders,
        method: 'applescript',
        description: 'AppleScript経由でApple Remindersに連携',
      });
    } else if (platformType === 'remote_mcp') {
      recommendations.push({
        integration: 'reminders',
        available: features.appleReminders,
        method: 'remote',
        description: 'Remote MCP Server経由でApple Remindersに連携',
      });
    }

    // Calendar integration
    if (platformType === 'desktop_mcp') {
      recommendations.push({
        integration: 'calendar',
        available: features.calendarIntegration,
        method: 'applescript',
        description: 'AppleScript経由でCalendar.appから予定を取得',
      });
    } else if (platformType === 'remote_mcp') {
      recommendations.push({
        integration: 'calendar',
        available: features.calendarIntegration,
        method: 'remote',
        description: 'Remote MCP Server経由でカレンダーイベントを取得',
      });
    }

    // Notion integration
    if (platformType === 'desktop_mcp') {
      recommendations.push({
        integration: 'notion',
        available: features.notionIntegration,
        method: 'mcp',
        description: 'MCP経由でNotionデータベースに連携',
      });
    } else if (platformType === 'remote_mcp') {
      recommendations.push({
        integration: 'notion',
        available: features.notionIntegration,
        method: 'remote',
        description: 'Remote MCP Server経由でNotionデータベースに連携',
      });
    }

    return recommendations;
  }

  /**
   * Check if a specific capability is available
   */
  isCapabilityAvailable(capability: string): boolean {
    return this.adapter.isCapabilityAvailable(capability);
  }

  /**
   * Ensure core is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.config) {
      throw new Error('SageCore not initialized. Call initialize() first.');
    }
  }
}
