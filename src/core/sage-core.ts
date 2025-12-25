/**
 * SageCore
 * Platform-independent core logic for sage task management
 * Requirements: 2.1, 2.2, 11.1, 7.3, 7.4
 */

import type {
  PlatformAdapter,
  PlatformInfo,
  FeatureSet,
} from '../platform/types.js';
import type { Task, UserConfig } from '../types/index.js';
import { TaskAnalyzer } from '../tools/analyze-tasks.js';
import type { AnalysisResult } from '../tools/analyze-tasks.js';
import { DEFAULT_CONFIG } from '../types/config.js';

/**
 * Integration recommendation for a specific platform
 */
export interface IntegrationRecommendation {
  integration: 'reminders' | 'calendar' | 'notion';
  available: boolean;
  method: 'native' | 'applescript' | 'mcp' | 'connector' | 'manual_copy';
  fallback?: string;
  description: string;
}

/**
 * SageCore - The main entry point for sage functionality
 * Works with any platform adapter to provide consistent task management
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
        available: true,
        method: 'applescript',
        description: 'AppleScript経由でApple Remindersに連携',
      });
    } else if (platformType === 'ios_skills' || platformType === 'ipados_skills') {
      recommendations.push({
        integration: 'reminders',
        available: true,
        method: 'native',
        description: 'ネイティブAPIでApple Remindersに直接連携',
      });
    } else {
      recommendations.push({
        integration: 'reminders',
        available: false,
        method: 'manual_copy',
        fallback: 'manual_copy',
        description: 'Apple Remindersへは手動コピーで追加してください',
      });
    }

    // Calendar integration
    if (platformType === 'desktop_mcp') {
      recommendations.push({
        integration: 'calendar',
        available: true,
        method: 'applescript',
        description: 'AppleScript経由でCalendar.appから予定を取得',
      });
    } else if (platformType === 'ios_skills' || platformType === 'ipados_skills') {
      recommendations.push({
        integration: 'calendar',
        available: true,
        method: 'native',
        description: 'ネイティブAPIでカレンダーイベントを取得',
      });
    } else {
      recommendations.push({
        integration: 'calendar',
        available: false,
        method: 'manual_copy',
        fallback: 'manual_input',
        description: 'カレンダー情報は手動で入力してください',
      });
    }

    // Notion integration
    if (features.notionIntegration) {
      if (platformType === 'desktop_mcp') {
        recommendations.push({
          integration: 'notion',
          available: true,
          method: 'mcp',
          description: 'MCP経由でNotionデータベースに連携',
        });
      } else if (platformType === 'ios_skills' || platformType === 'ipados_skills') {
        recommendations.push({
          integration: 'notion',
          available: true,
          method: 'connector',
          description: 'Notion Connector経由でNotionデータベースに連携',
        });
      }
    } else {
      recommendations.push({
        integration: 'notion',
        available: false,
        method: 'manual_copy',
        fallback: 'manual_copy',
        description: 'Notionへは手動コピーで追加してください',
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
