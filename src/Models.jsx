import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Download,
  ExternalLink,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Heading, bytes, percent } from './shared.jsx';
export default function Models({
  boot,
  runtime,
  setRuntime,
  settings,
  saveSettings,
  busy,
  run,
  api,
  navigate,
  setNotice,
  setError,
  ready,
  csrf,
}) {
  const [pull, setPull] = useState(null),
    [files, setFiles] = useState([]),
    [filename, setFilename] = useState('');
  const abort = useRef(null);
  useEffect(() => {
    api('/api/models/local')
      .then((data) => setFiles(data.files || []))
      .catch((e) => setError(e.message));
    return () => abort.current?.abort();
  }, [api, setError]);
  const download = async (model) => {
    if (pull) return;
    const controller = new AbortController();
    abort.current = controller;
    setPull({ model, status: 'Connecting to your local runtime…', percent: 0 });
    setError('');
    try {
      const response = await fetch('/api/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.current },
        body: JSON.stringify({ model }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || data.error || 'Could not start the download.');
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = '',
        finished = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const blocks = pending.split(/\r?\n\r?\n/);
        pending = blocks.pop();
        for (const block of blocks) {
          const event = block.match(/^event:\s*(.*)$/m)?.[1],
            dataText = block
              .split(/\r?\n/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n');
          if (!dataText) continue;
          const data = JSON.parse(dataText);
          if (event === 'error') throw new Error(data.error || data.message || 'Download failed.');
          if (event === 'done' || data.status === 'success') {
            finished = true;
            setPull((current) => ({ ...current, status: 'Download complete', percent: 100 }));
          } else
            setPull({
              model,
              ...data,
              percent: data.percent ?? (data.total ? (data.completed / data.total) * 100 : 0),
            });
        }
      }
      if (!finished) throw new Error('Download ended before completion. Retry to resume it.');
      setRuntime(await api('/api/runtime'));
      await saveSettings({ model });
      setNotice('Your model is ready. Time for a little Chinese.');
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
      else setNotice('Download paused. Retry to resume it.');
    } finally {
      setPull(null);
      abort.current = null;
    }
  };
  return (
    <>
      <Heading
        eyebrow="YOUR PRIVATE PRACTICE PARTNER"
        title="Good company. All local."
        description="One model writes your sentences and checks your meaning. Everything runs on your Mac."
      />
      <div className="hardware-banner">
        <div className="hardware-icon">
          <Cpu size={24} />
        </div>
        <div>
          <h3>{boot.hardware?.chip || 'Your Mac'}</h3>
          <p>
            {boot.hardware?.memoryGB || '—'} GB unified memory · Apple silicon · one Ollama model at
            a time
          </p>
        </div>
        <span className="hardware-badge">
          <ShieldCheck size={14} />
          On-device inference
        </span>
      </div>
      <div className="setup-step">
        <div className="step-number">01</div>
        <div className="setup-step-content">
          <div className="section-card-heading">
            <div>
              <h2>Connect your local runtime</h2>
              <p>Ollama runs Mac-compatible models using Apple’s Metal acceleration.</p>
            </div>
            <span className={`connection-badge ${runtime.connected ? 'connected' : ''}`}>
              <span className="status-dot" />
              {runtime.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <div className="runtime-actions">
            <a
              href="https://ollama.com/download/mac"
              target="_blank"
              rel="noreferrer"
              className="button secondary"
            >
              <Download size={15} />
              Download Ollama for Mac <ExternalLink size={13} />
            </a>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() =>
                run('runtime', async () => {
                  const status = await api('/api/runtime/start', { method: 'POST' });
                  setRuntime(status.runtime || status);
                  setNotice('Local runtime started.');
                })
              }
            >
              {busy === 'runtime' ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Play size={14} />
              )}
              Start local runtime
            </button>
            <button
              className="text-button"
              onClick={() =>
                run('refresh-runtime', async () => {
                  setRuntime(await api('/api/runtime'));
                  setNotice('Runtime status refreshed.');
                })
              }
            >
              <RefreshCw size={14} />
              Refresh status
            </button>
          </div>
          <p className="fine-print">
            Install Ollama once, then start it here. Downloads need an internet connection; practice
            runs locally.
          </p>
        </div>
      </div>
      <div className="setup-step">
        <div className="step-number">02</div>
        <div className="setup-step-content">
          <div className="section-card-heading">
            <div>
              <h2>Choose your model</h2>
              <p>Start with Qwen. Its Chinese and English understanding make it a good fit.</p>
            </div>
            <span className="eyebrow">MAC COMPATIBLE</span>
          </div>
          <div className="model-grid">
            {(boot.catalog || []).map((model, index) => {
              const installed = runtime.models?.some(
                (item) => item.name === model.tag || item.name === `${model.tag}:latest`,
              );
              return (
                <div
                  className={`model-card ${settings.model === model.tag ? 'selected-model' : ''}`}
                  key={model.tag}
                >
                  <div className="model-card-top">
                    <span className="model-icon">
                      <Cpu size={19} />
                    </span>
                    {index === 0 && <span className="recommendation">RECOMMENDED</span>}
                  </div>
                  <h3>{model.name}</h3>
                  <div className="model-spec">
                    {model.sizeGB ? `~${model.sizeGB} GB download` : model.tag}
                  </div>
                  <p>{model.description}</p>
                  <div className="model-card-links">
                    <a href={model.url} target="_blank" rel="noreferrer">
                      Model details <ExternalLink size={11} />
                    </a>
                    {model.huggingFaceUrl && (
                      <a href={model.huggingFaceUrl} target="_blank" rel="noreferrer">
                        Hugging Face <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  <button
                    className={`button ${settings.model === model.tag && installed ? 'model-selected-button' : 'secondary'}`}
                    disabled={!!pull || !runtime.connected}
                    onClick={() =>
                      installed ? saveSettings({ model: model.tag }) : download(model.tag)
                    }
                  >
                    {installed ? (
                      settings.model === model.tag ? (
                        <>
                          <CheckCircle2 size={15} />
                          Selected
                        </>
                      ) : (
                        <>
                          Use this model <ArrowRight size={15} />
                        </>
                      )
                    ) : (
                      <>
                        <Download size={15} />
                        Download model
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {pull && (
            <div className="download-progress" role="status">
              <div>
                <LoaderCircle size={18} className="spin" />
                <strong>{pull.model}</strong>
                <span>{Math.round(pull.percent || 0)}%</span>
                <button className="text-button" onClick={() => abort.current?.abort()}>
                  Pause download
                </button>
              </div>
              <div className="progress-track">
                <span style={{ width: `${percent(pull.percent)}%` }} />
              </div>
              <p>
                {pull.status}
                {pull.total ? ` · ${bytes(pull.completed)} / ${bytes(pull.total)}` : ''}
              </p>
            </div>
          )}
          {runtime.models?.length > 0 && (
            <div className="installed-models">
              <h3>Already on your Mac</h3>
              {runtime.models.map((model) => (
                <div className="installed-model-row" key={model.name}>
                  <Cpu size={16} />
                  <strong>{model.name}</strong>
                  <span>{bytes(model.size)}</span>
                  <button
                    className="text-button"
                    onClick={() => saveSettings({ model: model.name })}
                  >
                    {model.name === settings.model ? (
                      <>
                        <Check size={14} />
                        Selected
                      </>
                    ) : (
                      'Use model'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="setup-step advanced-step">
        <div className="step-number">03</div>
        <div className="setup-step-content">
          <details>
            <summary>
              <span>
                <strong>Bring a model from Hugging Face</strong>
                <small>Optional · import a compatible GGUF file</small>
              </span>
              <ChevronDown size={18} />
            </summary>
            <div className="import-panel">
              <p>
                Download a Qwen GGUF model with a quantization such as Q4_K_M. Place the{' '}
                <code>.gguf</code> file in the <code>Sentences/models/</code> folder, refresh this
                list, and import it into Ollama. Your model runs through the same Mac-compatible
                runtime.
              </p>
              <div className="import-controls">
                <select
                  aria-label="Local GGUF file"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                >
                  <option value="">Choose a file from models/</option>
                  {files.map((file) => (
                    <option
                      key={typeof file === 'string' ? file : file.filename}
                      value={typeof file === 'string' ? file : file.filename}
                    >
                      {typeof file === 'string' ? file : file.filename}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  onClick={() =>
                    run('files', async () => {
                      const data = await api('/api/models/local');
                      setFiles(data.files || []);
                    })
                  }
                >
                  <RefreshCw size={15} />
                  Refresh files
                </button>
                <button
                  className="button primary"
                  disabled={!filename || !runtime.connected || !!busy}
                  onClick={() =>
                    run('import', async () => {
                      const model = await api('/api/models/import', {
                        method: 'POST',
                        body: JSON.stringify({ filename }),
                      });
                      setRuntime(await api('/api/runtime'));
                      await saveSettings({ model: model.name });
                      setNotice('Model imported and selected.');
                    })
                  }
                >
                  {busy === 'import' ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Plus size={15} />
                  )}
                  Import model
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
      <div className="setup-step advanced-step">
        <div className="step-number">+</div>
        <div className="setup-step-content">
          <details>
            <summary>
              <span>
                <strong>OpenJev second opinion</strong>
                <small>Optional · experimental semantic evaluator using MLX</small>
              </span>
              <ChevronDown size={18} />
            </summary>
            <div className="import-panel">
              <p>
                OpenJev now supports Apple silicon through MLX. It needs roughly 16 GB for loading,
                plus working memory. Follow its separate setup guide, then enable it in Settings.
                Qwen is unloaded before the second opinion to reduce memory pressure; the optional
                OpenJev service still has its own memory footprint.
              </p>
              <a
                className="text-button"
                target="_blank"
                rel="noreferrer"
                href="https://github.com/razorback16/openjev#apple-silicon"
              >
                Apple silicon setup guide <ExternalLink size={12} />
              </a>
            </div>
          </details>
        </div>
      </div>
      {ready && (
        <div className="ready-banner">
          <CheckCircle2 size={20} />
          <div>
            <strong>You're ready to practice.</strong>
            <span>{settings.model} is installed and selected.</span>
          </div>
          <button className="button primary" onClick={() => navigate('practice')}>
            Go to practice <ArrowRight size={15} />
          </button>
        </div>
      )}
    </>
  );
}
