jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import { responseReportDraft } from './responseReport';
import { buildIssueReport } from './issueReport';

test('includes selected text without image bytes and keeps diagnostics opt-in', () => {
  const draft = responseReportDraft({
    id: 'response',
    role: 'assistant',
    modelName: 'Example model',
    content: [
      { type: 'text', text: 'Selected response' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,private' },
      },
    ],
  });
  expect(draft.description).toBe('Selected response');
  expect(draft.includeDiagnostics).toBe(false);
  expect(JSON.stringify(draft)).not.toContain('private');
  expect(draft.steps).toContain('Example model');
});

test('long responses fit existing server limits without losing the truncation notice', () => {
  const draft = responseReportDraft({
    id: 'response',
    role: 'assistant',
    content: 'a'.repeat(5000),
  });
  expect(draft.description).toHaveLength(4000);
  expect(draft.description).toContain('[Response truncated');
  expect(() =>
    buildIssueReport(draft, {
      appVersion: '1',
      platform: 'android',
      osVersion: '36',
    }),
  ).not.toThrow();
});
