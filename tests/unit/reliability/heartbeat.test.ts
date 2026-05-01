import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Heartbeat } from '../../../src/services/reliability/heartbeat.js';

describe('Heartbeat', () => {
  const testDir = join(tmpdir(), `sage-heartbeat-test-${process.pid}-${Date.now()}`);
  const path = join(testDir, 'heartbeat.json');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(path, { force: true });
  });

  it('reports missing heartbeat as stale and absent', () => {
    const hb = new Heartbeat(path);
    const status = hb.status();
    expect(status.exists).toBe(false);
    expect(status.isStale).toBe(true);
    expect(status.lastTickAt).toBeNull();
  });

  it('records and reads back a heartbeat tick', () => {
    const hb = new Heartbeat(path, 60);
    hb.touch('pipeline.preMeeting');

    const record = hb.read();
    expect(record).not.toBeNull();
    expect(record?.lastSource).toBe('pipeline.preMeeting');
    expect(record?.intervalSeconds).toBe(60);
    expect(record?.pid).toBe(process.pid);
  });

  it('marks heartbeat fresh when within 2x interval window', () => {
    const hb = new Heartbeat(path, 60);
    hb.touch('pipeline.preMeeting');

    const status = hb.status();
    expect(status.exists).toBe(true);
    expect(status.isStale).toBe(false);
    expect(status.staleSeconds).toBeGreaterThanOrEqual(0);
    expect(status.staleSeconds).toBeLessThan(5);
  });

  it('marks heartbeat stale once 2x interval has elapsed', () => {
    const hb = new Heartbeat(path, 60); // expected every 60s, stale after 120s
    hb.touch('pipeline.preMeeting');

    // Pretend 5 minutes passed
    const future = new Date(Date.now() + 5 * 60 * 1000);
    const status = hb.status(future);
    expect(status.isStale).toBe(true);
    expect(status.staleSeconds).toBeGreaterThanOrEqual(60 * 5 - 1);
  });

  it('overwrites previous tick on each touch', () => {
    const hb = new Heartbeat(path, 60);
    hb.touch('first');
    const first = hb.read();

    hb.touch('second');
    const second = hb.read();

    expect(second?.lastSource).toBe('second');
    expect(new Date(second!.lastTickAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first!.lastTickAt).getTime()
    );
  });

  it('survives bad json on disk by reporting absent', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, '{not json');
    const hb = new Heartbeat(path);
    expect(hb.read()).toBeNull();
    expect(hb.status().exists).toBe(false);
  });
});
