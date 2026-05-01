import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('reliability/kill-switch');

const DEFAULT_KILL_SWITCH_PATH = join(homedir(), '.sage', 'STOP');

export class KillSwitchActiveError extends Error {
  readonly code = 'KILL_SWITCH_ACTIVE';

  constructor(message: string) {
    super(message);
    this.name = 'KillSwitchActiveError';
  }
}

/**
 * File-based emergency stop.
 *
 * `touch ~/.sage/STOP` from any shell halts proactive ticks and write tools
 * within one filesystem check. `rm` of the same file resumes operation.
 */
export class KillSwitch {
  constructor(private readonly path: string = DEFAULT_KILL_SWITCH_PATH) {}

  isActive(): boolean {
    return existsSync(this.path);
  }

  assertNotKilled(operation?: string): void {
    if (!this.isActive()) return;

    const message = operation
      ? `Kill switch active at ${this.path}; refusing to ${operation}`
      : `Kill switch active at ${this.path}`;
    logger.warn({ path: this.path, operation }, 'kill switch active, blocking operation');
    throw new KillSwitchActiveError(message);
  }

  getPath(): string {
    return this.path;
  }
}
