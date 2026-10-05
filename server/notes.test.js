import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseNotes, loadNotes } from './notes.js';
describe('vocabulary import', () => {
  it('extracts only marked headwords and discards examples', () => {
    const { words, source } = parseNotes(
      '#separator:tab\nDeck 我 苹果\tDeck 我[wo3] wǒ I; me pronoun 我吃苹果。 I eat apples.\nDeck 我\tDeck 我[wo3] wǒ I pronoun\nbad row',
      'test.txt',
    );
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ hanzi: '我', pinyin: 'wǒ', meaning: 'I; me', row: 2 });
    expect(JSON.stringify(words)).not.toContain('苹果');
    expect(source.skipped).toBe(1);
    expect(source.duplicates).toBe(1);
  });
  it('parses the complete actual export without harvesting examples', async () => {
    const text = await readFile(new URL('../Selected Notes.txt', import.meta.url), 'utf8');
    const { words, source } = parseNotes(text, 'Selected Notes.txt');
    expect(source.totalRows).toBe(380);
    expect(words.length).toBeGreaterThan(150);
    expect(words.some((w) => w.hanzi === '为什么')).toBe(true);
    expect(words.find((w) => w.hanzi === '可以').meaning).toContain('can');
    expect(words.find((w) => w.hanzi === '我').pinyin).toBe('wǒ');
    expect(words.every((w) => !w.meaning.includes('Open Example'))).toBe(true);
  });
  it('handles BOM, HTML entities, no metadata and numbered pinyin', () => {
    const result = parseNotes(
      '\uFEFF我[wo3] wo3 I; me pronoun\n爱[ai4] ài love &amp; care verb\n#html:false',
    );
    expect(result.words.map((w) => w.hanzi)).toEqual(['我', '爱']);
    expect(result.words[1].meaning).toBe('love & care');
  });
  it('finds the existing file by normalized name', async () => {
    expect((await loadNotes(process.cwd())).source.filename).toBe('Selected Notes.txt');
  });
  it('rejects empty and missing files clearly', async () => {
    expect(() => parseNotes('examples only')).toThrow('No vocabulary');
    await expect(loadNotes('/nonexistent-sentences-test')).rejects.toThrow();
  });
});
