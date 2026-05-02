/**
 * Configuration file loader
 * Handles reading and writing the sage configuration file
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { UserConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { validateCalendarSources } from './validation.js';
import { MeetingIntelligenceConfigSchema, SlackIntegrationConfigSchema } from '../types/pipeline-config.js';

const SAGE_DIR = '.sage';
const CONFIG_FILE = 'config.json';

export class ConfigLoader {
  /**
   * Get the path to the sage configuration directory
   */
  static getConfigDir(): string {
    return join(homedir(), SAGE_DIR);
  }

  /**
   * Get the path to the configuration file
   */
  static getConfigPath(): string {
    return join(this.getConfigDir(), CONFIG_FILE);
  }

  /**
   * Check if the configuration file exists
   */
  static async exists(): Promise<boolean> {
    try {
      await access(this.getConfigPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load the configuration from disk
   * Throws if the file doesn't exist or is invalid
   */
  static async load(): Promise<UserConfig> {
    const configPath = this.getConfigPath();

    try {
      const content = await readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content) as UserConfig;

      // Validate basic structure
      if (!parsed.version || !parsed.user) {
        throw new Error('Invalid configuration file structure');
      }

      // Migrate config if calendar.sources is missing
      let migrated = false;
      if (!parsed.calendar.sources) {
        // Deep copy to avoid reference sharing
        parsed.calendar.sources = JSON.parse(
          JSON.stringify(DEFAULT_CONFIG.calendar.sources)
        );
        migrated = true;
      }

      // Migrate config if meetingIntelligence is missing
      if (!parsed.meetingIntelligence) {
        parsed.meetingIntelligence = MeetingIntelligenceConfigSchema.parse({});
        migrated = true;
      }

      // Migrate integrations: backfill any missing sub-fields from DEFAULT_CONFIG.
      // Older configs (and test fixtures) may omit googleCalendar/notion/appleReminders/slack;
      // downstream adapters access these unconditionally, so we ensure shape parity here.
      if (!parsed.integrations) {
        parsed.integrations = JSON.parse(JSON.stringify(DEFAULT_CONFIG.integrations));
        migrated = true;
      } else {
        if (!parsed.integrations.appleReminders) {
          parsed.integrations.appleReminders = JSON.parse(
            JSON.stringify(DEFAULT_CONFIG.integrations.appleReminders)
          );
          migrated = true;
        }
        if (!parsed.integrations.notion) {
          parsed.integrations.notion = JSON.parse(
            JSON.stringify(DEFAULT_CONFIG.integrations.notion)
          );
          migrated = true;
        }
        if (!parsed.integrations.googleCalendar) {
          parsed.integrations.googleCalendar = JSON.parse(
            JSON.stringify(DEFAULT_CONFIG.integrations.googleCalendar)
          );
          migrated = true;
        }
        if (!parsed.integrations.slack) {
          parsed.integrations.slack = SlackIntegrationConfigSchema.parse({});
          migrated = true;
        }
      }

      // Backfill autonomy block when missing. Default to Tier 1 across all
      // known write tools so existing configs become safe-by-default after
      // upgrade rather than silently auto-executing every mutation.
      if (!parsed.autonomy) {
        parsed.autonomy = JSON.parse(JSON.stringify(DEFAULT_CONFIG.autonomy));
        migrated = true;
      }

      // Validate calendar.sources if present
      if (parsed.calendar.sources) {
        const validation = validateCalendarSources(parsed.calendar.sources);
        if (!validation.success) {
          throw new Error(
            `Invalid calendar sources configuration: ${validation.error?.message}`
          );
        }
      }

      // Save migrated config
      if (migrated) {
        await this.save(parsed);
      }

      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Configuration file not found');
      }
      throw error;
    }
  }

  /**
   * Save the configuration to disk
   */
  static async save(config: UserConfig): Promise<void> {
    const configDir = this.getConfigDir();
    const configPath = this.getConfigPath();

    // Validate calendar.sources (required)
    if (!config.calendar.sources) {
      throw new Error('Missing required field: calendar.sources');
    }

    const validation = validateCalendarSources(config.calendar.sources);
    if (!validation.success) {
      throw new Error(
        `Invalid calendar sources configuration: ${validation.error?.message}`
      );
    }

    // Ensure the directory exists
    await mkdir(configDir, { recursive: true });

    // Update timestamp
    const updatedConfig: UserConfig = {
      ...config,
      lastUpdated: new Date().toISOString(),
    };

    // Write the file with pretty formatting
    await writeFile(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
  }

  /**
   * Load the configuration, or create a default one if it doesn't exist
   */
  static async loadOrCreate(): Promise<UserConfig> {
    try {
      return await this.load();
    } catch {
      const config = this.getDefaultConfig();
      await this.save(config);
      return config;
    }
  }

  /**
   * Get the default configuration
   */
  static getDefaultConfig(): UserConfig {
    // Deep copy DEFAULT_CONFIG to avoid reference sharing
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as UserConfig;
    return {
      ...config,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Merge partial updates into an existing configuration
   */
  static mergeConfig(base: UserConfig, updates: Partial<UserConfig>): UserConfig {
    return {
      ...base,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
  }
}
