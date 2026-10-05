import { describe, it, expect } from 'vitest';
import { validateLexicalSentence } from './constraints.js';
describe('independent Chinese lexical check', () => {
  it('rejects an unseen compound assembled from familiar characters', () => {
    expect(
      validateLexicalSentence(
        '他是大人。',
        ['他', '是', '大', '人'].map((hanzi) => ({ hanzi })),
      ),
    ).toEqual({ valid: false, unknown: ['大人'] });
  });
  it('accepts ordinary grammar using learned headwords', () => {
    expect(
      validateLexicalSentence(
        '我今天想去学校。',
        ['我', '今天', '想', '去', '学校'].map((hanzi) => ({ hanzi })),
      ),
    ).toEqual({ valid: true, unknown: [] });
  });
  it('accepts a compound if it actually appears in the vocabulary bank', () => {
    expect(
      validateLexicalSentence(
        '他是大人。',
        ['他', '是', '大人'].map((hanzi) => ({ hanzi })),
      ),
    ).toEqual({ valid: true, unknown: [] });
  });
});
