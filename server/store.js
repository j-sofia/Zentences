import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
export const DEFAULT_SETTINGS = Object.freeze({
  model: 'qwen3:14b',
  difficulty: 'balanced',
  sessionLength: 10,
  dailyGoal: 10,
  showPinyin: false,
  openJevEnabled: false,
});
export const settingsSchema = z
  .object({
    model: z.string().regex(/^[\w./:-]{1,120}$/),
    difficulty: z.enum(['gentle', 'balanced', 'challenge']),
    sessionLength: z.number().int().min(1).max(50),
    dailyGoal: z.number().int().min(1).max(100),
    showPinyin: z.boolean(),
    openJevEnabled: z.boolean(),
  })
  .strict();
const stateSchema = z
  .object({
    version: z.literal(1),
    settings: settingsSchema.extend({ openJevEnabled: z.boolean().default(false) }),
    history: z.array(z.object({ id: z.string() }).passthrough()),
    favorites: z.array(z.string()),
    exercises: z.array(z.object({ id: z.string() }).passthrough()),
  })
  .strict();
export class Store {
  #state;
  #queue = Promise.resolve();
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
  }
  async init() {
    await mkdir(this.dir, { recursive: true });
    try {
      this.#state = stateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw new Error(
          'Could not read data/state.json. The file has been preserved; restore a valid backup before continuing.',
        );
      this.#state = {
        version: 1,
        settings: { ...DEFAULT_SETTINGS },
        history: [],
        favorites: [],
        exercises: [],
      };
    }
  }
  get snapshot() {
    return structuredClone(this.#state);
  }
  update(transform) {
    const task = this.#queue.then(async () => {
      const next = stateSchema.parse(transform(this.snapshot));
      await writeFile(`${this.file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
      this.#state = next;
      return this.snapshot;
    });
    this.#queue = task.catch(() => {});
    return task;
  }
}
