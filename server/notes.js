import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pinyin } from 'pinyin-pro';

const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const clean = (text) =>
  text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&([a-z]+);/gi, (_, name) => entities[name] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
const partsOfSpeech =
  /\b(?:noun|pronoun|verb|adverb|adjective|preposition|conjunction|classifier|auxiliary|numeral|(?:modal |grammatical )?particle|interjection|phrase|time word|directional locality|place name|other proper noun|fixed expression|stative verb)\b/gi;
const romanize = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();

function parseRow(line, row) {
  const fields = line.split('\t');
  // Bracketed numeric pronunciation is the vocabulary marker in the export.
  // The second field is authoritative: the front may be a definition or example.
  const detail = clean(fields.length > 1 ? fields[1] : fields[0]);
  const match = detail.match(/([\p{Script=Han}]+)\[([a-züv:0-9\s]+)\]/iu);
  if (!match) return { invalid: true, row };
  const hanzi = match[1];
  const remainder = detail.slice(match.index + match[0].length).trim();
  const withoutCount = remainder
    .replace(/\d+\s*字/g, ' ')
    .replace(/\(not[^)]*\)/g, ' ')
    .trim();
  const derived = pinyin(hanzi, { toneType: 'symbol', type: 'array' }).join(' ');
  const expected = romanize(match[2]);
  const tokens = withoutCount.split(/\s+/);
  const prefix = tokens.reduce(
    (result, token) => {
      if (result.done) return result;
      const next = [...result.tokens, token];
      const normalized = romanize(next.join(''));
      return { tokens: next, done: normalized === expected || !expected.startsWith(normalized) };
    },
    { tokens: [], done: false },
  ).tokens;
  const hasPronunciation = romanize(prefix.join('')) === expected;
  const displayPinyin =
    hasPronunciation && !/\d/.test(prefix.join('')) ? prefix.join(' ') : derived;
  const definition = (
    hasPronunciation ? tokens.slice(prefix.length).join(' ') : withoutCount
  ).replace(/Open Example Sentences.*$/i, '');
  // POS words sometimes occur in the definition; the last label before the
  // example is the actual type (e.g. "particle indicating ... modal particle").
  const labels = [...definition.matchAll(partsOfSpeech)];
  const lastLabel = labels.at(-1);
  const meaning =
    (lastLabel
      ? definition.slice(0, lastLabel.index)
      : definition.split(/[\p{Script=Han}]/u)[0]
    ).trim() || 'Vocabulary word';
  return {
    id: createHash('sha256').update(hanzi).digest('hex').slice(0, 16),
    hanzi,
    pinyin: displayPinyin,
    meaning,
    row,
  };
}

export function parseNotes(text, filename = 'Selected Notes.txt') {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const records = rows.flatMap((line, index) =>
    !line.trim() || line.startsWith('#') ? [] : [parseRow(line, index + 1)],
  );
  const valid = records.filter((r) => !r.invalid);
  const words = valid.filter(
    (word, index) => valid.findIndex((w) => w.hanzi === word.hanzi) === index,
  );
  if (!words.length)
    throw new Error(
      'No vocabulary headwords found. Use an Anki text export with 汉字[pinyin] entries.',
    );
  const skipped = records.filter((r) => r.invalid).length;
  return {
    words,
    source: {
      filename,
      totalRows: records.length,
      imported: words.length,
      duplicates: valid.length - words.length,
      skipped,
      warnings: skipped
        ? [`${skipped} row(s) did not contain a vocabulary marker and were ignored.`]
        : [],
    },
  };
}

export async function loadNotes(root) {
  const files = await readdir(root);
  const filename = files.find(
    (name) => name.toLowerCase().replace(/[\s_-]/g, '') === 'selectednotes.txt',
  );
  if (!filename)
    throw new Error(
      'Selected Notes.txt was not found in the Sentences folder. Add your export and reload vocabulary.',
    );
  const file = path.join(root, filename);
  if ((await stat(file)).size > 10 * 1024 * 1024)
    throw new Error('The vocabulary export must be smaller than 10 MB.');
  return parseNotes(await readFile(file, 'utf8'), filename);
}
