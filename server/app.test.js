import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, DEFAULT_SETTINGS } from './store.js';
import { createApp, chooseTarget } from './app.js';
import { ModelClient } from './model.js';

const notes = '我[wo3] wǒ I; me pronoun\n你[ni3] nǐ you pronoun\n好[hao3] hǎo good adjective';
const status = { connected: true, models: [{ name: 'qwen3:14b', size: 9300000000 }], running: [] };
const generated = {
  sentence: '你好。',
  pinyin: 'nǐ hǎo',
  referenceTranslation: 'Hello.',
  usedWords: ['你', '好'],
  explanation: 'A greeting',
};
const judgment = {
  score: 95,
  verdict: 'close',
  feedback: 'You captured the meaning.',
  correction: 'Hello.',
  missingMeaning: [],
  alternativeTranslations: ['Hi.'],
};
let root, store, modelClient, runtime, app, csrfToken, targetId;
const get = (url) => request(app).get(url).set('Host', '127.0.0.1');
const post = (url, body) =>
  request(app).post(url).set('Host', '127.0.0.1').set('X-CSRF-Token', csrfToken).send(body);
async function generate() {
  const response = await post('/api/generate', { targetId });
  expect(response.status).toBe(200);
  return response.body.data;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'zentences-api-'));
  await writeFile(path.join(root, 'Selected Notes.txt'), notes);
  store = new Store(path.join(root, 'data'));
  await store.init();
  modelClient = {
    status: vi.fn(async () => status),
    generate: vi.fn(async () => generated),
    grade: vi.fn(async () => judgment),
    pull: vi.fn(async (_model, onProgress) => {
      onProgress?.({ status: 'success', completed: 100, total: 100 });
      return { status: 'success' };
    }),
  };
  runtime = {
    start: vi.fn(async () => status),
    localFiles: vi.fn(async () => ['test.gguf']),
    importModel: vi.fn(async () => ({ name: 'zentences-local' })),
    hardware: vi.fn(async () => ({ chip: 'Apple M2 Max', memoryGB: 64 })),
  };
  app = await createApp({ root, store, modelClient, runtime });
  const bootstrap = await get('/api/bootstrap');
  csrfToken = bootstrap.body.data.csrfToken;
  targetId = bootstrap.body.data.words.find((word) => word.hanzi === '你').id;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('local app API', () => {
  it('bootstraps vocabulary, persisted state, hardware and local runtime', async () => {
    const response = await get('/api/bootstrap');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.words.map((word) => word.hanzi)).toEqual(['我', '你', '好']);
    expect(response.body.data).toMatchObject({
      settings: DEFAULT_SETTINGS,
      history: [],
      favorites: [],
      hardware: { chip: 'Apple M2 Max', memoryGB: 64 },
    });
    expect(response.body.data.csrfToken).toEqual(expect.any(String));
    expect(response.body.data.catalog.length).toBeGreaterThan(0);
  });
  it('generates from the headword bank and hides the reference answer', async () => {
    const exercise = await generate();
    expect(exercise).toMatchObject({
      id: expect.any(String),
      sentence: '你好。',
      usedWords: ['你', '好'],
    });
    expect(exercise.referenceTranslation).toBeUndefined();
    expect(exercise.explanation).toBeUndefined();
    expect(modelClient.generate).toHaveBeenCalledOnce();
    expect(modelClient.generate.mock.calls[0][0].words.map((word) => word.hanzi)).toEqual([
      '我',
      '你',
      '好',
    ]);
    expect(modelClient.generate.mock.calls[0][0].target.hanzi).toBe('你');
    expect(modelClient.generate.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(store.snapshot.exercises).toHaveLength(1);
    expect(store.snapshot.exercises[0]).toMatchObject({
      id: exercise.id,
      referenceTranslation: 'Hello.',
    });
  });
  it('returns a safe exercise after repeated model validation failures', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => {
      if (fetchImpl.mock.calls.length > 20) throw new Error('Test response sequence exhausted');
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify(
              fetchImpl.mock.calls.length <= 5
                ? { ...generated, sentence: '你喜欢猫。' }
                : { ...generated, sentence: '好。' },
            ),
          },
        }),
      );
    });
    const client = new ModelClient({ fetchImpl });
    modelClient.generate.mockImplementation((input) => client.generate(input));
    const exercise = await generate();
    expect(exercise.sentence).toBe('好。');
    expect(exercise.target.hanzi).toBe('好');
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(store.snapshot.exercises).toHaveLength(1);
    expect(store.snapshot.exercises[0].target).toEqual(exercise.target);
    const grade = await post('/api/grade', { exerciseId: exercise.id, answer: 'Good.' });
    expect(grade.status).toBe(200);
    expect(store.snapshot.history[0].targetId).toBe(exercise.target.id);
  });
  it('cancels disconnected generation without saving and releases the inference lock', async () => {
    let started;
    let cancelled;
    const began = new Promise((resolve) => {
      started = resolve;
    });
    const stopped = new Promise((resolve) => {
      cancelled = resolve;
    });
    modelClient.generate.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          started();
          signal?.addEventListener(
            'abort',
            () => {
              cancelled();
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    );
    const pending = post('/api/generate', { targetId });
    pending.end(() => {});
    await began;
    pending.abort();
    await stopped;
    expect(store.snapshot.exercises).toHaveLength(0);
    expect((await post('/api/generate', { targetId })).status).toBe(200);
  });
  it('grades a saved exercise, records the result and reveals its reference', async () => {
    const exercise = await generate();
    const response = await post('/api/grade', { exerciseId: exercise.id, answer: 'Hi!' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ score: 95, feedback: judgment.feedback });
    expect(store.snapshot.history).toHaveLength(1);
    expect(modelClient.grade).toHaveBeenCalledOnce();
    expect(modelClient.grade.mock.calls[0][0]).toMatchObject({
      sentence: '你好。',
      referenceTranslation: 'Hello.',
      answer: 'Hi!',
    });
    const saved = JSON.parse(await readFile(path.join(root, 'data', 'state.json'), 'utf8'));
    expect(saved.history).toHaveLength(1);
  });
  it('rejects unknown exercises and caller-supplied answer material', async () => {
    const missing = await post('/api/grade', { exerciseId: 'missing', answer: 'Hello' });
    expect(missing.status).toBe(404);
    const exercise = await generate();
    const forged = await post('/api/grade', {
      exerciseId: exercise.id,
      answer: 'Hello',
      referenceTranslation: 'Anything',
      sentence: '不同',
    });
    expect(forged.status).toBe(400);
    expect(modelClient.grade).not.toHaveBeenCalled();
  });
  it('prevents duplicate history when the same answer is submitted twice', async () => {
    const exercise = await generate();
    const body = { exerciseId: exercise.id, answer: 'Hello' };
    expect((await post('/api/grade', body)).status).toBe(200);
    const duplicate = await post('/api/grade', body);
    expect([200, 409]).toContain(duplicate.status);
    expect(store.snapshot.history).toHaveLength(1);
    expect(modelClient.grade).toHaveBeenCalledOnce();
  });
  it('validates settings and persists accepted preferences', async () => {
    const settings = { ...DEFAULT_SETTINGS, dailyGoal: 15, difficulty: 'challenge' };
    const accepted = await post('/api/settings', settings);
    expect(accepted.status).toBe(200);
    expect(store.snapshot.settings).toEqual(settings);
    expect((await post('/api/settings', { showPinyin: true })).status).toBe(200);
    expect(store.snapshot.settings).toEqual({ ...settings, showPinyin: true });
    const invalid = await post('/api/settings', { ...settings, sessionLength: 999 });
    expect(invalid.status).toBe(400);
    expect(store.snapshot.settings).toEqual({ ...settings, showPinyin: true });
  });
  it('validates favorites against imported vocabulary', async () => {
    expect((await post('/api/favorites', { wordId: targetId, favorite: true })).status).toBe(200);
    expect(store.snapshot.favorites).toContain(targetId);
    expect((await post('/api/favorites', { wordId: 'outside', favorite: true })).status).toBe(404);
    expect((await post('/api/favorites', { wordId: targetId, favorite: false })).status).toBe(200);
    expect(store.snapshot.favorites).not.toContain(targetId);
  });
  it('reloads edited vocabulary without harvesting examples', async () => {
    await writeFile(path.join(root, 'Selected Notes.txt'), `${notes}\n爱[ai4] ài love verb`);
    const response = await post('/api/reload', {});
    expect(response.status).toBe(200);
    expect((await get('/api/bootstrap')).body.data.words.map((word) => word.hanzi)).toContain('爱');
  });
  it('starts the runtime and imports only a selected local model file', async () => {
    expect((await post('/api/runtime/start', {})).status).toBe(200);
    expect(runtime.start).toHaveBeenCalledOnce();
    expect((await post('/api/models/import', { filename: 'test.gguf' })).status).toBe(200);
    expect(runtime.importModel).toHaveBeenCalledOnce();
    expect((await post('/api/models/import', { filename: '../../private.gguf' })).status).toBe(400);
    expect(runtime.importModel).toHaveBeenCalledOnce();
  });
  it('streams model download progress from the curated catalog', async () => {
    const response = await post('/api/models/pull', { model: 'qwen3:14b' });
    expect(response.status).toBe(200);
    expect(modelClient.pull).toHaveBeenCalledOnce();
    expect(response.text).toContain('success');
  });
  it('exports progress as a downloadable JSON document', async () => {
    const response = await get('/api/export');
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.body).toMatchObject({
      success: true,
      data: { settings: DEFAULT_SETTINGS, history: [], favorites: [] },
    });
  });
  it('rejects invalid target and difficulty selections before generation', async () => {
    expect((await post('/api/generate', { targetId: 'outside' })).status).toBe(404);
    expect((await post('/api/generate', { targetId, difficulty: 'impossible' })).status).toBe(400);
    expect(modelClient.generate).not.toHaveBeenCalled();
  });
  it('returns a clear error when the model is unavailable', async () => {
    modelClient.generate.mockRejectedValueOnce(
      new Error('The local model is unavailable. Download it first.'),
    );
    const response = await post('/api/generate', { targetId });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).toMatchObject({ success: false, error: expect.any(String) });
    expect(response.body.error).toMatch(/model|download|unavailable/i);
    expect((await post('/api/generate', { targetId })).status).toBe(200);
  });
  it('uses automatic target selection when no word is requested', async () => {
    const response = await post('/api/generate', {});
    expect(response.status).toBe(200);
    expect(['我', '你', '好']).toContain(response.body.data.target.hanzi);
  });
  it('checks disconnected, missing and cloud model selections before inference', async () => {
    modelClient.status.mockResolvedValueOnce({ connected: false, models: [], running: [] });
    const disconnected = await post('/api/generate', { targetId });
    expect(disconnected.status).toBe(503);
    expect(disconnected.body.error).toContain('Ollama');
    modelClient.status.mockResolvedValueOnce({ connected: true, models: [], running: [] });
    const missing = await post('/api/generate', { targetId });
    expect(missing.status).toBe(503);
    expect(missing.body.error).toContain('downloaded');
    expect((await post('/api/settings', { model: 'qwen3:cloud' })).status).toBe(400);
    await store.update((state) => ({
      ...state,
      settings: { ...state.settings, model: 'qwen3:cloud' },
    }));
    const cloud = await post('/api/generate', { targetId });
    expect(cloud.status).toBe(503);
    expect(cloud.body.error).toContain('Cloud');
    expect(modelClient.generate).not.toHaveBeenCalled();
  });
  it('serializes inference and model operations without concurrent model calls', async () => {
    let finish;
    let started;
    const began = new Promise((resolve) => {
      started = resolve;
    });
    modelClient.generate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const first = post('/api/generate', { targetId }).then((response) => response);
    await began;
    expect((await post('/api/generate', { targetId })).status).toBe(409);
    expect((await post('/api/reload', {})).status).toBe(409);
    expect((await post('/api/models/import', { filename: 'test.gguf' })).status).toBe(409);
    expect((await post('/api/models/pull', { model: 'qwen3:14b' })).status).toBe(409);
    finish(generated);
    expect((await first).status).toBe(200);
    expect(modelClient.generate).toHaveBeenCalledOnce();
  });
  it('reports runtime failures and allows a later successful retry', async () => {
    runtime.start.mockRejectedValueOnce(new Error('Install Ollama before starting.'));
    const failed = await post('/api/runtime/start', {});
    expect(failed.status).toBe(503);
    expect(failed.body.error).toContain('Ollama');
    expect((await post('/api/runtime/start', {})).status).toBe(200);
    expect((await get('/api/runtime')).body.data).toEqual(status);
    expect((await get('/api/models/local')).body.data.files).toEqual(['test.gguf']);
    expect((await get('/api/history')).body.data).toEqual([]);
  });
  it('returns SSE errors and releases the download lock after failure', async () => {
    modelClient.pull.mockRejectedValueOnce(new Error('Not enough disk space.'));
    const failed = await post('/api/models/pull', { model: 'qwen3:14b' });
    expect(failed.status).toBe(200);
    expect(failed.text).toContain('event: error');
    expect(failed.text).toContain('Not enough disk space.');
    expect((await post('/api/generate', { targetId })).status).toBe(200);
  });
  it('blocks practice while a model download is active', async () => {
    let finish;
    let started;
    const began = new Promise((resolve) => {
      started = resolve;
    });
    modelClient.pull.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const download = post('/api/models/pull', { model: 'qwen3:14b' }).then((response) => response);
    await began;
    expect((await post('/api/generate', { targetId })).status).toBe(409);
    expect((await post('/api/models/import', { filename: 'test.gguf' })).status).toBe(409);
    finish();
    expect((await download).text).toContain('event: done');
  });
  it('preserves the loaded bank after a failed reload and recovers model imports', async () => {
    await writeFile(path.join(root, 'Selected Notes.txt'), 'No headwords here');
    expect((await post('/api/reload', {})).status).toBe(503);
    expect((await get('/api/bootstrap')).body.data.words.map((word) => word.hanzi)).toEqual([
      '我',
      '你',
      '好',
    ]);
    runtime.importModel.mockRejectedValueOnce(new Error('Model import failed.'));
    expect((await post('/api/models/import', { filename: 'test.gguf' })).status).toBe(503);
    expect((await post('/api/models/import', { filename: 'test.gguf' })).status).toBe(200);
  });
  it('returns JSON for unknown API paths', async () => {
    const response = await get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: expect.any(String) });
  });
});

