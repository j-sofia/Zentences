import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadNotes } from './notes.js';
import { settingsSchema } from './store.js';
import { MODEL_CATALOG } from './model.js';
import { JevClient } from './jev.js';

const idSchema = z.string().min(1).max(100);
const difficultySchema = z.enum(['gentle', 'balanced', 'challenge']);
const fail = (res, status, error) => res.status(status).json({ success: false, error });
const ok = (res, data) => res.json({ success: true, data });
const publicExercise = ({ referenceTranslation, explanation, ...exercise }) => exercise;
const localHost = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host ?? '');
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

export async function createApp({
  root,
  store,
  modelClient,
  runtime,
  jevClient = new JevClient(),
  development = false,
}) {
  const app = express();
  let vocabulary = await loadNotes(root);
  const csrfToken = randomBytes(32).toString('hex');
  let inferenceBusy = false;
  let downloadBusy = false;
  app.disable('x-powered-by');
  app.use((req, res, next) =>
    localHost(req.headers.host)
      ? next()
      : fail(res, 403, 'This app is only available on localhost.'),
  );
  app.use(
    helmet({
      contentSecurityPolicy: development
        ? false
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              upgradeInsecureRequests: null,
            },
          },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) => fail(res, 429, 'Too many requests. Wait a moment and retry.'),
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (
          !localHost(parsed.host) ||
          parsed.host !== req.headers.host ||
          parsed.protocol !== 'http:'
        )
          return fail(res, 403, 'Requests must come from this local app.');
      } catch {
        return fail(res, 403, 'Invalid request origin.');
      }
    }
    if (req.headers['x-csrf-token'] !== csrfToken)
      return fail(res, 403, 'Refresh the page before making changes.');
    next();
  });
  async function infer(res, work) {
    if (inferenceBusy)
      return fail(res, 409, 'A model request is already running. Wait for it to finish.');
    if (downloadBusy)
      return fail(res, 409, 'Wait for the model download to finish before practicing.');
    inferenceBusy = true;
    try {
      return await work();
    } finally {
      inferenceBusy = false;
    }
  }
  async function checkModel(model) {
    if (/cloud/i.test(model))
      throw new Error('Choose a local model. Cloud models are not supported.');
    const status = await modelClient.status();
    if (!status.connected)
      throw new Error('Ollama is not running. Open Local model and start the runtime.');
    if (!status.models.some((m) => m.name === model || m.name === `${model}:latest`))
      throw new Error(
        'The selected model has not been downloaded. Open Local model to install or select an available model.',
      );
  }
  app.get(
    '/api/bootstrap',
    asyncRoute(async (req, res) => {
      const state = store.snapshot;
      const [hardware, status, jev] = await Promise.all([
        runtime.hardware(),
        modelClient.status(),
        jevClient.status(),
      ]);
      ok(res, {
        ...vocabulary,
        settings: state.settings,
        history: state.history,
        favorites: state.favorites,
        hardware,
        catalog: MODEL_CATALOG,
        runtime: status,
        jev,
        csrfToken,
      });
    }),
  );
  app.get(
    '/api/jev',
    asyncRoute(async (req, res) => ok(res, await jevClient.status())),
  );
  app.get(
    '/api/runtime',
    asyncRoute(async (req, res) => ok(res, await modelClient.status())),
  );
  app.post(
    '/api/runtime/start',
    asyncRoute(async (req, res) => ok(res, await runtime.start())),
  );
  app.get(
    '/api/models/local',
    asyncRoute(async (req, res) => ok(res, { files: await runtime.localFiles() })),
  );
  app.post(
    '/api/models/import',
    asyncRoute(async (req, res) => {
      const { filename } = z
        .object({
          filename: z
            .string()
            .min(1)
            .max(200)
            .regex(/^[^/\\\r\n"]+\.gguf$/i),
        })
        .strict()
        .parse(req.body);
      if (downloadBusy || inferenceBusy)
        return fail(res, 409, 'Wait for the current model operation to finish.');
      downloadBusy = true;
      try {
        ok(res, await runtime.importModel(filename));
      } finally {
        downloadBusy = false;
      }
    }),
  );
  app.post(
    '/api/models/pull',
    asyncRoute(async (req, res) => {
      const { model } = z
        .object({ model: z.enum(MODEL_CATALOG.map((m) => m.tag)) })
        .strict()
        .parse(req.body);
      if (downloadBusy || inferenceBusy)
        return fail(res, 409, 'Wait for the current model operation to finish.');
      downloadBusy = true;
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      const send = (event, data) => {
        if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      try {
        await modelClient.pull(model, (progress) => send('progress', progress), {
          signal: controller.signal,
        });
        send('done', { model });
      } catch (error) {
        if (!controller.signal.aborted) send('error', { error: error.message });
      } finally {
        downloadBusy = false;
        res.end();
      }
    }),
  );
  app.post(
    '/api/settings',
    asyncRoute(async (req, res) => {
      const changes = settingsSchema.partial().parse(req.body);
      if (changes.model && /cloud/i.test(changes.model))
        return fail(res, 400, 'Only local models are supported.');
      const state = await store.update((s) => ({ ...s, settings: { ...s.settings, ...changes } }));
      ok(res, state.settings);
    }),
  );
  app.post(
    '/api/reload',
    asyncRoute(async (req, res) => {
      if (inferenceBusy) return fail(res, 409, 'Wait for the current exercise to finish.');
      vocabulary = await loadNotes(root);
      ok(res, vocabulary);
    }),
  );
  app.post(
    '/api/favorites',
    asyncRoute(async (req, res) => {
      const { wordId, favorite } = z
        .object({ wordId: idSchema, favorite: z.boolean() })
        .strict()
        .parse(req.body);
      if (!vocabulary.words.some((w) => w.id === wordId))
        return fail(res, 404, 'Vocabulary word not found. Reload the word bank.');
      const state = await store.update((s) => ({
        ...s,
        favorites: favorite
          ? [...new Set([...s.favorites, wordId])]
          : s.favorites.filter((id) => id !== wordId),
      }));
      ok(res, state.favorites);
    }),
  );
  app.post(
    '/api/generate',
    asyncRoute(async (req, res) => {
      const input = z
        .object({ targetId: idSchema.optional(), difficulty: difficultySchema.optional() })
        .strict()
        .parse(req.body ?? {});
      const state = store.snapshot;
      const target = input.targetId
        ? vocabulary.words.find((w) => w.id === input.targetId)
        : chooseTarget(vocabulary.words, state.history);
      if (!target) return fail(res, 404, 'Vocabulary word not found.');
      return infer(res, async () => {
        const controller = new AbortController();
        const cancel = () => {
          if (!res.writableEnded) controller.abort(new Error('Generation cancelled.'));
        };
        res.on('close', cancel);
        try {
          await checkModel(state.settings.model);
          const difficulty = input.difficulty ?? state.settings.difficulty;
          const generated = await modelClient.generate({
            model: state.settings.model,
            words: vocabulary.words,
            target,
            difficulty,
            avoid: state.exercises.slice(-20).map((e) => e.sentence),
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          const exercise = {
            ...generated,
            id: randomUUID(),
            target: generated.target ?? target,
            difficulty,
            model: state.settings.model,
            createdAt: new Date().toISOString(),
          };
          await store.update((s) => ({ ...s, exercises: [...s.exercises, exercise].slice(-200) }));
          ok(res, publicExercise(exercise));
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        } finally {
          res.off('close', cancel);
        }
      });
    }),
  );
  app.post(
    '/api/grade',
    asyncRoute(async (req, res) => {
      const { exerciseId, answer } = z
        .object({ exerciseId: idSchema, answer: z.string().trim().min(1).max(2000) })
        .strict()
        .parse(req.body);
      const state = store.snapshot;
      const exercise = state.exercises.find((e) => e.id === exerciseId);
      if (!exercise) return fail(res, 404, 'This exercise has expired. Generate a new sentence.');
      if (state.history.some((h) => h.exerciseId === exerciseId))
        return fail(res, 409, 'This exercise has already been graded. Generate a new sentence.');
      return infer(res, async () => {
        await checkModel(exercise.model);
        const evaluation = await modelClient.grade({
          model: exercise.model,
          sentence: exercise.sentence,
          referenceTranslation: exercise.referenceTranslation,
          answer,
        });
        let optionalOpinion = {};
        if (state.settings.openJevEnabled) {
          try {
            await modelClient.unload(exercise.model);
            optionalOpinion = {
              secondOpinion: await jevClient.evaluate({
                sentence: exercise.sentence,
                referenceTranslation: exercise.referenceTranslation,
                answer,
              }),
            };
          } catch (error) {
            optionalOpinion = { secondOpinionError: error.message };
          }
        }
        const entry = {
          ...evaluation,
          ...optionalOpinion,
          id: randomUUID(),
          exerciseId,
          sentence: exercise.sentence,
          pinyin: exercise.pinyin,
          answer,
          referenceTranslation: exercise.referenceTranslation,
          usedWords: exercise.usedWords,
          targetId: exercise.target.id,
          model: exercise.model,
          createdAt: new Date().toISOString(),
        };
        await store.update((s) => ({ ...s, history: [...s.history, entry] }));
        ok(res, entry);
      });
    }),
  );
  app.get('/api/history', (req, res) => ok(res, store.snapshot.history));
  app.get('/api/export', (req, res) => {
    const { exercises, ...state } = store.snapshot;
    res.set('Content-Disposition', 'attachment; filename="zentences-progress.json"');
    ok(res, { ...state, source: vocabulary.source, exportedAt: new Date().toISOString() });
  });
  app.use('/api', (req, res) => fail(res, 404, 'API endpoint not found.'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError)
      return fail(
        res,
        400,
        `Invalid input: ${error.issues.map((issue) => `${issue.path.join('.') || 'request'} ${issue.message}`).join('; ')}`,
      );
    if (error.type === 'entity.too.large') return fail(res, 413, 'Request is too large.');
    if (error instanceof SyntaxError && 'body' in error)
      return fail(res, 400, 'Use valid JSON for this request.');
    console.error('[Zentences]', error.message);
    fail(res, 503, error.message || 'The local operation failed. Retry in a moment.');
  });
  return app;
}

export function chooseTarget(words, history) {
  const recent = history.slice(-10).map((h) => h.targetId);
  const available = words.filter((w) => !recent.includes(w.id));
  const pool = available.length ? available : words;
  const weighted = pool.flatMap((word) => {
    const last = history.findLast((h) => h.targetId === word.id);
    return Array.from({ length: last ? (last.score < 70 ? 4 : 1) : 3 }, () => word);
  });
  return weighted[Math.floor(Math.random() * weighted.length)];
}
