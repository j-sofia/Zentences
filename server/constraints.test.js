import { describe, expect, it } from 'vitest';
import { validateSentence } from './constraints.js';

const words = ['我', '你', '喜欢', '学习', '中文', '中国', '中国人', '好'].map((hanzi) => ({
  hanzi,
}));

describe('vocabulary constraints', () => {
  it('segments learned words and allows punctuation', () => {
    expect(validateSentence('我喜欢学习中文。', words, '中文')).toEqual({
      valid: true,
      tokens: ['我', '喜欢', '学习', '中文'],
      unknown: [],
    });
  });
  it('rejects a target present only inside a different word', () => {
    expect(validateSentence('中国人喜欢中文。', words, '中国').valid).toBe(false);
  });
  it('rejects unknown words and Latin text', () => {
    expect(validateSentence('我喜欢猫。', words, '我').unknown).toContain('猫');
    expect(validateSentence('我喜欢你好 hello', words, '我').valid).toBe(false);
    expect(validateSentence('我1', words, '我').valid).toBe(false);
  });
  it('finds a valid segmentation when greedy matching cannot complete', () => {
    const dictionary = ['中文', '中', '文好'].map((hanzi) => ({ hanzi }));
    expect(validateSentence('中文好', dictionary, '中')).toEqual({
      valid: true,
      tokens: ['中', '文好'],
      unknown: [],
    });
  });
  it('does not join words across punctuation or accept empty sentences', () => {
    expect(validateSentence('喜，欢', words, '喜欢').valid).toBe(false);
    expect(validateSentence('。', words, '好').valid).toBe(false);
    expect(validateSentence('', words, '好').valid).toBe(false);
  });
  it('accepts target objects, handles missing targets, and rejects oversized output', () => {
    expect(validateSentence('你好', words, { hanzi: '你' }).valid).toBe(true);
    expect(validateSentence('你好', words, '不存在').valid).toBe(false);
    expect(validateSentence('我'.repeat(161), words, '我').valid).toBe(false);
  });
});
