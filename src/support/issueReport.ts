import AsyncStorage from '@react-native-async-storage/async-storage';
export const ISSUE_DRAFT_KEY = '@llmhub/issue-report-draft-v1';
export type IssueDraft = {
  title: string;
  description: string;
  steps: string;
  includeDiagnostics: boolean;
};
export type IssueDiagnostics = {
  appVersion: string;
  platform: string;
  osVersion: string;
};
export type IssueReport = {
  version: 1;
  createdAt: string;
  title: string;
  description: string;
  steps: string;
  diagnostics?: IssueDiagnostics;
};
export const emptyIssueDraft = (): IssueDraft => ({
  title: '',
  description: '',
  steps: '',
  includeDiagnostics: false,
});
export function parseIssueDraft(value: unknown): IssueDraft {
  const draft = value as IssueDraft;
  if (
    !draft ||
    typeof draft.title !== 'string' ||
    draft.title.length > 120 ||
    typeof draft.description !== 'string' ||
    draft.description.length > 4000 ||
    typeof draft.steps !== 'string' ||
    draft.steps.length > 2000 ||
    typeof draft.includeDiagnostics !== 'boolean'
  )
    throw new Error(
      'The saved report could not be restored. Clear it to start again.',
    );
  return {
    title: draft.title,
    description: draft.description,
    steps: draft.steps,
    includeDiagnostics: draft.includeDiagnostics,
  };
}
export function buildIssueReport(
  draft: IssueDraft,
  diagnostics: IssueDiagnostics,
  date = new Date(),
): IssueReport {
  const value = parseIssueDraft(draft);
  if (!value.title.trim() || !value.description.trim())
    throw new Error('Add a title and describe the issue.');
  return {
    version: 1,
    createdAt: date.toISOString(),
    title: value.title.trim(),
    description: value.description.trim(),
    steps: value.steps.trim(),
    ...(value.includeDiagnostics
      ? {
          diagnostics: {
            appVersion: diagnostics.appVersion,
            platform: diagnostics.platform,
            osVersion: diagnostics.osVersion,
          },
        }
      : {}),
  };
}
export async function readIssueDraft(): Promise<IssueDraft> {
  const saved = await AsyncStorage.getItem(ISSUE_DRAFT_KEY);
  return saved ? parseIssueDraft(JSON.parse(saved)) : emptyIssueDraft();
}
export async function saveIssueDraft(draft: IssueDraft) {
  await AsyncStorage.setItem(
    ISSUE_DRAFT_KEY,
    JSON.stringify(parseIssueDraft(draft)),
  );
}
export const clearIssueDraft = () => AsyncStorage.removeItem(ISSUE_DRAFT_KEY);
