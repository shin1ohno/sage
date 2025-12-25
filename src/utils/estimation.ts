/**
 * Time Estimation System
 * Estimates task duration based on keywords and complexity
 * Requirements: 2.6, 3.1, 3.2
 */

import type { Task, EstimationConfig } from '../types/index.js';

interface EstimationResult {
  estimatedMinutes: number;
  complexity: 'simple' | 'medium' | 'complex' | 'project';
  reason: string;
  matchedKeywords: string[];
}

// Default estimation config
export const DEFAULT_ESTIMATION_CONFIG: EstimationConfig = {
  simpleTaskMinutes: 25,
  mediumTaskMinutes: 50,
  complexTaskMinutes: 90,
  projectTaskMinutes: 180,
  keywordMapping: {
    simple: [
      'check',
      'review',
      'read',
      'confirm',
      'send',
      'reply',
      'answer',
      '確認',
      'レビュー',
      '読む',
      '返信',
      '送信',
      '回答',
      'approve',
      '承認',
      'quick',
      'すぐ',
      'simple',
      'シンプル',
    ],
    medium: [
      'implement',
      'fix',
      'update',
      'create',
      'modify',
      'add',
      'write',
      '実装',
      '修正',
      '更新',
      '作成',
      '変更',
      '追加',
      '書く',
      'develop',
      '開発',
      'test',
      'テスト',
    ],
    complex: [
      'design',
      'refactor',
      'migrate',
      'integrate',
      'optimize',
      'analyze',
      '設計',
      'リファクタ',
      '移行',
      '統合',
      '最適化',
      '分析',
      'research',
      '調査',
      'investigate',
      '調べる',
    ],
    project: [
      'build',
      'architect',
      'system',
      'platform',
      'infrastructure',
      '構築',
      'アーキテクチャ',
      'システム',
      'プラットフォーム',
      'インフラ',
      'framework',
      'フレームワーク',
      'rewrite',
      '書き直し',
    ],
  },
};

// Task length modifiers
const LENGTH_MODIFIERS = {
  short: 0.75, // Very short description
  normal: 1.0, // Normal description
  long: 1.25, // Long description with details
  veryLong: 1.5, // Very detailed with multiple components
};

// Special modifiers
const SPECIAL_MODIFIERS = {
  meeting: { keywords: ['meeting', 'ミーティング', '会議', 'sync', 'call', '通話'], multiplier: 1.5 },
  documentation: { keywords: ['document', 'ドキュメント', '文書', 'doc', 'docs'], multiplier: 1.25 },
  debugging: { keywords: ['debug', 'デバッグ', 'bug', 'バグ', 'issue', '問題'], multiplier: 1.5 },
  testing: { keywords: ['test', 'テスト', 'qa', 'verify', '検証'], multiplier: 1.25 },
};

