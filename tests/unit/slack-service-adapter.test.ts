import { SlackServiceAdapter, createSlackService } from '../../src/services/reloadable/slack-service-adapter.js';
import type { UserConfig } from '../../src/types/config.js';

describe('SlackServiceAdapter', () => {
  let adapter: SlackServiceAdapter;

  beforeEach(() => {
    adapter = new SlackServiceAdapter(createSlackService);
  });

  it('name returns SlackService', () => {
    expect(adapter.name).toBe('SlackService');
  });

  it('dependsOnSections returns [integrations]', () => {
    expect(adapter.dependsOnSections).toEqual(['integrations']);
  });

  it('getInstance() returns null initially', () => {
    expect(adapter.getInstance()).toBeNull();
  });

  it('shutdown() sets instance to null', async () => {
    await adapter.shutdown();
    expect(adapter.getInstance()).toBeNull();
  });

  it('reinitialize() with missing Slack config does not throw', async () => {
    const config = { user: { name: 'Test' } };

    await expect(adapter.reinitialize(config as never)).resolves.not.toThrow();
    expect(adapter.getInstance()).toBeNull();
  });
});

describe('createSlackService config fallback', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function configWith(slack: Record<string, unknown>): UserConfig {
    return {
      integrations: { slack },
    } as unknown as UserConfig;
  }

  it('uses config.json credentials when env vars are absent', () => {
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_REDIRECT_URI;

    const service = createSlackService(configWith({
      enabled: true,
      clientId: 'config-id',
      clientSecret: 'config-secret',
      redirectUri: 'http://example.com/callback',
    }));

    expect(service).toBeDefined();
  });

  it('prefers env vars over config.json values', () => {
    process.env.SLACK_CLIENT_ID = 'env-id';
    process.env.SLACK_CLIENT_SECRET = 'env-secret';
    process.env.SLACK_REDIRECT_URI = 'http://env.example.com/callback';

    const service = createSlackService(configWith({
      enabled: true,
      clientId: 'config-id',
      clientSecret: 'config-secret',
      redirectUri: 'http://config.example.com/callback',
    }));

    expect(service).toBeDefined();
  });

  it('throws when neither env vars nor config provides credentials', () => {
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;

    expect(() => createSlackService(configWith({}))).toThrow(
      'Slack integration not configured'
    );
  });

  it('uses default redirectUri when neither env nor config provides it', () => {
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_REDIRECT_URI;

    const service = createSlackService(configWith({
      enabled: true,
      clientId: 'config-id',
      clientSecret: 'config-secret',
    }));

    expect(service).toBeDefined();
  });
});
