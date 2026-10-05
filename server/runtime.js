import { access, readdir, realpath, stat, writeFile, unlink, mkdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
const exec = promisify(execFile);
const candidates = [
  '/Applications/Ollama.app/Contents/Resources/ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/local/bin/ollama',
];
export class LocalRuntime {
  constructor(root, client) {
    this.root = root;
    this.client = client;
    this.child = null;
  }
  async binary() {
    for (const file of candidates) {
      try {
        await access(file);
        return file;
      } catch {
        /* Try the next supported install location. */
      }
    }
    throw new Error(
      'Install Ollama for macOS first, then open it or click Start runtime. Download: ollama.com/download/mac',
    );
  }
  async hardware() {
    let chip = os.arch() === 'arm64' ? 'Apple silicon' : 'Intel Mac';
    try {
      chip = (await exec('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string'])).stdout.trim();
    } catch {
      /* OS fallback above remains usable. */
    }
    return {
      chip,
      memoryGB: Math.round(os.totalmem() / 1024 ** 3),
      platform: os.platform(),
      architecture: os.arch(),
    };
  }
  async start() {
    const status = await this.client.status();
    if (status.connected) return status;
    const binary = await this.binary();
    await mkdir(path.join(this.root, 'models'), { recursive: true });
    const child = spawn(binary, ['serve'], {
      env: {
        ...process.env,
        OLLAMA_HOST: '127.0.0.1:11434',
        OLLAMA_MODELS: path.join(this.root, 'models', 'ollama'),
        OLLAMA_NUM_PARALLEL: '1',
        OLLAMA_MAX_LOADED_MODELS: '1',
        OLLAMA_NO_CLOUD: '1',
      },
      stdio: 'ignore',
    });
    this.child = child;
    let failure;
    child.on('error', (error) => {
      failure = error;
    });
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (failure)
        throw new Error('Ollama could not start. Open the Ollama application and retry.');
      const current = await this.client.status();
      if (current.connected) return current;
    }
    throw new Error(
      'Ollama is still starting. Open the Ollama application, then refresh runtime status.',
    );
  }
  async localFiles() {
    await mkdir(path.join(this.root, 'models'), { recursive: true });
    return (await readdir(path.join(this.root, 'models'))).filter((name) =>
      name.toLowerCase().endsWith('.gguf'),
    );
  }
  async importModel(filename) {
    if (
      !filename ||
      filename !== path.basename(filename) ||
      /[\r\n"\\]/.test(filename) ||
      !filename.toLowerCase().endsWith('.gguf')
    )
      throw new Error('Choose a .gguf filename from the models folder.');
    const directory = await realpath(path.join(this.root, 'models'));
    const file = await realpath(path.join(directory, filename));
    if (path.dirname(file) !== directory || (await stat(file)).size < 1024)
      throw new Error('Use a complete GGUF file located directly inside the models folder.');
    const binary = await this.binary();
    const name = `zentences-${filename
      .replace(/\.gguf$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 90)}`;
    const modelfile = path.join(directory, `.import-${Date.now()}.modelfile`);
    await writeFile(modelfile, `FROM "${file}"\nPARAMETER num_ctx 4096\n`, { mode: 0o600 });
    try {
      await exec(binary, ['create', name, '-f', modelfile], {
        timeout: 15 * 60 * 1000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' },
      });
    } catch {
      throw new Error(
        'The GGUF could not be imported. Check that Ollama is running and the file is a supported, complete Qwen GGUF (not an individual split).',
      );
    } finally {
      await unlink(modelfile);
    }
    return { name };
  }
  stop() {
    if (this.child && !this.child.killed) this.child.kill();
  }
}
