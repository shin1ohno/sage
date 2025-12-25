/**
 * Stakeholder Extraction System
 * Identifies and extracts stakeholders from task content
 * Requirements: 4.1-4.5
 */

import type { Task, TeamConfig, TeamMember } from '../types/index.js';

interface StakeholderResult {
  stakeholders: string[];
  managerInvolved: boolean;
  reason: string;
  mentions: string[];
  matchedTeamMembers: TeamMember[];
}

// Manager keywords
const MANAGER_KEYWORDS = [
  'manager',
  'マネージャー',
  '上司',
  'boss',
  'supervisor',
  '管理者',
  'director',
  'ディレクター',
  'lead',
  'リーダー',
  'team lead',
  'チームリード',
];

// Mention patterns
const MENTION_PATTERNS = [
  /@(\w+)/g, // @username
  /@([^\s]+さん)/g, // @名前さん (Japanese)
  /(?:from|by|with|to|cc|CC)\s+(\w+)/gi, // from/by/with person
  /(?:から|と|へ|宛)\s*([^\s、]+(?:さん|様)?)/g, // Japanese particles
];

export class StakeholderExtractor {
  /**
   * Extract stakeholders from a task
   * Requirement: 4.1, 4.5
   */
  static extractStakeholders(task: Task, teamConfig?: TeamConfig): StakeholderResult {
    const text = `${task.title} ${task.description ?? ''}`;
    const stakeholders: string[] = [];
    const matchedTeamMembers: TeamMember[] = [];

    // Extract @mentions
    const mentions = this.findMentions(text);
    stakeholders.push(...mentions);

    // Match against team members
    if (teamConfig) {
      const matched = this.matchTeamMembers(text, teamConfig);
      for (const member of matched) {
        if (!stakeholders.includes(member.name)) {
          stakeholders.push(member.name);
          matchedTeamMembers.push(member);
        }
      }
    }

    // Check for manager involvement
    const managerInvolved = this.checkManagerInvolvement(text, teamConfig);

    // Add manager to stakeholders if involved
    if (managerInvolved && teamConfig?.manager) {
      if (!stakeholders.includes(teamConfig.manager.name)) {
        stakeholders.push(teamConfig.manager.name);
        matchedTeamMembers.push(teamConfig.manager);
      }
    }

    return {
      stakeholders,
      managerInvolved,
      reason: this.buildReason(stakeholders, managerInvolved, mentions),
      mentions,
      matchedTeamMembers,
    };
  }

  /**
   * Find @mentions in text
   * Requirement: 4.3
   */
  static findMentions(text: string): string[] {
    const mentions: Set<string> = new Set();

    for (const pattern of MENTION_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const mention = match[1].trim();
        // Filter out common false positives
        if (mention.length > 1 && !this.isCommonWord(mention)) {
          mentions.add(mention);
        }
      }
    }

    return Array.from(mentions);
  }

  /**
   * Match text against configured team members
   * Requirement: 4.2
   */
  static matchTeamMembers(text: string, teamConfig: TeamConfig): TeamMember[] {
    const lowerText = text.toLowerCase();
    const matched: TeamMember[] = [];

    // Check manager
    if (teamConfig.manager) {
      if (this.memberMatchesText(teamConfig.manager, lowerText)) {
        matched.push(teamConfig.manager);
      }
    }

    // Check frequent collaborators
    for (const collaborator of teamConfig.frequentCollaborators) {
      if (this.memberMatchesText(collaborator, lowerText)) {
        matched.push(collaborator);
      }
    }

    return matched;
  }

  /**
   * Check if a team member matches the text
   */
  private static memberMatchesText(member: TeamMember, lowerText: string): boolean {
    // Check name
    if (lowerText.includes(member.name.toLowerCase())) {
      return true;
    }

    // Check keywords
    for (const keyword of member.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if manager is involved in the task
   * Requirement: 4.4
   */
  static checkManagerInvolvement(text: string, teamConfig?: TeamConfig): boolean {
    const lowerText = text.toLowerCase();

    // Check generic manager keywords
    if (MANAGER_KEYWORDS.some((keyword) => lowerText.includes(keyword.toLowerCase()))) {
      return true;
    }

    // Check configured manager
    if (teamConfig?.manager) {
      if (lowerText.includes(teamConfig.manager.name.toLowerCase())) {
        return true;
      }

      for (const keyword of teamConfig.manager.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a word is a common word (false positive)
   */
  private static isCommonWord(word: string): boolean {
    const commonWords = [
      'the',
      'a',
      'an',
      'to',
      'from',
      'with',
      'by',
      'for',
      'in',
      'on',
      'at',
      'it',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'ought',
      'used',
      'this',
      'that',
      'these',
      'those',
      'の',
      'に',
      'を',
      'で',
      'が',
      'は',
    ];

    return commonWords.includes(word.toLowerCase());
  }

  /**
   * Build a human-readable reason
   */
  private static buildReason(
    stakeholders: string[],
    managerInvolved: boolean,
    mentions: string[]
  ): string {
    if (stakeholders.length === 0) {
      return '関係者は検出されませんでした';
    }

    const parts: string[] = [];

    if (mentions.length > 0) {
      parts.push(`@メンションから${mentions.length}名を検出`);
    }

    if (managerInvolved) {
      parts.push('マネージャーが関与');
    }

    const nonMentionCount = stakeholders.length - mentions.length;
    if (nonMentionCount > 0 && !managerInvolved) {
      parts.push(`チームメンバーから${nonMentionCount}名を検出`);
    }

    return parts.join('、') || `${stakeholders.length}名の関係者を検出`;
  }

  /**
   * Get priority boost for manager involvement
   */
  static getManagerPriorityBoost(): number {
    return 1; // Boost priority by 1 level (e.g., P2 -> P1)
  }

  /**
   * Extract all names from text (broader matching)
   */
  static extractPotentialNames(text: string): string[] {
    const names: Set<string> = new Set();

    // Japanese name patterns (漢字 + さん/様/氏)
    const japaneseNamePattern = /([一-龯]{2,4})(さん|様|氏)/g;
    let match;
    while ((match = japaneseNamePattern.exec(text)) !== null) {
      names.add(match[1]);
    }

    // English capitalized names
    const englishNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    while ((match = englishNamePattern.exec(text)) !== null) {
      const name = match[1];
      // Filter out common non-names
      if (!this.isCommonCapitalizedWord(name)) {
        names.add(name);
      }
    }

    return Array.from(names);
  }

  /**
   * Check if a capitalized word is commonly not a name
   */
  private static isCommonCapitalizedWord(word: string): boolean {
    const commonWords = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
      'The',
      'This',
      'That',
      'Please',
      'Thanks',
      'Hello',
      'Hi',
      'Dear',
      'Task',
      'Project',
      'Meeting',
      'Review',
      'Update',
      'Urgent',
      'Important',
      'TODO',
      'FIXME',
      'NOTE',
      'API',
      'UI',
      'PR',
      'MR',
    ];

    return commonWords.includes(word);
  }
}
