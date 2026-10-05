import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict.js';
const lexicon = Jieba.withDict(dict);
const HANZI = /^\p{Script=Han}+$/u;
const SEPARATOR = /^[\p{P}\s]$/u;

/** Segment against imported headwords, requiring the focus word as an entire token. */
export function validateSentence(sentence, words, target) {
  if (typeof sentence !== 'string' || !sentence.trim() || sentence.length > 160) {
    return { valid: false, tokens: [], unknown: ['Sentence must contain 1–160 characters.'] };
  }
  const targetWord = typeof target === 'string' ? target : target?.hanzi;
  const dictionary = [
    ...new Set(words.map((word) => (typeof word === 'string' ? word : word.hanzi))),
  ]
    .filter((word) => typeof word === 'string' && HANZI.test(word))
    .sort((a, b) => b.length - a.length);
  const memo = new Map();
  function segment(position, foundTarget) {
    if (position === sentence.length) return foundTarget ? [] : null;
    const key = `${position}:${foundTarget}`;
    if (memo.has(key)) return memo.get(key);
    if (SEPARATOR.test(sentence[position])) return segment(position + 1, foundTarget);
    for (const word of dictionary) {
      if (!sentence.startsWith(word, position)) continue;
      const rest = segment(position + word.length, foundTarget || word === targetWord);
      if (rest !== null) {
        const result = [word, ...rest];
        memo.set(key, result);
        return result;
      }
    }
    memo.set(key, null);
    return null;
  }
  const tokens = segment(0, false);
  if (tokens?.length) return { valid: true, tokens, unknown: [] };
  // Recover useful diagnostics without treating character fragments as learned words.
  const recovered = [];
  const unknown = [];
  for (let position = 0; position < sentence.length;) {
    const character = String.fromCodePoint(sentence.codePointAt(position));
    if (SEPARATOR.test(character)) {
      position += character.length;
      continue;
    }
    const word = dictionary.find((entry) => sentence.startsWith(entry, position));
    if (word) {
      recovered.push(word);
      position += word.length;
    } else {
      unknown.push(character);
      position += character.length;
    }
  }
  return { valid: false, tokens: recovered, unknown: [...new Set(unknown)] };
}

/** Independent dictionary check catches unknown compounds of familiar characters.
 * Segmentation remains a linguistic heuristic; ambiguous boundaries may trigger retries.
 */
export function validateLexicalSentence(sentence, words) {
  const allowed = new Set(words.map((word) => word.hanzi));
  const unknown = [
    ...new Set(
      lexicon.cut(sentence, false).filter((token) => HANZI.test(token) && !allowed.has(token)),
    ),
  ];
  return { valid: unknown.length === 0, unknown };
}
