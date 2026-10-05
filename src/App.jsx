import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FolderOpen,
  Heart,
  Info,
  LoaderCircle,
  Menu,
  Settings2,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import Practice from './Practice.jsx';
import { Vocabulary, Progress, Settings } from './Library.jsx';
import Models from './Models.jsx';
import { Feedback } from './shared.jsx';
const NAV = [
  { id: 'practice', label: 'Practice', icon: BookOpen },
  { id: 'vocabulary', label: 'Vocabulary', icon: FolderOpen },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'model', label: 'Local model', icon: Cpu },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];
export default function App() {
  const [page, setPage] = useState('practice'),
    [boot, setBoot] = useState(null),
    [runtime, setRuntime] = useState({ connected: false, models: [] }),
    [settings, setSettings] = useState({
      model: 'qwen3:14b',
      difficulty: 'balanced',
      sessionLength: 10,
      dailyGoal: 10,
      showPinyin: false,
    }),
    [history, setHistory] = useState([]),
    [favorites, setFavorites] = useState([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(''),
    [menu, setMenu] = useState(false),
    [review, setReview] = useState(null),
    [targetId, setTargetId] = useState(''),
    [practiceRequest, setPracticeRequest] = useState(null);
  const csrf = useRef('');
  const words = boot?.words || [];
  const ready =
    runtime.connected &&
    runtime.models?.some(
      (model) => model.name === settings.model || model.name === `${settings.model}:latest`,
    );
  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.current,
        ...options.headers,
      },
    });
    const body = await response
      .json()
      .catch(() => ({ error: 'The local server returned an unreadable response.' }));
    if (!response.ok || body.success === false)
      throw new Error(
        typeof body.error === 'string'
          ? body.error
          : body.error?.message || 'This action could not be completed.',
      );
    return body.data ?? body;
  }, []);
  const bootstrap = useCallback(async () => {
    setError('');
    try {
      const data = await api('/api/bootstrap');
      csrf.current = data.csrfToken;
      setBoot(data);
      setSettings(data.settings);
      setRuntime(data.runtime);
      setHistory(
        [...(data.history || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      );
      setFavorites(data.favorites || []);
    } catch (e) {
      setError(`${e.message} Make sure the Zentences server is running, then reload this page.`);
    }
  }, [api]);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        setRuntime(await api('/api/runtime'));
      } catch (e) {
        setRuntime((current) => ({ ...current, connected: false }));
      }
    }, 12000);
    return () => clearInterval(id);
  }, [api]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  const navigate = (id) => {
    setPage(id);
    setMenu(false);
    setError('');
  };
  const run = async (name, action) => {
    setBusy(name);
    setError('');
    try {
      return await action();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy('');
    }
  };
  const saveSettings = async (changes) => {
    try {
      const result = await api('/api/settings', { method: 'POST', body: JSON.stringify(changes) });
      setSettings((current) => ({ ...current, ...(result.settings || result), ...changes }));
    } catch (e) {
      setError(e.message);
    }
  };
  const toggleFavorite = (word) =>
    run(`favorite-${word.id}`, async () => {
      const favorite = !favorites.includes(word.id);
      await api('/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ wordId: word.id, favorite }),
      });
      setFavorites((current) =>
        favorite ? [...current, word.id] : current.filter((id) => id !== word.id),
      );
    });
  const requestPractice = (id) => {
    setTargetId(id);
    navigate('practice');
    setPracticeRequest({ id, key: Date.now() });
  };
  const common = {
    requestPractice,
    practiceRequest,
    boot,
    runtime,
    setRuntime,
    settings,
    saveSettings,
    history,
    setHistory,
    words,
    favorites,
    toggleFavorite,
    busy,
    run,
    api,
    navigate,
    setNotice,
    setError,
    targetId,
    setTargetId,
    ready,
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <a
          className="brand"
          href="#practice"
          onClick={(e) => {
            e.preventDefault();
            navigate('practice');
          }}
        >
          <span className="brand-symbol">句</span>
          <span>
            Zentences<span className="brand-sub">YOUR CHINESE PRACTICE STUDIO</span>
          </span>
        </a>
        <div className="sidebar-section-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV.map(({ id, label, icon: Type }) => (
            <button
              className={`nav-item ${page === id ? 'active' : ''}`}
              key={id}
              aria-label={label}
              onClick={() => navigate(id)}
            >
              <Type size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {id === 'vocabulary' && <span className="nav-count">{words.length || '—'}</span>}
              {id === 'model' && <span className={`status-dot ${ready ? 'online' : ''}`} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-hanzi">学而时习之</span>
          <p>
            Learn something.
            <br />
            Return to it, often.
          </p>
          <span className="note-caption">ONE SENTENCE AT A TIME</span>
        </div>
        <button className="sidebar-runtime" onClick={() => navigate('model')}>
          <span className="runtime-icon">
            <Cpu size={18} />
          </span>
          <span>
            <strong>{ready ? 'Local model ready' : 'Your local model'}</strong>
            <small>{ready ? settings.model : 'Set up your practice partner'}</small>
          </span>
          <ChevronRight size={15} />
        </button>
        <div className="privacy-note">
          <ShieldCheck size={14} />
          Private by design. On your Mac.
        </div>
      </aside>
      {menu && (
        <button className="menu-backdrop" aria-label="Close menu" onClick={() => setMenu(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={18} />
            </button>
            <span className="breadcrumb">
              Your workspace <ChevronRight size={13} />
              <strong>{NAV.find((item) => item.id === page)?.label}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span className={`status-dot ${ready ? 'online' : ''}`} />
              {ready ? 'LOCAL MODEL READY' : 'LOCAL & PRIVATE'}
            </span>
            <button
              className="icon-button top-settings"
              aria-label="Open settings"
              onClick={() => navigate('settings')}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div className="alert error" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!boot ? (
            <div className="loading-state">
              {error ? (
                <>
                  <Info size={28} />
                  <h2>Let's reconnect your workspace.</h2>
                  <button className="button primary" onClick={bootstrap}>
                    Try again
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle size={28} className="spin" />
                  <p>Opening your practice studio…</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: page === 'practice' ? 'block' : 'none' }}>
                <Practice {...common} active={page === 'practice'} />
              </div>
              {page === 'vocabulary' && <Vocabulary {...common} bootstrap={bootstrap} />}{' '}
              {page === 'progress' && <Progress {...common} setReview={setReview} />}{' '}
              {page === 'model' && <Models {...common} csrf={csrf} />}{' '}
              {page === 'settings' && <Settings {...common} />}
              <footer className="app-footer">
                <span>ZENTENCES</span>
                <span>One sentence at a time.</span>
                <span>
                  <ShieldCheck size={12} />
                  Made for your Mac.
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {review && (
        <div className="modal-backdrop" onClick={() => setReview(null)}>
          <section
            className="review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="review-title">A sentence revisited.</h2>
              <button
                className="icon-button"
                aria-label="Close review"
                onClick={() => setReview(null)}
              >
                <X size={21} />
              </button>
            </div>
            <p className="review-sentence" lang="zh-CN">
              {review.sentence}
            </p>
            <p className="review-pinyin">{review.pinyin}</p>
            <div className="review-answer">
              <span className="eyebrow">YOUR TRANSLATION</span>
              <p>{review.answer}</p>
            </div>
            <Feedback result={review} showAnswer setShowAnswer={() => {}} />
          </section>
        </div>
      )}
    </div>
  );
}
