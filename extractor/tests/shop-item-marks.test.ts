import { describe, expect, it } from 'vitest';
import { parseItemMarksText } from '../src/persisters/shops.js';

describe('shop item marks', () => {
  it('maps RoboTrucker UUID markers to class names', () => {
    const marks = parseItemMarksText(
      [
        'MISC_Starfarer',
        'c989caf2-84a5-4c01-b99e-5fc9f8d0ce8e',
        'RSI_Aurora_CL',
        '7cab9bbc-3d67-4ee7-99ef-fe41991f8a3b',
        '<ItemMarks>RSI_Aurora_ES',
        '984283ce-dd5f-4807-a7b0-f6fbf053716c',
      ].join('\0'),
    );

    expect(marks.get('7cab9bbc-3d67-4ee7-99ef-fe41991f8a3b')).toBe('RSI_Aurora_CL');
    expect(marks.get('984283ce-dd5f-4807-a7b0-f6fbf053716c')).toBe('RSI_Aurora_ES');
  });
});