export class TimeEstimator {
  /**
   * Estimate task duration
   * Requirement: 2.6, 3.1, 3.2
   */
  static estimateDuration(task: Task, config: EstimationConfig = DEFAULT_ESTIMATION_CONFIG): EstimationResult {
    const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
    const matchedKeywords: string[] = [];

    // Check for project-level keywords
    const projectMatches = this.findMatchingKeywords(text, config.keywordMapping.project);
    if (projectMatches.length > 0) {
      matchedKeywords.push(...projectMatches);
      const baseMinutes = config.projectTaskMinutes;
      const modifiedMinutes = this.applyModifiers(baseMinutes, text, task);

      return {
        estimatedMinutes: Math.round(modifiedMinutes),
        complexity: 'project',
        reason: this.buildReason('project', projectMatches, modifiedMinutes),
        matchedKeywords,
      };
    }

    // Check for complex keywords
    const complexMatches = this.findMatchingKeywords(text, config.keywordMapping.complex);
    if (complexMatches.length > 0) {
      matchedKeywords.push(...complexMatches);
      const baseMinutes = config.complexTaskMinutes;
      const modifiedMinutes = this.applyModifiers(baseMinutes, text, task);

      return {
        estimatedMinutes: Math.round(modifiedMinutes),
        complexity: 'complex',
        reason: this.buildReason('complex', complexMatches, modifiedMinutes),
        matchedKeywords,
      };
    }

    // Check for medium keywords
    const mediumMatches = this.findMatchingKeywords(text, config.keywordMapping.medium);
    if (mediumMatches.length > 0) {
      matchedKeywords.push(...mediumMatches);
      const baseMinutes = config.mediumTaskMinutes;
      const modifiedMinutes = this.applyModifiers(baseMinutes, text, task);

      return {
        estimatedMinutes: Math.round(modifiedMinutes),
        complexity: 'medium',
        reason: this.buildReason('medium', mediumMatches, modifiedMinutes),
        matchedKeywords,
      };
    }

    // Check for simple keywords
    const simpleMatches = this.findMatchingKeywords(text, config.keywordMapping.simple);
    if (simpleMatches.length > 0) {
      matchedKeywords.push(...simpleMatches);
      const baseMinutes = config.simpleTaskMinutes;
      const modifiedMinutes = this.applyModifiers(baseMinutes, text, task);

      return {
        estimatedMinutes: Math.round(modifiedMinutes),
        complexity: 'simple',
        reason: this.buildReason('simple', simpleMatches, modifiedMinutes),
        matchedKeywords,
      };
    }

    // Default to medium complexity
    const baseMinutes = config.mediumTaskMinutes;
    const modifiedMinutes = this.applyModifiers(baseMinutes, text, task);

    return {
      estimatedMinutes: Math.round(modifiedMinutes),
      complexity: 'medium',
      reason: `キーワードが検出されなかったため、標準的なタスク（${modifiedMinutes}分）として見積もり`,
      matchedKeywords: [],
    };
  }

  /**
   * Find matching keywords in text
   */
  private static findMatchingKeywords(text: string, keywords: string[]): string[] {
    return keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
  }

  /**
   * Apply modifiers based on task characteristics
   */
  private static applyModifiers(baseMinutes: number, text: string, task: Task): number {
    let minutes = baseMinutes;

    // Apply length modifier
    const lengthModifier = this.getLengthModifier(task);
    minutes *= lengthModifier;

    // Apply special modifiers
    for (const [_name, { keywords, multiplier }] of Object.entries(SPECIAL_MODIFIERS)) {
      if (keywords.some((k) => text.includes(k.toLowerCase()))) {
        minutes *= multiplier;
        break; // Only apply one special modifier
      }
    }

    // Round to nearest 5 minutes
    return Math.round(minutes / 5) * 5;
  }

  /**
   * Get length modifier based on task description length
   */
  private static getLengthModifier(task: Task): number {
    const totalLength = (task.title?.length ?? 0) + (task.description?.length ?? 0);

    if (totalLength < 30) return LENGTH_MODIFIERS.short;
    if (totalLength < 100) return LENGTH_MODIFIERS.normal;
    if (totalLength < 250) return LENGTH_MODIFIERS.long;
    return LENGTH_MODIFIERS.veryLong;
  }

  /**
   * Build a human-readable reason
   * Note: This is only called when keywords are found
   */
  private static buildReason(
    complexity: 'simple' | 'medium' | 'complex' | 'project',
    matchedKeywords: string[],
    minutes: number
  ): string {
    const complexityNames = {
      simple: 'シンプル',
      medium: '標準',
      complex: '複雑',
      project: 'プロジェクト',
    };

    const complexityName = complexityNames[complexity];
    const keywordStr = matchedKeywords.slice(0, 3).join('、');
    return `「${keywordStr}」を含む${complexityName}なタスクとして${minutes}分と見積もり`;
  }

  /**
   * Analyze keywords in text and return complexity indicators
   */
  static analyzeKeywords(
    text: string,
    config: EstimationConfig = DEFAULT_ESTIMATION_CONFIG
  ): {
    simple: string[];
    medium: string[];
    complex: string[];
    project: string[];
    matched: string[];
  } {
    const lowerText = text.toLowerCase();

    const simple = this.findMatchingKeywords(lowerText, config.keywordMapping.simple);
    const medium = this.findMatchingKeywords(lowerText, config.keywordMapping.medium);
    const complex = this.findMatchingKeywords(lowerText, config.keywordMapping.complex);
    const project = this.findMatchingKeywords(lowerText, config.keywordMapping.project);

    return {
      simple,
      medium,
      complex,
      project,
      matched: [...simple, ...medium, ...complex, ...project],
    };
  }
}
