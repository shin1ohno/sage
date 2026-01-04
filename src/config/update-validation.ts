/**
 * Configuration Update Validation
 *
 * Provides validation and application of partial config updates.
 * Used by both index.ts (stdio transport) and mcp-handler.ts (CLI).
 */

import type { UserConfig } from '../types/config.js';

/**
 * Validation result for config updates
 */
export interface ConfigValidationResult {
  valid: boolean;
  error?: string;
  invalidFields?: string[];
}

/**
 * Valid section names for config updates
 */
export type ConfigSection =
  | 'user'
  | 'calendar'
  | 'priorityRules'
  | 'integrations'
  | 'team'
  | 'preferences';

/**
 * Validate config updates for a specific section
 *
 * Checks that provided update values have the correct types
 * for the target section.
 *
 * @param section - Config section to update
 * @param updates - Partial updates to apply
 * @returns Validation result with any invalid fields
 *
 * @example
 * const result = validateConfigUpdate('user', { name: 'Alice' });
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 */
export function validateConfigUpdate(
  section: string,
  updates: Record<string, unknown>
): ConfigValidationResult {
  const invalidFields: string[] = [];

  switch (section) {
    case 'user':
      if (updates.name !== undefined && typeof updates.name !== 'string') {
        invalidFields.push('name');
      }
      if (updates.timezone !== undefined && typeof updates.timezone !== 'string') {
        invalidFields.push('timezone');
      }
      break;

    case 'calendar':
      if (updates.workingHours !== undefined) {
        const wh = updates.workingHours as { start?: string; end?: string };
        if (!wh.start || !wh.end) {
          invalidFields.push('workingHours');
        }
      }
      if (updates.deepWorkDays !== undefined && !Array.isArray(updates.deepWorkDays)) {
        invalidFields.push('deepWorkDays');
      }
      if (updates.meetingHeavyDays !== undefined && !Array.isArray(updates.meetingHeavyDays)) {
        invalidFields.push('meetingHeavyDays');
      }
      break;

    case 'integrations':
      if (updates.notion !== undefined) {
        const notion = updates.notion as { enabled?: boolean; databaseId?: string };
        if (notion.enabled === true && !notion.databaseId) {
          invalidFields.push('notion.databaseId');
        }
      }
      break;

    case 'team':
      if (updates.members !== undefined && !Array.isArray(updates.members)) {
        invalidFields.push('members');
      }
      if (updates.managers !== undefined && !Array.isArray(updates.managers)) {
        invalidFields.push('managers');
      }
      break;
  }

  if (invalidFields.length > 0) {
    return {
      valid: false,
      error: `無効なフィールド: ${invalidFields.join(', ')}`,
      invalidFields,
    };
  }

  return { valid: true };
}

/**
 * Apply config updates to a specific section
 *
 * Creates a new config object with the updates merged into
 * the specified section. Does not mutate the original config.
 *
 * @param currentConfig - Current configuration object
 * @param section - Section to update
 * @param updates - Partial updates to merge
 * @returns New config object with updates applied
 *
 * @example
 * const newConfig = applyConfigUpdates(config, 'user', { name: 'Bob' });
 */
export function applyConfigUpdates(
  currentConfig: UserConfig,
  section: string,
  updates: Record<string, unknown>
): UserConfig {
  const newConfig = { ...currentConfig };

  switch (section) {
    case 'user':
      newConfig.user = { ...newConfig.user, ...updates } as UserConfig['user'];
      break;
    case 'calendar':
      newConfig.calendar = {
        ...newConfig.calendar,
        ...updates,
      } as UserConfig['calendar'];
      break;
    case 'priorityRules':
      newConfig.priorityRules = {
        ...newConfig.priorityRules,
        ...updates,
      } as UserConfig['priorityRules'];
      break;
    case 'integrations':
      // Deep merge for integrations
      if (updates.appleReminders) {
        newConfig.integrations.appleReminders = {
          ...newConfig.integrations.appleReminders,
          ...(updates.appleReminders as object),
        };
      }
      if (updates.notion) {
        newConfig.integrations.notion = {
          ...newConfig.integrations.notion,
          ...(updates.notion as object),
        };
      }
      break;
    case 'team':
      newConfig.team = { ...newConfig.team, ...updates } as UserConfig['team'];
      break;
    case 'preferences':
      newConfig.preferences = {
        ...newConfig.preferences,
        ...updates,
      } as UserConfig['preferences'];
      break;
  }

  return newConfig;
}
