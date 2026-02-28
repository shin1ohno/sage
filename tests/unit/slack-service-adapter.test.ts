import { SlackServiceAdapter, createSlackService } from '../../src/services/reloadable/slack-service-adapter.js';

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
