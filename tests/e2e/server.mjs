import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.js';
import { Store } from '../../server/store.js';
const dir = await mkdtemp(path.join(os.tmpdir(), 'zentences-e2e-'));
const store = new Store(dir);
await store.init();
let status = { connected: true, models: [{ name: 'qwen3:14b', size: 9300000000 }], running: [] };
const modelClient = {
  status: async () => status,
  generate: async () => ({
    sentence: '我今天想去学校。',
    pinyin: 'Wǒ jīntiān xiǎng qù xuéxiào.',
    referenceTranslation: 'I want to go to school today.',
    usedWords: ['我', '今天', '想', '去', '学校'],
    explanation: 'A wish to go to school.',
  }),
  grade: async ({ answer }) => ({
    score: answer.includes('today') ? 96 : 72,
    verdict: answer.includes('today') ? 'correct' : 'close',
    feedback: answer.includes('today')
      ? 'You captured the subject, intention, place, and time.'
      : 'You captured the main idea. The sentence also says today.',
    correction: 'I want to go to school today.',
    missingMeaning: answer.includes('today') ? [] : ['今天 means today.'],
    alternativeTranslations: ['I would like to go to school today.'],
  }),
  pull: async (model, onProgress) => {
    onProgress({ status: 'pulling', completed: 50, total: 100 });
    status = {
      ...status,
      models: [
        ...status.models.filter((item) => item.name !== model),
        { name: model, size: 5200000000 },
      ],
    };
    onProgress({ status: 'success' });
  },
  unload: async () => {},
};
const runtime = {
  hardware: async () => ({ chip: 'Apple M2 Max', memoryGB: 64 }),
  start: async () => status,
  localFiles: async () => [],
  importModel: async () => ({ name: 'test-model' }),
};
const app = await createApp({
  root: process.cwd(),
  store,
  modelClient,
  runtime,
  jevClient: { status: async () => ({ connected: false, models: [] }) },
});
app.use(express.static(path.join(process.cwd(), 'dist')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(process.cwd(), 'dist', 'index.html')));
const server = app.listen(4173, '127.0.0.1', () => console.log('E2E fixture ready'));
async function stop() {
  server.close();
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
