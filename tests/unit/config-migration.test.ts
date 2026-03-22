/**
 * Config Migration Unit Tests
 * Tests that ConfigLoader properly migrates meetingIntelligence and integrations.slack
 */

import { ConfigLoader } from '../../src/config/loader.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';

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

  describe('drive.readonly scope', () => {
    it('should include drive.readonly in GOOGLE_CALENDAR_SCOPES', async () => {
      const { GOOGLE_CALENDAR_SCOPES } = await import(
        '../../src/oauth/google-oauth-handler.js'
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
