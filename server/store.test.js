import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store, DEFAULT_SETTINGS } from './store.js';
let dirs = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});
async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), 'sentences-'));
  dirs = [...dirs, dir];
  return { dir, store: new Store(dir) };
}
describe('local persistence', () => {
  it('starts with defaults and persists changes atomically', async () => {
    const { dir, store } = await setup();
    await store.init();
    expect(store.snapshot.settings).toEqual(DEFAULT_SETTINGS);
    await store.update((s) => ({ ...s, settings: { ...s.settings, dailyGoal: 15 } }));
    const next = new Store(dir);
    await next.init();
    expect(next.snapshot.settings.dailyGoal).toBe(15);
  });
  it('serializes simultaneous updates', async () => {
    const { store } = await setup();
    await store.init();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.update((s) => ({ ...s, favorites: [...s.favorites, String(i)] })),
      ),
    );
    expect(store.snapshot.favorites).toHaveLength(10);
  });
  it('does not expose mutable references', async () => {
    const { store } = await setup();
    await store.init();
    const snap = store.snapshot;
    snap.settings.model = 'oops';
    expect(store.snapshot.settings.model).toBe('qwen3:14b');
  });
  it('protects invalid existing data without overwriting', async () => {
    const { dir, store } = await setup();
    await writeFile(path.join(dir, 'state.json'), 'broken');
    await expect(store.init()).rejects.toThrow('state.json');
    expect(await readFile(path.join(dir, 'state.json'), 'utf8')).toBe('broken');
  });
  it('recovers queue after a failed update', async () => {
    const { store } = await setup();
    await store.init();
    await expect(
      store.update(() => {
        throw Error('fail');
      }),
    ).rejects.toThrow('fail');
    await store.update((s) => ({ ...s, favorites: ['x'] }));
    expect(store.snapshot.favorites).toEqual(['x']);
  });
});
