/**
 * Config Migration Unit Tests
 * Tests that ConfigLoader properly migrates meetingIntelligence and integrations.slack
 */

import { ConfigLoader } from '../../src/config/loader.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ConfigLoader migration', () => {
  const testDir = join(tmpdir(), 'sage-migration-test-' + Date.now());

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('meetingIntelligence migration', () => {
    it('should add meetingIntelligence defaults when missing from config', async () => {
      // Create a config file without meetingIntelligence
      const configWithoutMI = {
        ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      };
      delete configWithoutMI.meetingIntelligence;

      const configPath = join(testDir, 'config-no-mi.json');
      await writeFile(configPath, JSON.stringify(configWithoutMI), 'utf-8');

      // Override getConfigPath to use our test file
      const originalGetConfigPath = ConfigLoader.getConfigPath;
      const originalSave = ConfigLoader.save;
      ConfigLoader.getConfigPath = () => configPath;
      ConfigLoader.save = async () => {}; // no-op save

      try {
        const loaded = await ConfigLoader.load();
        expect(loaded.meetingIntelligence).toBeDefined();
        expect(loaded.meetingIntelligence!.enabled).toBe(false);
        expect(loaded.meetingIntelligence!.briefingWindow).toBe(15);
        expect(loaded.meetingIntelligence!.postMeetingTimeout).toBe(24);
        expect(loaded.meetingIntelligence!.excludePatterns).toEqual([]);
      } finally {
        ConfigLoader.getConfigPath = originalGetConfigPath;
        ConfigLoader.save = originalSave;
      }
    });
  });

  describe('integrations.slack migration', () => {
    it('should add slack defaults when missing from integrations', async () => {
      // Create a config file without integrations.slack
      const configWithoutSlack = {
        ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      };
      delete configWithoutSlack.integrations.slack;

      const configPath = join(testDir, 'config-no-slack.json');
      await writeFile(configPath, JSON.stringify(configWithoutSlack), 'utf-8');

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      const originalSave = ConfigLoader.save;
      ConfigLoader.getConfigPath = () => configPath;
      ConfigLoader.save = async () => {};

      try {
        const loaded = await ConfigLoader.load();
        expect(loaded.integrations.slack).toBeDefined();
        expect(loaded.integrations.slack!.enabled).toBe(false);
      } finally {
        ConfigLoader.getConfigPath = originalGetConfigPath;
        ConfigLoader.save = originalSave;
      }
    });
  });

  describe('integrations sub-field migration', () => {
    async function loadWithConfigFile(filename: string, config: unknown) {
      const configPath = join(testDir, filename);
      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      const originalSave = ConfigLoader.save;
      ConfigLoader.getConfigPath = () => configPath;
      ConfigLoader.save = async () => {};

      try {
        return await ConfigLoader.load();
      } finally {
        ConfigLoader.getConfigPath = originalGetConfigPath;
        ConfigLoader.save = originalSave;
      }
    }

    it('should add googleCalendar defaults when missing', async () => {
      const partial = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      delete partial.integrations.googleCalendar;
      const loaded = await loadWithConfigFile('config-no-google.json', partial);

      expect(loaded.integrations.googleCalendar).toBeDefined();
      expect(loaded.integrations.googleCalendar.enabled).toBe(
        DEFAULT_CONFIG.integrations.googleCalendar.enabled
      );
    });

    it('should add notion defaults when missing', async () => {
      const partial = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      delete partial.integrations.notion;
      const loaded = await loadWithConfigFile('config-no-notion.json', partial);

      expect(loaded.integrations.notion).toBeDefined();
      expect(loaded.integrations.notion.enabled).toBe(
        DEFAULT_CONFIG.integrations.notion.enabled
      );
    });

    it('should add appleReminders defaults when missing', async () => {
      const partial = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      delete partial.integrations.appleReminders;
      const loaded = await loadWithConfigFile('config-no-apple.json', partial);

      expect(loaded.integrations.appleReminders).toBeDefined();
      expect(loaded.integrations.appleReminders.enabled).toBe(
        DEFAULT_CONFIG.integrations.appleReminders.enabled
      );
    });

    it('should rebuild entire integrations block when absent', async () => {
      const partial = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      delete partial.integrations;
      const loaded = await loadWithConfigFile('config-no-integrations.json', partial);

      expect(loaded.integrations).toBeDefined();
      expect(loaded.integrations.googleCalendar).toBeDefined();
      expect(loaded.integrations.notion).toBeDefined();
      expect(loaded.integrations.appleReminders).toBeDefined();
      expect(loaded.integrations.slack).toBeDefined();
    });
  });

  describe('drive.readonly scope', () => {
    it('should include drive.readonly in GOOGLE_CALENDAR_SCOPES', async () => {
      const { GOOGLE_CALENDAR_SCOPES } = await import(
        '../../src/google-oauth/google-oauth-handler.js'
      );
      expect(GOOGLE_CALENDAR_SCOPES).toContain(
        'https://www.googleapis.com/auth/drive.readonly'
      );
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should include meetingIntelligence in DEFAULT_CONFIG', () => {
      expect(DEFAULT_CONFIG.meetingIntelligence).toBeDefined();
      expect(DEFAULT_CONFIG.meetingIntelligence!.enabled).toBe(false);
      expect(DEFAULT_CONFIG.meetingIntelligence!.briefingWindow).toBe(15);
    });

    it('should include slack in DEFAULT_CONFIG.integrations', () => {
      expect(DEFAULT_CONFIG.integrations.slack).toBeDefined();
      expect(DEFAULT_CONFIG.integrations.slack!.enabled).toBe(false);
    });
  });
});
