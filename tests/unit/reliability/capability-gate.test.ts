import { CapabilityGate } from '../../../src/services/reliability/capability-gate.js';

describe('CapabilityGate', () => {
  it('returns Tier 1 (pending) when autonomy config is missing', () => {
    const gate = new CapabilityGate(undefined);
    const decision = gate.decide('create_calendar_event');
    expect(decision.kind).toBe('pending');
    expect(decision.tier).toBe(1);
  });

  it('returns Tier 1 when tool is unknown in matrix', () => {
    const gate = new CapabilityGate({ tools: {}, pendingActionTTLMinutes: 30 });
    expect(gate.decide('unknown_tool').kind).toBe('pending');
  });

  it('honours an explicit Tier 0 override', () => {
    const gate = new CapabilityGate({
      tools: { create_calendar_event: 0 },
      pendingActionTTLMinutes: 30,
    });
    expect(gate.decide('create_calendar_event').kind).toBe('allow');
  });

  it('returns deny for Tier 2 tools', () => {
    const gate = new CapabilityGate({
      tools: { delete_calendar_events_batch: 2 },
      pendingActionTTLMinutes: 30,
    });
    expect(gate.decide('delete_calendar_events_batch').kind).toBe('deny');
  });

  it('updateConfig applies new policy live', () => {
    const gate = new CapabilityGate({
      tools: { sync_to_notion: 1 },
      pendingActionTTLMinutes: 30,
    });
    expect(gate.decide('sync_to_notion').kind).toBe('pending');
    gate.updateConfig({ tools: { sync_to_notion: 0 }, pendingActionTTLMinutes: 30 });
    expect(gate.decide('sync_to_notion').kind).toBe('allow');
  });

  it('exposes pendingTTLMinutes with default 30', () => {
    expect(new CapabilityGate(undefined).pendingTTLMinutes()).toBe(30);
    expect(
      new CapabilityGate({ tools: {}, pendingActionTTLMinutes: 5 }).pendingTTLMinutes()
    ).toBe(5);
  });
});
