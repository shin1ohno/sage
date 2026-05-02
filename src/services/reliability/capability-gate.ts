import type { AutonomyConfig, AutonomyTier } from '../../types/config.js';

export type GateDecision =
  | { kind: 'allow'; tier: 0 }
  | { kind: 'pending'; tier: 1 }
  | { kind: 'deny'; tier: 2 };

/**
 * Reads the autonomy config and decides whether a tool may execute now,
 * needs explicit confirmation, or is forbidden. Defaults conservatively
 * to Tier 1 (pending) when the tool is not enumerated in the matrix.
 */
export class CapabilityGate {
  constructor(private autonomy: AutonomyConfig | undefined) {}

  updateConfig(autonomy: AutonomyConfig | undefined): void {
    this.autonomy = autonomy;
  }

  /**
   * Resolve the tier for a given tool. Tools not present in the matrix
   * default to Tier 1.
   */
  tierFor(toolName: string): AutonomyTier {
    if (!this.autonomy) return 1;
    const explicit = this.autonomy.tools[toolName];
    if (explicit === 0 || explicit === 1 || explicit === 2) return explicit;
    return 1;
  }

  decide(toolName: string): GateDecision {
    const tier = this.tierFor(toolName);
    if (tier === 0) return { kind: 'allow', tier: 0 };
    if (tier === 2) return { kind: 'deny', tier: 2 };
    return { kind: 'pending', tier: 1 };
  }

  pendingTTLMinutes(): number {
    return this.autonomy?.pendingActionTTLMinutes ?? 30;
  }
}
