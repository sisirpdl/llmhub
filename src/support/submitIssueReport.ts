import AsyncStorage from '@react-native-async-storage/async-storage';
import config from './reportBackend.json';
import type { IssueReport } from './issueReport';
const PENDING_KEY = '@llmhub/pending-issue-submission-v1';
export const reportSubmissionConfigured = () =>
  Boolean(
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) &&
      /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey),
  );
// Receipt IDs are deduplication identifiers, not authentication secrets.
function receiptId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n % 4) + 8).toString(16);
  });
}
export async function submitIssueReport(report: IssueReport): Promise<string> {
  if (!reportSubmissionConfigured())
    throw new Error(
      'Report submission is not configured yet. Your draft stays on this device.',
    );
  const payload = {
    version: report.version,
    title: report.title,
    description: report.description,
    steps: report.steps,
    ...(report.diagnostics ? { diagnostics: report.diagnostics } : {}),
  };
  const signature = JSON.stringify(payload);
  const saved = await AsyncStorage.getItem(PENDING_KEY);
  let pending: { id: string; signature: string } | null = null;
  try {
    pending = saved ? JSON.parse(saved) : null;
  } catch {
    /* A corrupt retry record can be replaced without losing the draft. */
  }
  const id =
    pending?.signature === signature &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      pending.id,
    )
      ? pending.id
      : receiptId();
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ id, signature }));
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(
      `${config.supabaseUrl}/functions/v1/submit-issue-report`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.publishableKey,
        },
        body: JSON.stringify({ id, ...payload }),
        signal: abort.signal,
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'Report limit reached. Please try again later. Your draft was kept.'
          : response.status === 401
          ? 'Report service configuration needs attention. Your draft was kept.'
          : 'Unable to submit the report. Your draft was kept; please retry.',
      );
    const data = await response.json();
    if (data?.id !== id)
      throw new Error(
        'The server did not confirm this report. Your draft was kept.',
      );
    return id;
  } catch (error) {
    if (abort.signal.aborted)
      throw new Error(
        'Submission timed out. Your draft was kept; retrying will not duplicate the report.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export const clearPendingIssueSubmission = () =>
  AsyncStorage.removeItem(PENDING_KEY);
