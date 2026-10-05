import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: execMock, spawn: vi.fn() }));
import { LocalRuntime } from './runtime.js';
let root;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'zentences-runtime-'));
  execMock.mockImplementation((cmd, args, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb;
    callback(null, { stdout: 'Apple M2 Max', stderr: '' });
  });
});
afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});
describe('local runtime files and import', () => {
  it('lists only GGUF files in local model folder', async () => {
    const runtime = new LocalRuntime(root, {});
    expect(await runtime.localFiles()).toEqual([]);
    await writeFile(path.join(root, 'models', 'model.gguf'), 'x');
    await writeFile(path.join(root, 'models', 'other.txt'), 'x');
    expect(await runtime.localFiles()).toEqual(['model.gguf']);
  });
  it('refuses traversal, newlines, incomplete or symlinked external model files', async () => {
    const runtime = new LocalRuntime(root, {});
    await runtime.localFiles();
    await expect(runtime.importModel('../bad.gguf')).rejects.toThrow();
    await expect(runtime.importModel('x\n.gguf')).rejects.toThrow();
    await writeFile(path.join(root, 'models', 'small.gguf'), 'x');
    await expect(runtime.importModel('small.gguf')).rejects.toThrow('complete');
    await writeFile(path.join(root, 'outside.gguf'), 'x'.repeat(1024));
    await symlink(path.join(root, 'outside.gguf'), path.join(root, 'models', 'link.gguf'));
    await expect(runtime.importModel('link.gguf')).rejects.toThrow();
  });
  it('uses CLI args for safe GGUF import and removes temporary Modelfile', async () => {
    const runtime = new LocalRuntime(root, {});
    await runtime.localFiles();
    await writeFile(path.join(root, 'models', 'my model.gguf'), 'x'.repeat(1024));
    vi.spyOn(runtime, 'binary').mockResolvedValue('/fake/ollama');
    const result = await runtime.importModel('my model.gguf');
    expect(result.name).toBe('zentences-my-model');
    expect(execMock.mock.calls[0][1]).toEqual([
      'create',
      'zentences-my-model',
      '-f',
      expect.stringContaining('.modelfile'),
    ]);
    expect(await runtime.localFiles()).toEqual(['my model.gguf']);
  });
  it('returns already connected runtime without spawning', async () => {
    const status = { connected: true, models: [] };
    const runtime = new LocalRuntime(root, { status: async () => status });
    expect(await runtime.start()).toEqual(status);
  });
  it('does not expose raw command errors to UI', async () => {
    const runtime = new LocalRuntime(root, {});
    await runtime.localFiles();
    await writeFile(path.join(root, 'models', 'my.gguf'), 'x'.repeat(1024));
    vi.spyOn(runtime, 'binary').mockResolvedValue('/fake/ollama');
    execMock.mockImplementation((cmd, args, opts, cb) => cb(new Error('private stderr')));
    await expect(runtime.importModel('my.gguf')).rejects.toThrow('GGUF could not be imported');
  });
});
