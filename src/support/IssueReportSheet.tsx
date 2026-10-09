import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { version } from '../../package.json';
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
  async function persist(share: boolean) {
    if (lock.current || loading || failedRestore.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const report = share
        ? buildIssueReport(draft, {
            appVersion: version,
            platform: Platform.OS,
            osVersion: String(Platform.Version),
          })
        : null;
      await saveIssueDraft(draft);
      changed.current = false;
      if (report) {
        await Share.share({
          title: 'LLMHub issue report',
          message: JSON.stringify(report, null, 2),
        });
        setNotice('Draft saved. Sharing does not submit it to LLMHub.');
      } else
        setNotice('Draft saved on this device. It has not been submitted.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to save or share this report.',
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
    Alert.alert(
      'Discard unsaved changes?',
      'Your previously saved draft will be kept.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard changes', style: 'destructive', onPress: onClose },
      ],
    );
  }
  function clear() {
    if (lock.current || loading) return;
    Alert.alert(
      'Clear report?',
      'Delete the draft saved on this device and clear this form.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear report',
          style: 'destructive',
          onPress: async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            try {
              await clearIssueDraft();
              setDraft(emptyIssueDraft());
              changed.current = false;
              failedRestore.current = false;
              setError('');
              setNotice('Draft cleared.');
            } catch {
              setError('Unable to clear the saved report.');
            } finally {
              lock.current = false;
              setBusy(false);
            }
          },
        },
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
          Describe what went wrong. Reports stay on this device until you choose
          to share them. Direct submission is not available yet.
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
            style={{ color: colors.accent }}
          >
            {notice}
          </Text>
        ) : null}
        <Button
          label={loading ? 'Loading draft…' : busy ? 'Working…' : 'Save draft'}
          icon="storage"
          colors={colors}
          onPress={() => persist(false)}
          disabled={disabled}
        />
        <Button
          label="Share report"
          icon="external"
          colors={colors}
          onPress={() => persist(true)}
          disabled={
            disabled || !draft.title.trim() || !draft.description.trim()
          }
        />
        <Button
          label="Clear report"
          icon="trash"
          colors={colors}
          onPress={clear}
          disabled={busy || loading}
        />
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
