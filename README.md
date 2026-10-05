# Zentences

A private Chinese practice studio for your Mac. Zentences reads the vocabulary entries in your Anki text export, creates new Chinese sentences from that word bank, and asks you to translate them into English. A local Qwen model gives a meaning-based score and feedback. Your export's example sentences are ignored.

## Open the app

Double-click **Start Zentences.command** in this folder. It starts the Node.js server and opens **http://localhost:3210** automatically. Keep its Terminal window open while you practice; press Control-C there to stop the server.

Or, from Terminal:

```sh
cd /Users/joey/Documents/Sentences
npm ci
npm start
```

Node.js 22 or newer is required (26.8.1 is already installed on this Mac). The launcher installs npm dependencies if they are missing. `npm start` rebuilds the interface before starting and reopens an existing Zentences server instead of starting a duplicate. To use another port: `PORT=3211 npm start`. Set `NO_OPEN=1` to disable automatic browser opening.

## Set up your local tutor

1. Open **Local model** in the sidebar.
2. Download [Ollama for macOS](https://ollama.com/download/mac), install it, and open it. Ollama supports Apple M-series CPU/GPU acceleration on macOS 14 or newer.
3. Click **Start local runtime** or **Refresh status**.
4. Click **Download model** on Qwen3 14B. A progress bar shows the download; pausing and retrying resumes available Ollama download layers.
5. When it finishes, Zentences selects the model. Open Practice and begin.

The detected machine is an Apple M2 Max with 64 GB unified memory. Recommended quantized models:

| Model | Download | Choice |
| --- | --- | --- |
| [Qwen3 14B](https://ollama.com/library/qwen3:14b) | 9.3 GB | Default balance of Chinese ability and response speed |
| [Qwen3 8B](https://ollama.com/library/qwen3:8b) | 5.2 GB | Smaller download and generally faster responses |
| [Qwen3 32B](https://ollama.com/library/qwen3:32b) | 20 GB | More model capacity, slower responses |

Download size is not total memory use: model weights, context buffers, macOS, and other applications all need memory. Zentences uses a bounded 8,192-token context. These quantized choices leave substantial headroom on this Mac, though speed and quality require testing with your actual workload. Generation and grading use the same model sequentially. Thinking mode is disabled to keep responses focused and shorter.

A model is loaded automatically for the first exercise. The initial request can take longer. An installed model is distinct from one currently loaded in GPU memory. You can select any already installed local model in Local model; Qwen is the supported recommendation. Cloud model tags are blocked.

### Where models live

If Ollama is already running, Zentences uses that instance and its existing storage (normally `~/.ollama/models`). If Zentences starts the runtime itself, it stores models in **Sentences/models/ollama/** and starts Ollama on loopback with one loaded model, one parallel request, and cloud features disabled. It stops only the runtime it launched when the Node server exits.

### Hugging Face / GGUF import

The model cards link directly to [Qwen's official GGUF releases](https://huggingface.co/Qwen/Qwen3-14B-GGUF). Ollama's built-in download is the easiest route. For a manual import, place a complete, supported `.gguf` file directly inside **Sentences/models/**, expand **Bring a model from Hugging Face**, refresh the files, and import it. Q4_K_M is a sensible quantization to start with.

An individual part of a split GGUF is not a complete model. Follow the model card's merge instructions if the release has multiple parts. Imports use the local Ollama CLI and are limited to files directly inside this folder. They can take several minutes for larger models.

## Your vocabulary

The importer finds `Selected Notes.txt` or `selectednotes.txt` regardless of spaces and case. Your current export has **380 data rows, 190 unique Hanzi entries, and 190 duplicate entries**. Each marked `汉字[numbered pinyin]` entry contributes one headword; vocabulary IDs are stable across reimports. Examples never enter the generation prompt. Meanings and pinyin are available in the word bank.

After updating the export, click **Reload notes** in Vocabulary. Favorites and practice history remain saved. The importer reports rows that could not be read rather than silently adding their example words.

The generation guard first checks that every Hanzi span can be segmented into exact imported headwords and that the focus word is a whole token. An independent local Jieba dictionary check then rejects unlearned compounds that could otherwise be built from familiar characters. Punctuation is allowed; unlisted characters, Latin text, and Arabic digits are rejected. The model keeps retrying rejected output until a sentence passes. Click **Cancel generation**, leave Practice, or close the page to stop it. Connection errors and individual model request timeouts still return an error. Chinese word boundaries can be ambiguous; the lexical check is deliberately conservative and may cause a valid phrase to be retried. Neither segmentation nor an AI tutor is an absolute linguistic guarantee.

## Practice and progress

- Choose a focus word or use Surprise me, which revisits unseen and weaker words more often.
- Adjust difficulty, session length, and your daily goal.
- Translate the Chinese sentence. Press **Command-Enter** (Control-Enter on other keyboards) to check it.
- Reveal pinyin, or listen with your browser's Chinese speech voice. This uses macOS/browser speech support rather than a downloaded speech model. Install a Chinese voice in macOS if none is available.
- Get a score, a suggested translation, missed meanings, and alternative translations. Synonyms and natural paraphrases are accepted by the judging prompt.
- Scores of 85–100 are Correct, 60–84 are Close, and below 60 are For review. These are AI judgments, not validated examination scores.
- Browse, search, and favorite vocabulary; inspect saved attempts and export your progress as JSON.

Progress and preferences are stored atomically in **data/state.json**. Back up this file to keep your history. Invalid existing state is preserved and reported instead of being overwritten. Generation reference answers are kept server-side until grading. Each exercise can be graded once.

## Optional OpenJev second opinion

OpenJev's current [Apple silicon documentation](https://github.com/razorback16/openjev#apple-silicon) describes an MLX backend. It no longer requires the NVIDIA/vLLM route on a Mac. The upstream vLLM extension is documented as merged on September 22, 2026.

This is an optional, separately installed service. The default Qwen tutor needs only one model. If you want to experiment, follow OpenJev's current installation instructions in a separate Python virtual environment. Its documented local setup is:

```sh
git clone https://github.com/razorback16/openjev
cd openjev
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[mlx]'
OPENJEV_BACKEND=mlx OPENJEV_MLX_CACHE_LIMIT_GB=4 python -m openjev
```

These commands are provided for your review; Zentences does not run them or download this additional model automatically. OpenJev's default MLX model is `mlx-community/diffusiongemma-26B-A4B-it-4bit`. The project reports approximately 16 GB to load the model and additional working memory, with memory pool behavior affected by its cache limit. Verify the project's prerequisites and latest instructions before installing.

With OpenJev listening on **127.0.0.1:8080**, enable **OpenJev second opinion** in Settings. Zentences calls the typed `/v1/systemone` API using a four-level semantic rubric. Its expected level is mapped to a 0–100 secondary score; confidence and probabilities remain distinct from the Qwen feedback. Confidence describes the model's answer distribution, not a proven probability that the grading is correct.

Requests run sequentially; Qwen is unloaded after its feedback and before the OpenJev decision to reduce memory pressure. OpenJev remains a separate resident process, and loading Qwen on the next exercise can still coexist with it. On this 64 GB Mac, use a modest OpenJev cache limit and check Activity Monitor when trying both. If OpenJev fails, the Qwen result is retained and the optional error is displayed. No remote Jev endpoint or API credential is required.

## Development and checks

```sh
npm run dev             # local Vite interface with the same Node API
npm test                # unit + integration tests
npm run test:coverage   # core server coverage gates at 80%
npm run build           # production interface
npx playwright install chromium
npm run test:e2e        # real browser journeys, with model responses stubbed
npm audit
```

The app binds to 127.0.0.1, rejects non-local Host headers, checks same-origin requests and a per-server CSRF token, limits requests, validates input, and uses no external scripts, fonts, analytics, or cloud AI. Only explicit model downloads, dependency installation, and external links need internet access.

Browser and API tests verify the app independently of multi-GB downloads. Live Chinese generation, grading quality, and hardware throughput require Ollama plus downloaded weights; do not interpret mocked tests as a model-quality benchmark.
