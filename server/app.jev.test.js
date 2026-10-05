import { afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Store } from './store.js';
import { createApp } from './app.js';
let roots = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
  roots = [];
});
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zentences-jev-'));
  roots = [...roots, root];
  await writeFile(
    path.join(root, 'Selected Notes.txt'),
    '你[ni3] nǐ you pronoun\n好[hao3] hǎo good adjective',
  );
  const store = new Store(path.join(root, 'data'));
  await store.init();
  const modelClient = {
    status: async () => ({ connected: true, models: [{ name: 'qwen3:14b' }], running: [] }),
    generate: async () => ({
      sentence: '你好。',
      pinyin: 'nǐ hǎo',
      referenceTranslation: 'Hello.',
      usedWords: ['你', '好'],
    }),
    grade: async () => ({
      score: 90,
      verdict: 'correct',
      feedback: 'Right',
      correction: 'Hello.',
      missingMeaning: [],
      alternativeTranslations: [],
    }),
    unload: vi.fn(async () => {}),
  };
  const jevClient = {
    status: vi.fn(async () => ({ connected: true, models: [{ name: 'openjev-latest' }] })),
    evaluate: vi.fn(async () => ({
      score: 95,
      confidence: 0.9,
      model: 'openjev-latest',
      probabilities: { 0: 0, 1: 0, 2: 0.15, 3: 0.85 },
    })),
  };
  const runtime = { hardware: async () => ({ chip: 'Apple M2 Max', memoryGB: 64 }) };
  const app = await createApp({ root, store, modelClient, runtime, jevClient });
  const bootstrap = (await request(app).get('/api/bootstrap').set('Host', '127.0.0.1')).body.data;
  const post = (url, data) =>
    request(app)
      .post(url)
      .set('Host', '127.0.0.1')
      .set('X-CSRF-Token', bootstrap.csrfToken)
      .send(data);
  return { post, modelClient, jevClient, app, store };
}
describe('optional second opinion', () => {
  it('stays off by default', async () => {
    const { post, jevClient } = await setup();
    const exercise = (await post('/api/generate', {})).body.data;
    const result = await post('/api/grade', { exerciseId: exercise.id, answer: 'Hello' });
    expect(result.status).toBe(200);
    expect(result.body.data.secondOpinion).toBeUndefined();
    expect(jevClient.evaluate).not.toHaveBeenCalled();
  });
  it('unloads Qwen before requesting a typed local second opinion', async () => {
    const { post, modelClient, jevClient } = await setup();
    expect((await post('/api/settings', { openJevEnabled: true })).status).toBe(200);
    await post('/api/settings', { dailyGoal: 15 });
    const exercise = (await post('/api/generate', {})).body.data;
    const result = await post('/api/grade', { exerciseId: exercise.id, answer: 'Hello' });
    expect(result.body.data.secondOpinion).toMatchObject({ score: 95, confidence: 0.9 });
    expect(modelClient.unload).toHaveBeenCalledWith('qwen3:14b');
    expect(modelClient.unload.mock.invocationCallOrder[0]).toBeLessThan(
      jevClient.evaluate.mock.invocationCallOrder[0],
    );
  });
  it('preserves Qwen feedback and records optional service errors', async () => {
    const { post, jevClient, store } = await setup();
    await post('/api/settings', { openJevEnabled: true });
    jevClient.evaluate.mockRejectedValue(new Error('OpenJev is not running'));
    const exercise = (await post('/api/generate', {})).body.data;
    const result = await post('/api/grade', { exerciseId: exercise.id, answer: 'Hello' });
    expect(result.status).toBe(200);
    expect(result.body.data.secondOpinionError).toContain('not running');
    expect(result.body.data.score).toBe(90);
    expect(store.snapshot.history).toHaveLength(1);
  });
});
