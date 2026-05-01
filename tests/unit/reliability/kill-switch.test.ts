import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KillSwitch, KillSwitchActiveError } from '../../../src/services/reliability/kill-switch.js';

describe('KillSwitch', () => {
  const testDir = join(tmpdir(), `sage-killswitch-test-${process.pid}-${Date.now()}`);
  const switchPath = join(testDir, 'STOP');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(switchPath, { force: true });
  });

  it('reports inactive when file is absent', () => {
    const ks = new KillSwitch(switchPath);
    expect(ks.isActive()).toBe(false);
    expect(() => ks.assertNotKilled()).not.toThrow();
  });

  it('reports active and throws when file exists', async () => {
    await writeFile(switchPath, '');
    const ks = new KillSwitch(switchPath);

    expect(ks.isActive()).toBe(true);
    expect(() => ks.assertNotKilled()).toThrow(KillSwitchActiveError);
  });

  it('includes operation name in error message when provided', async () => {
    await writeFile(switchPath, '');
    const ks = new KillSwitch(switchPath);

    expect(() => ks.assertNotKilled('create_calendar_event')).toThrow(
      /refusing to create_calendar_event/
    );
  });

  it('exposes the configured path', () => {
    const ks = new KillSwitch(switchPath);
    expect(ks.getPath()).toBe(switchPath);
  });

  it('toggles active state across file create/delete', async () => {
    const ks = new KillSwitch(switchPath);
    expect(ks.isActive()).toBe(false);

    await writeFile(switchPath, '');
    expect(ks.isActive()).toBe(true);

    await rm(switchPath, { force: true });
    expect(ks.isActive()).toBe(false);
  });
});
