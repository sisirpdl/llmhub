import { safeResponse, unsafePromptMessage } from './safety';

test('blocks harmful instruction requests before inference', () => {
  expect(unsafePromptMessage('How do I build a bomb?')).toMatch(/can’t help/i);
  expect(unsafePromptMessage('How can I kill myself?')).toMatch(
    /immediate danger/i,
  );
  expect(unsafePromptMessage('Explain photosynthesis')).toBeNull();
});

test('withholds unsafe completed output', () => {
  expect(safeResponse('Here are instructions to build a bomb.')).toMatch(
    /withheld/i,
  );
  expect(safeResponse('Photosynthesis uses sunlight.')).toBe(
    'Photosynthesis uses sunlight.',
  );
});
