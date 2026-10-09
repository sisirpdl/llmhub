import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildIssueReport,
  clearIssueDraft,
  emptyIssueDraft,
  ISSUE_DRAFT_KEY,
  parseIssueDraft,
  readIssueDraft,
  saveIssueDraft,
} from './issueReport';
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
const draft = {
  ...emptyIssueDraft(),
  title: '  Model stopped  ',
  description: '  Generation ended early.  ',
  steps: 'Tap send.',
};
const diagnostics = {
  appVersion: '0.0.1',
  platform: 'android',
  osVersion: '36',
  token: 'never include',
  messages: ['private'],
} as any;
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
});
test('reports omit diagnostics by default and trim required fields', () => {
  const report = buildIssueReport(
    draft,
    diagnostics,
    new Date('2026-10-09T00:00:00Z'),
  );
  expect(report).toEqual({
    version: 1,
    createdAt: '2026-10-09T00:00:00.000Z',
    title: 'Model stopped',
    description: 'Generation ended early.',
    steps: 'Tap send.',
  });
});
test('opt-in diagnostics contain only the explicit allowlist', () => {
  expect(
    buildIssueReport({ ...draft, includeDiagnostics: true }, diagnostics)
      .diagnostics,
  ).toEqual({ appVersion: '0.0.1', platform: 'android', osVersion: '36' });
});
test('invalid and oversized drafts cannot become reports', () => {
  expect(() => buildIssueReport(emptyIssueDraft(), diagnostics)).toThrow(
    'title',
  );
  for (const change of [
    { title: 'x'.repeat(121) },
    { description: 'x'.repeat(4001) },
    { steps: 'x'.repeat(2001) },
    { includeDiagnostics: 'yes' },
  ])
    expect(() => parseIssueDraft({ ...draft, ...change })).toThrow();
});
test('draft save and restore discard unrelated data', async () => {
  await saveIssueDraft({ ...draft, token: 'secret' } as any);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    ISSUE_DRAFT_KEY,
    JSON.stringify(draft),
  );
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify({ ...draft, messages: ['secret'] }),
  );
  expect(await readIssueDraft()).toEqual(draft);
  await clearIssueDraft();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(ISSUE_DRAFT_KEY);
});
test('corrupt restoration and storage failures are surfaced without overwriting data', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json');
  await expect(readIssueDraft()).rejects.toThrow();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error('Storage full'),
  );
  await expect(saveIssueDraft(draft)).rejects.toThrow('Storage full');
});
