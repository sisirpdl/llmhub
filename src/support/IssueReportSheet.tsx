import { showDialog } from '../ui/Popups';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { version } from '../../package.json';
import {
  submitIssueReport,
  reportSubmissionConfigured,
  clearPendingIssueSubmission,
} from './submitIssueReport';
import { Button, Sheet } from '../ui/Controls';
import type { Colors } from '../ui/theme';
import {
  buildIssueReport,
  clearIssueDraft,
  emptyIssueDraft,
  readIssueDraft,
  saveIssueDraft,
  type IssueDraft,
} from './issueReport';
export function IssueReportSheet({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: Colors;
}) {
  const [draft, setDraft] = useState<IssueDraft>(emptyIssueDraft);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const changed = useRef(false);
  const failedRestore = useRef(false);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError('');
    setNotice('');
    changed.current = false;
    readIssueDraft()
      .then(value => {
        if (active) {
          setDraft(value);
          failedRestore.current = false;
        }
      })
      .catch(e => {
        if (active) {
          failedRestore.current = true;
          setError(
            e instanceof Error
              ? e.message
              : 'Unable to restore the saved report.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);
  function edit(change: Partial<IssueDraft>) {
    setDraft(current => ({ ...current, ...change }));
    changed.current = true;
    setNotice('');
  }
  async function persist(submit: boolean) {
    if (lock.current || loading || failedRestore.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const report = submit
        ? buildIssueReport(draft, {
            appVersion: version,
            platform: Platform.OS,
            osVersion: String(Platform.Version),
          })
        : null;
      await saveIssueDraft(draft);
      changed.current = false;
      if (report) {
        await submitIssueReport(report);
        setNotice('Report submitted. Thank you.');
        try {
          await clearIssueDraft();
          await clearPendingIssueSubmission();
          setDraft(emptyIssueDraft());
        } catch {
          setNotice('Report submitted. The saved draft could not be cleared.');
        }
      } else
        setNotice('Draft saved on this device. It has not been submitted.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to save or submit this report. Your draft was kept.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (lock.current || loading) return;
    if (!changed.current) {
      onClose();
      return;
    }
    showDialog(
      'Discard unsaved changes?',
      'Your previously saved draft will be kept.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard changes', style: 'destructive', onPress: onClose },
      ],
    );
  }
  const disabled = busy || loading || failedRestore.current;
  const input = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.input,
      borderColor: colors.border,
    },
  ];
  return (
    <Sheet
      visible={visible}
      title="Report an issue"
      colors={colors}
      onClose={close}
    >
      <View style={styles.content}>
        <Text style={{ color: colors.muted }}>
          Submitting sends this form and any opted-in app details to LLMHub
          support. Drafts stay on this device.
        </Text>
        <Text style={{ color: colors.text }}>Title</Text>
        <TextInput
          accessibilityLabel="Issue title"
          placeholder="What went wrong?"
          placeholderTextColor={colors.muted}
          value={draft.title}
          onChangeText={title => edit({ title })}
          maxLength={120}
          editable={!disabled}
          style={input}
        />
        <Text style={{ color: colors.text }}>Description</Text>
        <TextInput
          accessibilityLabel="Issue description"
          placeholder="What happened, and what did you expect?"
          placeholderTextColor={colors.muted}
          value={draft.description}
          onChangeText={description => edit({ description })}
          maxLength={4000}
          multiline
          textAlignVertical="top"
          editable={!disabled}
          style={[input, styles.multiline]}
        />
        <Text style={{ color: colors.text }}>
          Steps to reproduce · Optional
        </Text>
        <TextInput
          accessibilityLabel="Steps to reproduce"
          placeholder="1. Open… 2. Tap…"
          placeholderTextColor={colors.muted}
          value={draft.steps}
          onChangeText={steps => edit({ steps })}
          maxLength={2000}
          multiline
          textAlignVertical="top"
          editable={!disabled}
          style={[input, styles.steps]}
        />
        <View style={styles.diagnostics}>
          <View style={styles.fill}>
            <Text style={{ color: colors.text }}>
              Include basic app details
            </Text>
            <Text style={{ color: colors.muted }}>
              LLMHub {version} · {Platform.OS} {String(Platform.Version)}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Include basic app details"
            value={draft.includeDiagnostics}
            onValueChange={includeDiagnostics => edit({ includeDiagnostics })}
            disabled={disabled}
            trackColor={{ true: colors.accent }}
          />
        </View>
        <Text style={{ color: colors.muted }}>
          Chats, documents, model files, tokens and logs are never added
          automatically. Avoid putting private information in your description.
        </Text>
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color:
                notice === 'Report submitted. Thank you.'
                  ? colors.green
                  : colors.muted,
            }}
          >
            {notice}
          </Text>
        ) : null}
        <Button
          label={loading ? 'Loading draft…' : busy ? 'Working…' : 'Save draft'}
          icon="save"
          colors={colors}
          onPress={() => persist(false)}
          disabled={disabled}
        />
        <Button
          label="Submit report"
          icon="external"
          colors={colors}
          onPress={() => persist(true)}
          disabled={
            disabled ||
            !reportSubmissionConfigured() ||
            !draft.title.trim() ||
            !draft.description.trim()
          }
        />
        {!reportSubmissionConfigured() ? (
          <Text style={{ color: colors.muted }}>
            Support is unavailable in this build. You can save your draft.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
const styles = StyleSheet.create({
  content: { gap: 12 },
  input: {
    minHeight: 48,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
  multiline: { minHeight: 120 },
  steps: { minHeight: 88 },
  diagnostics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  fill: { flex: 1 },
});