describe('local API request boundaries', () => {
  it('requires a CSRF token for mutations', async () => {
    const response = await request(app)
      .post('/api/generate')
      .set('Host', '127.0.0.1')
      .send({ targetId });
    expect(response.status).toBe(403);
    expect(modelClient.generate).not.toHaveBeenCalled();
  });
  it('rejects cross-origin mutations even with the token', async () => {
    const response = await post('/api/generate', { targetId }).set(
      'Origin',
      'https://attacker.example',
    );
    expect(response.status).toBe(403);
    expect(modelClient.generate).not.toHaveBeenCalled();
  });
  it('accepts same-origin writes and rejects malformed or mismatched local origins', async () => {
    expect(
      (await post('/api/settings', { showPinyin: true }).set('Origin', 'http://127.0.0.1')).status,
    ).toBe(200);
    expect(
      (await post('/api/settings', { showPinyin: false }).set('Origin', 'not-a-url')).status,
    ).toBe(403);
    expect(
      (await post('/api/settings', { showPinyin: false }).set('Origin', 'http://localhost')).status,
    ).toBe(403);
    expect(
      (await post('/api/settings', { showPinyin: false }).set('Origin', 'https://127.0.0.1'))
        .status,
    ).toBe(403);
  });
  it('rejects untrusted hosts to prevent DNS rebinding', async () => {
    const response = await request(app).get('/api/bootstrap').set('Host', 'attacker.example');
    expect(response.status).toBe(403);
  });
  it('rejects empty, malformed, oversized and unknown mutation fields', async () => {
    expect((await post('/api/grade', {})).status).toBe(400);
    const malformed = await request(app)
      .post('/api/grade')
      .set('Host', '127.0.0.1')
      .set('X-CSRF-Token', csrfToken)
      .set('Content-Type', 'application/json')
      .send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.body.success).toBe(false);
    expect((await post('/api/grade', { exerciseId: 'x', answer: 'a'.repeat(10001) })).status).toBe(
      400,
    );
    const huge = await post('/api/grade', { exerciseId: 'x', answer: 'a'.repeat(100000) });
    expect(huge.status).toBe(413);
    expect(huge.body.success).toBe(false);
  });
});

describe('practice target rotation', () => {
  const words = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('prefers vocabulary that was not practiced recently', () => {
    expect(
      chooseTarget(words, [
        { targetId: 'a', score: 20 },
        { targetId: 'b', score: 100 },
      ]),
    ).toEqual(words[2]);
  });
  it('falls back to all words when every word was practiced recently', () => {
    expect(words).toContain(
      chooseTarget(
        words,
        words.map((word) => ({ targetId: word.id, score: 90 })),
      ),
    );
  });
  it('can revisit previously missed vocabulary after it leaves the recent window', () => {
    const history = [
      { targetId: 'a', score: 20 },
      ...Array.from({ length: 10 }, () => ({ targetId: 'c', score: 100 })),
    ];
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(chooseTarget(words, history)).toEqual(words[0]);
    random.mockRestore();
  });
});
