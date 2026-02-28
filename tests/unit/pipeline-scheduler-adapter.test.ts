import { PipelineSchedulerAdapter, createPipelineScheduler } from '../../src/services/reloadable/pipeline-scheduler-adapter.js';

describe('PipelineSchedulerAdapter', () => {
  let adapter: PipelineSchedulerAdapter;

  beforeEach(() => {
    adapter = new PipelineSchedulerAdapter(createPipelineScheduler);
  });

  it('name returns PipelineScheduler', () => {
    expect(adapter.name).toBe('PipelineScheduler');
  });

  it('dependsOnSections returns [meetingIntelligence]', () => {
    expect(adapter.dependsOnSections).toEqual(['meetingIntelligence']);
  });

  it('getInstance() returns null initially', () => {
    expect(adapter.getInstance()).toBeNull();
  });

  it('reinitialize() with disabled meetingIntelligence sets null', async () => {
    const config = {
      user: { name: 'Test' },
      meetingIntelligence: { enabled: false },
    };

    await adapter.reinitialize(config as never);

    expect(adapter.getInstance()).toBeNull();
  });

  it('reinitialize() with missing dependencies sets null', async () => {
    const config = {
      user: { name: 'Test' },
      meetingIntelligence: { enabled: true },
    };

    // No dependencies set, so initialization should skip
    await adapter.reinitialize(config as never);

    expect(adapter.getInstance()).toBeNull();
  });

  it('shutdown() calls stop() on instance', async () => {
    const mockStop = jest.fn().mockResolvedValue(undefined);
    const mockInstance = { stop: mockStop } as never;

    // Create adapter with a mock instance
    const adapterWithInstance = new PipelineSchedulerAdapter(mockInstance);

    await adapterWithInstance.shutdown();

    expect(mockStop).toHaveBeenCalled();
    expect(adapterWithInstance.getInstance()).toBeNull();
  });
});
