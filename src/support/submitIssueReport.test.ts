import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildIssueReport, emptyIssueDraft } from './issueReport';
import { submitIssueReport } from './submitIssueReport';
jest.mock('./reportBackend.json', () => ({
  supabaseUrl: 'https://testproject.supabase.co',
  publishableKey: 'sb_publishable_publictestkey',
}));
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async key => mockStore.get(key) || null),
    setItem: jest.fn(async (key, value) => {
      mockStore.set(key, value);
    }),
    removeItem: jest.fn(async key => {
      mockStore.delete(key);
    }),
  },
}));
const report = buildIssueReport(
  { ...emptyIssueDraft(), title: 'Bug', description: 'Unexpected result' },
  { appVersion: '1', platform: 'ios', osVersion: '18' },
);
let send: jest.Mock;
beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  send = jest.fn(async (_url, options) => ({
    ok: true,
    json: async () => ({ id: JSON.parse(options.body).id }),
  }));
  global.fetch = send;
});
test('sends only the report to the configured HTTPS function with a publishable apikey', async () => {
  const id = await submitIssueReport(report);
  const [url, options] = send.mock.calls[0];
  expect(url).toBe(
    'https://testproject.supabase.co/functions/v1/submit-issue-report',
  );
  expect(options.headers).toEqual({
    'Content-Type': 'application/json',
    apikey: 'sb_publishable_publictestkey',
  });
  expect(JSON.parse(options.body)).toEqual({
    id,
    version: 1,
    title: 'Bug',
    description: 'Unexpected result',
    steps: '',
  });
});
test('lost response retries reuse the receipt ID; changed content gets a new ID', async () => {
  send.mockRejectedValueOnce(new Error('Network unavailable'));
  await expect(submitIssueReport(report)).rejects.toThrow();
  await submitIssueReport(report);
  expect(JSON.parse(send.mock.calls[0][1].body).id).toBe(
    JSON.parse(send.mock.calls[1][1].body).id,
  );
  await submitIssueReport({ ...report, title: 'Different bug' });
  expect(JSON.parse(send.mock.calls[2][1].body).id).not.toBe(
    JSON.parse(send.mock.calls[1][1].body).id,
  );
});
test('only an acknowledged matching receipt counts as success', async () => {
  send.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id: 'unrelated' }),
  });
  await expect(submitIssueReport(report)).rejects.toThrow('did not confirm');
  send.mockResolvedValueOnce({ ok: false, status: 429 });
  await expect(submitIssueReport(report)).rejects.toThrow('limit');
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});
