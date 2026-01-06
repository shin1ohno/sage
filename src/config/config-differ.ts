/**
 * Configuration differ utility
 * Provides deep comparison functionality for UserConfig objects
 */

import type { UserConfig } from '../types/config.js';
import type { ConfigDiff } from '../types/hot-reload.js';

/**
 * Top-level sections in UserConfig that can be compared
 */
const CONFIG_SECTIONS = [
  'user',
  'calendar',
  'priorityRules',
  'estimation',
  'reminders',
  'team',
  'integrations',
  'preferences',
] as const;

/**
 * Check if two values are deeply equal
 * @param a - First value
 * @param b - Second value
 * @returns true if values are deeply equal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  // Handle primitive types and null/undefined
  if (a === b) {
    return true;
  }

  // Handle null/undefined cases
  if (a === null || b === null || a === undefined || b === undefined) {
    return false;
  }

  // Handle different types
  if (typeof a !== typeof b) {
    return false;
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    // Check if both objects have the same number of keys
    if (aKeys.length !== bKeys.length) {
      return false;
    }

    // Check if all keys in a exist in b with equal values
    return aKeys.every((key) => {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) {
        return false;
      }
      return deepEqual(aObj[key], bObj[key]);
    });
  }

  // Primitive values that are not equal
  return false;
}

/**
 * Get all keys from an object recursively with dot notation
 * @param obj - Object to get keys from
 * @param prefix - Prefix for nested keys
 * @returns Array of dot-notation key paths
 */
function getDeepKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }

  const objRecord = obj as Record<string, unknown>;
  const keys: string[] = [];

  for (const key of Object.keys(objRecord)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = objRecord[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...getDeepKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Get a value from an object using dot notation path
 * @param obj - Object to get value from
 * @param path - Dot notation path
 * @returns Value at path or undefined
 */
function getValueByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Compare two UserConfig objects and return the differences
 * @param oldConfig - Previous configuration
 * @param newConfig - New configuration
 * @returns ConfigDiff describing all differences
 */
export function diffConfig(oldConfig: UserConfig, newConfig: UserConfig): ConfigDiff {
  const changedSections: string[] = [];
  const addedKeys: Record<string, unknown> = {};
  const removedKeys: string[] = [];
  const modifiedKeys: Record<string, { old: unknown; new: unknown }> = {};

  // Compare each top-level section
  for (const section of CONFIG_SECTIONS) {
    const oldSection = oldConfig[section];
    const newSection = newConfig[section];

    if (!deepEqual(oldSection, newSection)) {
      changedSections.push(section);

      // Get detailed changes within this section
      const oldKeys = getDeepKeys(oldSection, section);
      const newKeys = getDeepKeys(newSection, section);

      const oldKeySet = new Set(oldKeys);
      const newKeySet = new Set(newKeys);

      // Find added keys
      for (const key of newKeys) {
        if (!oldKeySet.has(key)) {
          addedKeys[key] = getValueByPath(newConfig, key);
        }
      }

      // Find removed keys
      for (const key of oldKeys) {
        if (!newKeySet.has(key)) {
          removedKeys.push(key);
        }
      }

      // Find modified keys (keys that exist in both but have different values)
      for (const key of oldKeys) {
        if (newKeySet.has(key)) {
          const oldValue = getValueByPath(oldConfig, key);
          const newValue = getValueByPath(newConfig, key);

          if (!deepEqual(oldValue, newValue)) {
            modifiedKeys[key] = { old: oldValue, new: newValue };
          }
        }
      }
    }
  }

  // Also check metadata fields that might have changed
  if (oldConfig.version !== newConfig.version) {
    modifiedKeys['version'] = { old: oldConfig.version, new: newConfig.version };
  }

  return {
    changedSections,
    addedKeys,
    removedKeys,
    modifiedKeys,
  };
}

/**
 * Check if the config diff contains significant changes that warrant service re-initialization
 * Changes to metadata fields (version, createdAt, lastUpdated) are not considered significant
 * @param diff - ConfigDiff to evaluate
 * @returns true if there are significant changes
 */
export function hasSignificantChanges(diff: ConfigDiff): boolean {
  // If there are changed sections, that's significant
  if (diff.changedSections.length > 0) {
    return true;
  }

  // If there are added or removed keys (excluding metadata), that's significant
  const metadataKeys = ['version', 'createdAt', 'lastUpdated'];

  const significantAddedKeys = Object.keys(diff.addedKeys).filter(
    (key) => !metadataKeys.includes(key)
  );
  if (significantAddedKeys.length > 0) {
    return true;
  }

  const significantRemovedKeys = diff.removedKeys.filter((key) => !metadataKeys.includes(key));
  if (significantRemovedKeys.length > 0) {
    return true;
  }

  // If there are modified keys (excluding metadata), that's significant
  const significantModifiedKeys = Object.keys(diff.modifiedKeys).filter(
    (key) => !metadataKeys.includes(key)
  );
  if (significantModifiedKeys.length > 0) {
    return true;
  }

  return false;
}
