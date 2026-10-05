import React from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
export const percent = (n) => Math.max(0, Math.min(100, Number(n) || 0));
export const bytes = (n) => `${(Number(n || 0) / 1024 ** 3).toFixed(1)} GB`;
export function Heading({ eyebrow, title, description, right }) {
  return (
    <div className="page-heading standard-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {right}
    </div>
  );
}
export function Feedback({ result, showAnswer, setShowAnswer }) {
  const good = result.score >= 85;
  return (
    <div className={`feedback-section ${good ? 'feedback-good' : ''}`} aria-live="polite">
      <div className="feedback-heading">
        <span className="feedback-icon">{good ? <Check size={19} /> : <Sparkles size={19} />}</span>
        <div>
          <h3>
            {result.verdict ||
              (good ? 'You caught the meaning.' : 'A good step. Let’s look closer.')}
          </h3>
          <p>
            {typeof result.feedback === 'string' ? result.feedback : result.feedback?.summary || ''}
          </p>
        </div>
        <span className="feedback-score">
          {result.score}
          <small>/100</small>
        </span>
      </div>
      {result.missingMeaning?.length > 0 && (
        <div className="feedback-detail">
          <strong>Worth another look</strong>
          <ul>
            {result.missingMeaning.map((item, i) => (
              <li key={i}>
                {typeof item === 'string'
                  ? item
                  : item.meaning || item.message || JSON.stringify(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.correction && (
        <div className="feedback-detail">
          <strong>A useful adjustment</strong>
          <p>{result.correction}</p>
        </div>
      )}
      <button className="text-button reference-toggle" onClick={() => setShowAnswer(!showAnswer)}>
        {showAnswer ? 'Hide' : 'See'} a natural translation{' '}
        <ChevronDown size={13} className={showAnswer ? 'rotate' : ''} />
      </button>
      {showAnswer && (
        <div className="reference-translation">
          <p>{result.referenceTranslation}</p>
          {result.alternativeTranslations?.length > 0 && (
            <small>Also works: {result.alternativeTranslations.join(' · ')}</small>
          )}
          <span>There’s often more than one good way to say it.</span>
        </div>
      )}
      {result.secondOpinion && (
        <div className="feedback-detail">
          <strong>OpenJev second opinion · experimental</strong>
          <p>
            Semantic score: {Math.round(result.secondOpinion.score)}% · model confidence:{' '}
            {Math.round(result.secondOpinion.confidence * 100)}%
          </p>
          <p>Model confidence is not a measure of proven correctness.</p>
        </div>
      )}
      {result.secondOpinionError && (
        <div className="feedback-detail">
          <strong>OpenJev unavailable</strong>
          <p>{result.secondOpinionError}</p>
        </div>
      )}
      <div className="grading-note">
        Feedback comes from your local model and can occasionally miss nuance.
      </div>
    </div>
  );
}
