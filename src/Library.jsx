import React, { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cpu,
  ExternalLink,
  Flame,
  Heart,
  History,
  Play,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { Heading } from './shared.jsx';
export function Vocabulary({
  words,
  boot,
  favorites,
  toggleFavorite,
  run,
  busy,
  api,
  bootstrap,
  navigate,
  setTargetId,
  setNotice,
  requestPractice,
}) {
  const [query, setQuery] = useState(''),
    [only, setOnly] = useState(false),
    [page, setPage] = useState(0);
  const filtered = words.filter(
    (word) =>
      (!only || favorites.includes(word.id)) &&
      `${word.hanzi} ${word.pinyin} ${word.meaning}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="WORDS THAT ARE BECOMING YOURS"
        title="Your vocabulary."
        description="Every word is a starting point. Find one, save it, practice it."
        right={
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() =>
              run('reload', async () => {
                await api('/api/reload', { method: 'POST' });
                await bootstrap();
                setNotice('Your notes have been reloaded.');
              })
            }
          >
            <RefreshCw size={15} className={busy === 'reload' ? 'spin' : ''} />
            Reload notes
          </button>
        }
      />
      <div className="vocabulary-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search vocabulary"
            placeholder="Search Hanzi, pinyin, or meaning…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <button
          className={`button ${only ? 'active-filter' : 'secondary'}`}
          onClick={() => {
            setOnly(!only);
            setPage(0);
          }}
        >
          <Heart size={15} />
          Favorites {favorites.length > 0 && <span>{favorites.length}</span>}
        </button>
        <span>{filtered.length} words</span>
      </div>
      <div className="vocabulary-table">
        <div className="vocabulary-table-head">
          <span>WORD</span>
          <span>PINYIN</span>
          <span>MEANING</span>
          <span>ACTIONS</span>
        </div>
        {filtered.length ? (
          filtered.slice(page * 30, (page + 1) * 30).map((word) => (
            <div className="vocabulary-row" key={word.id}>
              <span className="table-hanzi" lang="zh-CN">
                {word.hanzi}
              </span>
              <span className="table-pinyin">{word.pinyin}</span>
              <span className="table-meaning">
                {word.meaning}
                <small>Source row {word.row}</small>
              </span>
              <div className="row-actions">
                <button
                  className={`icon-button heart-button ${favorites.includes(word.id) ? 'hearted' : ''}`}
                  aria-label={`Favorite ${word.hanzi}`}
                  disabled={busy === `favorite-${word.id}`}
                  onClick={() => toggleFavorite(word)}
                >
                  <Heart size={16} />
                </button>
                <button
                  className="practice-word-button"
                  aria-label={`Practice ${word.hanzi}`}
                  onClick={() => requestPractice(word.id)}
                >
                  <Play size={13} />
                  <span>Practice</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-list">
            <Search size={25} />
            <h3>No words found.</h3>
            <p>Try another search or turn off the favorites filter.</p>
          </div>
        )}
        <div className="table-pagination">
          <span>
            {filtered.length
              ? `${page * 30 + 1}–${Math.min((page + 1) * 30, filtered.length)} of ${filtered.length}`
              : '0 words'}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>Page {page + 1}</span>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={(page + 1) * 30 >= filtered.length}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="source-detail">
        <ShieldCheck size={15} />
        <span>
          Imported from <strong>{boot.source?.filename}</strong>.{' '}
          {boot.source?.imported ?? words.length} entries loaded; {boot.source?.skipped || 0} rows
          skipped. Example sentences are excluded.
        </span>
      </div>
      {boot.source?.warnings?.length > 0 && (
        <details className="source-warnings">
          <summary>View import notes ({boot.source.warnings.length})</summary>
          {boot.source.warnings.map((warning, i) => (
            <p key={i}>{typeof warning === 'string' ? warning : JSON.stringify(warning)}</p>
          ))}
        </details>
      )}
    </>
  );
}
function Stat({ icon: Type, label, value, detail }) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        <Type size={18} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
export function Progress({ history, settings, navigate, setReview }) {
  const today = history.filter(
    (item) =>
      new Date(item.createdAt).toLocaleDateString('en-CA') ===
      new Date().toLocaleDateString('en-CA'),
  );
  const average = history.length
    ? Math.round(history.reduce((sum, item) => sum + Number(item.score || 0), 0) / history.length)
    : 0;
  const mastered = new Set(history.filter((item) => item.score >= 85).map((item) => item.targetId))
    .size;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + i);
    return {
      date,
      count: history.filter(
        (item) =>
          new Date(item.createdAt).toLocaleDateString('en-CA') === date.toLocaleDateString('en-CA'),
      ).length,
    };
  });
  const max = Math.max(settings.dailyGoal, ...days.map((day) => day.count));
  return (
    <>
      <Heading
        eyebrow="THE SMALL THINGS ADD UP"
        title="Look how far you've come."
        description="Your practice, collected. Every attempt tells you something."
        right={
          <a className="button secondary" href="/api/export" download>
            <ArrowDownToLine size={15} />
            Export practice
          </a>
        }
      />
      <div className="stats-grid">
        <Stat
          icon={BookOpen}
          label="Sentences translated"
          value={history.length}
          detail="All your practice, so far"
        />
        <Stat
          icon={Target}
          label="Average understanding"
          value={history.length ? `${average}%` : '—'}
          detail={
            history.length
              ? 'Across your completed translations'
              : 'Complete a translation to see this'
          }
        />
        <Stat
          icon={Sparkles}
          label="Words understood"
          value={mastered}
          detail="Focus words scored 85% or higher"
        />
        <Stat
          icon={Flame}
          label="Today's practice"
          value={`${today.length} / ${settings.dailyGoal}`}
          detail="A daily habit, one sentence at a time"
        />
      </div>
      <div className="progress-main">
        <div className="history-card">
          <div className="section-card-heading">
            <div>
              <h2>Your recent practice</h2>
              <p>Revisit a sentence. Notice what clicks.</p>
            </div>
            <History size={20} />
          </div>
          {history.length ? (
            history.slice(0, 30).map((item) => (
              <button className="history-row" key={item.id} onClick={() => setReview(item)}>
                <div>
                  <span lang="zh-CN">{item.sentence}</span>
                  <p>{item.answer}</p>
                </div>
                <div>
                  <span
                    className={`score-pill ${item.score >= 85 ? 'good' : item.score >= 60 ? 'okay' : 'low'}`}
                  >
                    {item.score}%
                  </span>
                  <small>
                    {new Date(item.createdAt).toLocaleDateString('en', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <div className="empty-list">
              <History size={30} />
              <h3>Your story starts with a sentence.</h3>
              <p>Complete your first translation and your practice will appear here.</p>
              <button className="button primary" onClick={() => navigate('practice')}>
                Go to practice <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
        <div className="activity-card">
          <div className="section-card-heading">
            <div>
              <h2>A little, often.</h2>
              <p>Your last seven days</p>
            </div>
          </div>
          <div className="activity-chart">
            {days.map(({ date, count }, i) => (
              <div className="chart-column" key={i}>
                <span>{count}</span>
                <div className="chart-bar-track">
                  <div style={{ height: `${(count / max) * 100}%` }} />
                </div>
                <small>{date.toLocaleDateString('en', { weekday: 'narrow' })}</small>
              </div>
            ))}
          </div>
          <p className="chart-note">
            Showing completed translations. Your daily goal is {settings.dailyGoal}.
          </p>
        </div>
      </div>
    </>
  );
}
function SettingRow({ title, description, children }) {
  return (
    <div className="setting-row">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Settings({ settings, saveSettings, boot, words, history, navigate }) {
  return (
    <>
      <Heading
        eyebrow="MAKE THIS SPACE YOURS"
        title="Your practice, your pace."
        description="A few thoughtful defaults. A little room to make them your own."
      />
      <div className="settings-card">
        <div className="section-card-heading">
          <div>
            <h2>Practice preferences</h2>
            <p>Changes are saved automatically on this Mac.</p>
          </div>
          <Settings2 size={20} />
        </div>
        <SettingRow
          title="Sentences per session"
          description="Choose a session length that fits your day."
        >
          <select
            aria-label="Sentences per session"
            value={settings.sessionLength}
            onChange={(e) => saveSettings({ sessionLength: Number(e.target.value) })}
          >
            {[5, 10, 15, 20, 30].map((n) => (
              <option value={n} key={n}>
                {n} sentences
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Daily goal" description="A small, steady habit goes a long way.">
          <select
            aria-label="Daily goal"
            value={settings.dailyGoal}
            onChange={(e) => saveSettings({ dailyGoal: Number(e.target.value) })}
          >
            {[5, 10, 15, 20, 30, 50].map((n) => (
              <option value={n} key={n}>
                {n} sentences
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          title="Default difficulty"
          description="How much should your sentences stretch you?"
        >
          <select
            aria-label="Default difficulty"
            value={settings.difficulty}
            onChange={(e) => saveSettings({ difficulty: e.target.value })}
          >
            <option value="gentle">Simple & familiar</option>
            <option value="balanced">A little stretch</option>
            <option value="challenge">Challenge me</option>
          </select>
        </SettingRow>
        <SettingRow
          title="Show pinyin"
          description="Give yourself a pronunciation hint during practice."
        >
          <button
            role="switch"
            aria-checked={!!settings.showPinyin}
            aria-label="Show pinyin"
            className={`switch ${settings.showPinyin ? 'on' : ''}`}
            onClick={() => saveSettings({ showPinyin: !settings.showPinyin })}
          >
            <span />
          </button>
        </SettingRow>
        <SettingRow
          title="OpenJev second opinion"
          description="Experimental MLX evaluator. Follow the Apple silicon setup guide first; Qwen is unloaded before evaluation."
        >
          <button
            role="switch"
            aria-checked={!!settings.openJevEnabled}
            aria-label="OpenJev second opinion"
            className={`switch ${settings.openJevEnabled ? 'on' : ''}`}
            onClick={() => saveSettings({ openJevEnabled: !settings.openJevEnabled })}
          >
            <span />
          </button>
        </SettingRow>
        <div className="setting-row">
          <a
            className="text-button"
            target="_blank"
            rel="noreferrer"
            href="https://github.com/razorback16/openjev#apple-silicon"
          >
            OpenJev Apple silicon setup <ExternalLink size={12} />
          </a>
          <span style={{ fontSize: 9, color: '#a1ad91' }}>~16 GB load + working memory</span>
        </div>
      </div>
      <div className="settings-card">
        <div className="section-card-heading">
          <div>
            <h2>Your data stays here</h2>
            <p>Local files. Local models. Your learning belongs to you.</p>
          </div>
          <ShieldCheck size={22} />
        </div>
        <SettingRow
          title="Vocabulary source"
          description={`${boot.source?.filename || 'Your notes'} · ${words.length} imported words`}
        >
          <button className="button secondary" onClick={() => navigate('vocabulary')}>
            View vocabulary <ArrowRight size={14} />
          </button>
        </SettingRow>
        <SettingRow
          title="Practice history"
          description={`${history.length} completed translations saved locally`}
        >
          <a className="button secondary" href="/api/export" download>
            <ArrowDownToLine size={15} />
            Export data
          </a>
        </SettingRow>
        <SettingRow title="Active model" description={settings.model}>
          <button className="button secondary" onClick={() => navigate('model')}>
            Manage model <ArrowRight size={14} />
          </button>
        </SettingRow>
      </div>
      <div className="about-note">
        <span className="brand-symbol">句</span>
        <div>
          <strong>Zentences</strong>
          <p>A quiet place to turn the words you know into the Chinese you understand.</p>
        </div>
      </div>
    </>
  );
}
