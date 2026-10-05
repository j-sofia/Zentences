import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Command,
  Flame,
  FolderOpen,
  Heart,
  Info,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Volume2,
  RefreshCw,
} from 'lucide-react';
import { Feedback, percent } from './shared.jsx';
export default function Practice({
  words,
  boot,
  settings,
  saveSettings,
  history,
  setHistory,
  favorites,
  toggleFavorite,
  busy,
  run,
  api,
  navigate,
  setNotice,
  targetId,
  setTargetId,
  ready,
  active,
  practiceRequest,
}) {
  const [exercise, setExercise] = useState(null),
    [feedback, setFeedback] = useState(null),
    [answer, setAnswer] = useState(''),
    [session, setSession] = useState([]),
    [finished, setFinished] = useState(false),
    [bank, setBank] = useState(false),
    [showAnswer, setShowAnswer] = useState(false);
  const answerRef = useRef(null);
  const generationRef = useRef(null);
  const today = history.filter(
    (item) =>
      new Date(item.createdAt).toLocaleDateString('en-CA') ===
      new Date().toLocaleDateString('en-CA'),
  );
  const word = exercise?.target || words.find((item) => item.id === targetId) || words[0];
  const generate = async (reset = false, override) => {
    if (busy || generationRef.current) return;
    if (!ready) {
      navigate('model');
      setNotice('Set up a local model to begin your practice.');
      return;
    }
    const requestedTarget = override || targetId;
    const controller = new AbortController();
    generationRef.current = controller;
    await run('generate', async () => {
      try {
        const result = await api('/api/generate', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            targetId: requestedTarget || undefined,
            difficulty: settings.difficulty,
          }),
        });
        if (controller.signal.aborted) return;
        setExercise(result);
        if (requestedTarget && result.target?.id)
          setTargetId((current) => (current === requestedTarget ? result.target.id : current));
        setAnswer('');
        setFeedback(null);
        setShowAnswer(false);
        setFinished(false);
        if (reset) setSession([]);
        setTimeout(() => answerRef.current?.focus(), 80);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        generationRef.current = null;
      }
    });
  };
  const grade = async () => {
    if (!exercise || !answer.trim() || feedback || busy) return;
    await run('grade', async () => {
      const result = await api('/api/grade', {
        method: 'POST',
        body: JSON.stringify({ exerciseId: exercise.id, answer: answer.trim() }),
      });
      setFeedback(result);
      setHistory((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setSession((current) => [...current, result]);
    });
  };
  const speak = () => {
    if (!window.speechSynthesis) {
      setNotice('Speech is not available in this browser.');
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(exercise.sentence);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.8;
    const voice = speechSynthesis.getVoices().find((item) => item.lang.startsWith('zh'));
    if (voice) utterance.voice = voice;
    utterance.onerror = () =>
      setNotice('Add a Chinese voice in macOS Accessibility → Spoken Content.');
    speechSynthesis.speak(utterance);
  };
  useEffect(() => {
    if (practiceRequest) generate(true, practiceRequest.id);
  }, [practiceRequest]);
  useEffect(() => {
    if (!active) {
      generationRef.current?.abort();
      if (window.speechSynthesis) speechSynthesis.cancel();
    }
  }, [active]);
  useEffect(() => () => generationRef.current?.abort(), []);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {new Intl.DateTimeFormat('en', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).format(new Date())}
          </div>
          <h1>
            {new Date().getHours() >= 17
              ? 'A little practice. A little progress.'
              : 'Make room for a little Chinese.'}
          </h1>
          <p>Think in Chinese. Find the meaning. Make it yours.</p>
        </div>
        <div className="heading-illustration" aria-hidden="true">
          <span>句</span>
          <div />
          <i />
        </div>
      </div>
      <div className="practice-layout">
        <section className="practice-column">
          <div className="session-strip">
            <span className="session-title">
              <span className="mini-mark">
                <BookOpen size={15} />
              </span>
              Translation practice
            </span>
            <span className="session-count">
              {finished
                ? 'Session complete'
                : `${Math.min(session.length + (exercise && !feedback ? 1 : 0), settings.sessionLength)} / ${settings.sessionLength} sentences`}
              <span className="session-dots">
                {Array.from({ length: Math.min(10, settings.sessionLength) }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < session.length
                        ? 'complete'
                        : i === session.length && exercise
                          ? 'current'
                          : ''
                    }
                  />
                ))}
              </span>
            </span>
          </div>
          {finished ? (
            <div className="practice-card session-complete">
              <div className="success-symbol">
                <Check size={30} />
              </div>
              <div className="eyebrow">A LITTLE MORE FLUENT</div>
              <h2>You showed up. That counts.</h2>
              <p>You translated {session.length} sentences in this session.</p>
              <div className="session-results">
                <div>
                  <strong>{session.length}</strong>
                  <span>Sentences practiced</span>
                </div>
                <div>
                  <strong>
                    {Math.round(
                      session.reduce((sum, item) => sum + Number(item.score), 0) /
                        Math.max(session.length, 1),
                    )}
                    %
                  </strong>
                  <span>Average understanding</span>
                </div>
              </div>
              <button className="button primary" onClick={() => generate(true)}>
                Start a fresh session <ArrowRight size={17} />
              </button>
              <button className="text-button" onClick={() => navigate('progress')}>
                Review your progress
              </button>
            </div>
          ) : (
            <div className="practice-card">
              <div className="exercise-top">
                <span className="eyebrow">
                  {exercise ? 'READ & TRANSLATE' : 'YOUR NEXT SENTENCE STARTS HERE'}
                </span>
                <div className="exercise-actions">
                  {exercise && (
                    <button
                      className="subtle-button"
                      disabled={!!busy}
                      onClick={() => generate()}
                      aria-label="Generate another sentence"
                    >
                      <RefreshCw size={13} />
                      New sentence
                    </button>
                  )}
                  <button className="subtle-button" onClick={() => setBank(!bank)}>
                    <FolderOpen size={14} />
                    Word bank <ChevronDown size={13} className={bank ? 'rotate' : ''} />
                  </button>
                </div>
              </div>
              {bank && (
                <div className="word-bank">
                  <p>
                    Sentences use only Hanzi entries from your imported notes. Example sentences are
                    ignored.
                  </p>
                  <div>
                    {words.slice(0, 80).map((item) => (
                      <button
                        key={item.id}
                        title={item.meaning}
                        onClick={() => {
                          setTargetId(item.id);
                          setBank(false);
                        }}
                      >
                        {item.hanzi}
                      </button>
                    ))}
                    {words.length > 80 && (
                      <button onClick={() => navigate('vocabulary')}>
                        +{words.length - 80} more
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className={`sentence-stage ${!exercise ? 'empty-stage' : ''}`}>
                {busy === 'generate' ? (
                  <div className="generating">
                    <LoaderCircle size={27} className="spin" />
                    <h3>Finding your next sentence…</h3>
                    <p>Trying until a sentence fits your word bank.</p>
                    <button
                      className="subtle-button"
                      onClick={() => generationRef.current?.abort()}
                    >
                      Cancel generation
                    </button>
                  </div>
                ) : exercise ? (
                  <>
                    <div className="sentence-controls">
                      <span className="sentence-level">
                        {exercise.difficulty || settings.difficulty}
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Listen to Chinese sentence"
                        onClick={speak}
                      >
                        <Volume2 size={19} />
                      </button>
                    </div>
                    <p className="chinese-sentence" lang="zh-CN">
                      {exercise.sentence}
                    </p>
                    {settings.showPinyin && <p className="sentence-pinyin">{exercise.pinyin}</p>}
                    <div className="sentence-meta">
                      <span>{exercise.usedWords?.length || 0} words from your collection</span>
                      <button
                        className="text-button"
                        onClick={() => saveSettings({ showPinyin: !settings.showPinyin })}
                      >
                        {settings.showPinyin ? 'Hide' : 'Show'} pinyin
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="empty-sentence-art" aria-hidden="true">
                      <span>学</span>
                      <span>习</span>
                      <span className="accent">句</span>
                      <span>子</span>
                    </div>
                    <h2>
                      A familiar word.
                      <br />A whole new sentence.
                    </h2>
                    <p>
                      Your local model turns the words you’re learning
                      <br className="desktop-break" /> into small moments of understanding.
                    </p>
                    <button
                      className="button primary"
                      disabled={!!busy || !words.length}
                      onClick={() => generate(true)}
                    >
                      {ready ? 'Begin practice' : 'Set up & begin'}
                      <ArrowRight size={17} />
                    </button>
                    <div className="stage-privacy">
                      <ShieldCheck size={13} />
                      Your notes and answers stay on this Mac.
                    </div>
                  </>
                )}
              </div>
              {exercise && busy !== 'generate' && (
                <div className="answer-section">
                  <div className="answer-label-row">
                    <label htmlFor="translation">Your English translation</label>
                    <span>Meaning matters more than exact wording.</span>
                  </div>
                  <textarea
                    ref={answerRef}
                    id="translation"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        grade();
                      }
                    }}
                    disabled={!!feedback || busy === 'grade'}
                    rows={3}
                    maxLength={2000}
                    placeholder="What does this sentence mean?"
                  />
                  <div className="answer-toolbar">
                    <span className="keyboard-hint">
                      <Command size={12} />+ Enter to check
                    </span>
                    {feedback ? (
                      <button
                        className="button primary"
                        disabled={!!busy}
                        onClick={() =>
                          session.length >= settings.sessionLength ? setFinished(true) : generate()
                        }
                      >
                        {session.length >= settings.sessionLength
                          ? 'Finish session'
                          : 'Next sentence'}
                        <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button
                        className="button primary"
                        disabled={!answer.trim() || !!busy}
                        onClick={grade}
                      >
                        {busy === 'grade' ? (
                          <>
                            <LoaderCircle size={16} className="spin" />
                            Checking your meaning…
                          </>
                        ) : (
                          <>
                            Check translation <ArrowRight size={16} />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {feedback && (
                <Feedback result={feedback} showAnswer={showAnswer} setShowAnswer={setShowAnswer} />
              )}{' '}
              {!exercise && (
                <div className="practice-bottom">
                  <div>
                    <Info size={13} />
                    <span>Choose a word, or let us surprise you.</span>
                  </div>
                  <span>{words.length} words to explore</span>
                </div>
              )}
            </div>
          )}
          <div className="practice-config">
            <div className="config-field">
              <label htmlFor="practice-difficulty">DIFFICULTY</label>
              <select
                id="practice-difficulty"
                value={settings.difficulty}
                onChange={(e) => saveSettings({ difficulty: e.target.value })}
              >
                <option value="gentle">Simple & familiar</option>
                <option value="balanced">A little stretch</option>
                <option value="challenge">Challenge me</option>
              </select>
            </div>
            <div className="config-field">
              <label htmlFor="focus-word">FOCUS WORD</label>
              <select
                id="focus-word"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Surprise me</option>
                {words.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.hanzi} · {item.meaning?.slice(0, 35)}
                  </option>
                ))}
              </select>
            </div>
            <div className="config-tip">
              <Sparkles size={15} />
              <span>
                A new context helps
                <br />a word stick.
              </span>
            </div>
          </div>
          <p className="below-card-note">
            <Info size={13} />
            Every sentence is checked against your word bank before you see it.
          </p>
        </section>
        <aside className="practice-aside">
          <div className="daily-card">
            <div className="card-topline">
              <span className="eyebrow">TODAY'S SMALL WIN</span>
              <Flame size={18} />
            </div>
            <div className="daily-counter">
              <strong>{today.length}</strong>
              <span>
                / {settings.dailyGoal}
                <small>sentences practiced</small>
              </span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${percent((today.length / settings.dailyGoal) * 100)}%` }} />
            </div>
            <p>
              {today.length >= settings.dailyGoal
                ? 'Your daily goal is complete. Nicely done.'
                : today.length
                  ? `${Math.max(settings.dailyGoal - today.length, 0)} more sentences to your daily goal.`
                  : 'A few minutes today. A little more tomorrow.'}
            </p>
          </div>
          {word && (
            <div className="focus-card">
              <div className="card-topline">
                <span className="eyebrow">
                  {exercise ? 'IN THIS SENTENCE' : 'FROM YOUR COLLECTION'}
                </span>
                <button
                  className={`icon-button heart-button ${favorites.includes(word.id) ? 'hearted' : ''}`}
                  aria-label={favorites.includes(word.id) ? 'Unfavorite word' : 'Favorite word'}
                  onClick={() => toggleFavorite(word)}
                >
                  <Heart size={16} />
                </button>
              </div>
              <span className="focus-hanzi" lang="zh-CN">
                {word.hanzi}
              </span>
              <span className="focus-pinyin">{word.pinyin}</span>
              <p>{word.meaning}</p>
              <div className="focus-divider" />
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => {
                  setTargetId(word.id);
                  generate(true, word.id);
                }}
              >
                Practice this word <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="collection-card">
            <div className="collection-icon">
              <FolderOpen size={18} />
            </div>
            <div>
              <h3>Your words, your world.</h3>
              <p>
                {words.length.toLocaleString()} words from
                <br />
                <span>{boot.source?.filename || 'your notes'}</span>
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Browse vocabulary"
              onClick={() => navigate('vocabulary')}
            >
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="quiet-tip">
            <span className="tip-rule" />
            <span className="eyebrow">A THOUGHT TO TAKE WITH YOU</span>
            <p>“You don’t have to get every word right to understand the story.”</p>
          </div>
        </aside>
      </div>
    </>
  );
}
