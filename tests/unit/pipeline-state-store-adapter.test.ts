import { PipelineStateStoreAdapter, createPipelineStateStore } from '../../src/services/reloadable/pipeline-state-store-adapter.js';

describe('PipelineStateStoreAdapter', () => {
  let adapter: PipelineStateStoreAdapter;

  beforeEach(() => {
    adapter = new PipelineStateStoreAdapter(createPipelineStateStore);
  });

  it('name returns PipelineStateStore', () => {
    expect(adapter.name).toBe('PipelineStateStore');
  });

  it('dependsOnSections returns [meetingIntelligence]', () => {
    expect(adapter.dependsOnSections).toEqual(['meetingIntelligence']);
  });

  it('getInstance() returns null initially', () => {
    expect(adapter.getInstance()).toBeNull();
  });

  it('shutdown() calls flush() then sets null', async () => {
    const mockFlush = jest.fn().mockResolvedValue(undefined);
    const mockInstance = { flush: mockFlush } as never;

    const adapterWithInstance = new PipelineStateStoreAdapter(mockInstance);

    await adapterWithInstance.shutdown();

    expect(mockFlush).toHaveBeenCalled();
    expect(adapterWithInstance.getInstance()).toBeNull();
  });

  it('reinitialize() creates instance and calls load()', async () => {
    const mockLoad = jest.fn().mockResolvedValue(undefined);
    const mockCreatedInstance = { load: mockLoad };
    const mockFactory = jest.fn().mockReturnValue(mockCreatedInstance);

    const adapterWithFactory = new PipelineStateStoreAdapter(mockFactory as never);
    const config = { user: { name: 'Test' } };

    await adapterWithFactory.reinitialize(config as never);

    expect(mockFactory).toHaveBeenCalledWith(config);
    expect(mockLoad).toHaveBeenCalled();
    expect(adapterWithFactory.getInstance()).toBe(mockCreatedInstance);
  });
});
