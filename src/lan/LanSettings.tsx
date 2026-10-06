import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppController } from '../app/AppController';
import { Button, IconButton } from '../ui/Controls';
import { Icon, type IconName } from '../ui/Icon';
import type { Colors } from '../ui/theme';
import { pairingDetails } from './protocol';
function CardHeading({
  title,
  subtitle,
  icon,
  colors,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  colors: Colors;
}) {
  return (
    <View style={styles.heading}>
      <View style={[styles.symbol, { backgroundColor: colors.input }]}>
        <Icon name={icon} color={colors.accent} size={22} />
      </View>
      <View style={styles.fill}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
        <Text style={[styles.text, { color: colors.muted }]}>{subtitle}</Text>
      </View>
    </View>
  );
}
function SecondaryAction({
  label,
  onPress,
  disabled = false,
  colors,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: Colors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.border }}
      style={[
        styles.secondary,
        { borderColor: colors.border },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}
export function LanSettings({ app }: { app: AppController }) {
  const { lan, colors } = app;
  const [address, setAddress] = useState('');
  const [key, setKey] = useState('');
  const [visibleSession, setVisibleSession] = useState<string | null>(null);
  const [showClientKey, setShowClientKey] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState('');
  const disabled = lan.pending || app.chat.sending;
  const showKey = Boolean(
    lan.host?.session && visibleSession === lan.host.session,
  );
  const panel = [
    styles.panel,
    { backgroundColor: colors.surface, borderColor: colors.border },
  ];
  const progress =
    lan.stopping && !lan.activity
      ? 'Disconnecting…'
      : lan.activity === 'starting'
      ? 'Starting host…'
      : lan.activity === 'checking'
      ? 'Checking connection…'
      : 'Connecting to host…';
  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.input,
      borderColor: colors.border,
    },
  ];
  function clearSecrets() {
    setKey('');
    setPaste('');
    setPasteVisible(false);
    setPasteError('');
    setShowClientKey(false);
  }
  function useDetails() {
    try {
      const details = pairingDetails(paste);
      setAddress(details.address);
      setKey(details.key);
      setPaste('');
      setPasteError('');
      setPasteVisible(false);
      lan.clearError();
    } catch (e) {
      setPasteError(
        e instanceof Error ? e.message : 'Invalid connection details.',
      );
    }
  }
  return (
    <View style={styles.stack}>
      <Text style={[styles.text, { color: colors.muted }]}>
        Use a model on another phone over the same Wi-Fi. Keep both apps open.
        No internet is needed.
      </Text>
      {lan.pending ? (
        <View accessibilityLiveRegion="polite" style={styles.progress}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.text, { color: colors.text }]}>{progress}</Text>
        </View>
      ) : null}
      {lan.error ? (
        <View style={[styles.error, { borderColor: colors.danger }]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.text, { color: colors.danger }]}
          >
            {lan.error}
          </Text>
        </View>
      ) : null}
      {lan.host ? (
        <View style={panel}>
          <CardHeading
            title="Hosting this phone"
            subtitle={app.models.model.displayName}
            icon="models"
            colors={colors}
          />
          <View style={styles.status}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: lan.host.token ? colors.green : colors.muted,
                },
              ]}
            />
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.text,
                { color: lan.host.token ? colors.green : colors.muted },
              ]}
            >
              {!lan.host.token
                ? 'Starting…'
                : lan.serving
                ? 'Generating for another device'
                : 'Ready for a connection'}
            </Text>
          </View>
          {lan.host.url ? (
            <>
              <Text style={[styles.label, { color: colors.muted }]}>
                HOST ADDRESS
              </Text>
              <Text
                selectable
                accessibilityLabel="Host address"
                style={[styles.address, { color: colors.text }]}
              >
                {lan.host.url}
              </Text>
            </>
          ) : null}
          <Text style={[styles.text, { color: colors.muted }]}>
            Copy these details to the other phone. Local chat is paused while
            hosting.
          </Text>
          <SecondaryAction
            label={showKey ? 'Hide access key' : 'Show access key'}
            colors={colors}
            disabled={!lan.host.token}
            onPress={() =>
              setVisibleSession(showKey ? null : lan.host!.session)
            }
          />
          {showKey ? (
            <Text
              selectable
              accessibilityLabel="Host access key"
              style={[
                styles.key,
                { color: colors.text, backgroundColor: colors.input },
              ]}
            >
              {lan.host.token}
            </Text>
          ) : null}
          <SecondaryAction
            label="Share connection details"
            colors={colors}
            disabled={!lan.host.token || lan.pending}
            onPress={() => {
              app.models.setExternalUIActive(true);
              lan
                .share()
                .catch(() =>
                  app.models.setNotice(
                    'Unable to share the connection details.',
                  ),
                )
                .finally(() => app.models.setExternalUIActive(false));
            }}
          />
          <Text style={[styles.text, { color: colors.muted }]}>
            Switching apps or locking this phone stops hosting. Starting again
            creates a new access key.
          </Text>
          <Button
            label={
              lan.activity === 'starting' ? 'Cancel starting' : 'Stop hosting'
            }
            icon="stop"
            colors={colors}
            onPress={() => {
              lan.stop();
            }}
          />
        </View>
      ) : lan.remote ? (
        <View style={panel}>
          <CardHeading
            title="Using another phone"
            subtitle={lan.remote.model.displayName.replace(/^LAN · /, '')}
            icon="connected"
            colors={colors}
          />
          <View style={styles.status}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    lan.remoteStatus === 'unreachable'
                      ? colors.danger
                      : colors.green,
                },
              ]}
            />
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.text,
                {
                  color:
                    lan.remoteStatus === 'unreachable'
                      ? colors.danger
                      : colors.green,
                },
              ]}
            >
              {lan.remoteStatus === 'unreachable'
                ? 'Connection needs attention'
                : lan.remoteStatus === 'generating'
                ? 'Host is generating…'
                : 'Connected to host'}
            </Text>
          </View>
          <Text selectable style={[styles.address, { color: colors.text }]}>
            {lan.remote.url}
          </Text>
          <Text style={[styles.text, { color: colors.muted }]}>
            Text replies arrive when complete. Your conversations and document
            library stay on this phone; retrieved passages go to the host.
          </Text>
          <Button
            label="Open LAN chat"
            icon="chat"
            colors={colors}
            disabled={lan.pending}
            onPress={() => app.setRoute('chat')}
          />
          <SecondaryAction
            label="Check connection"
            colors={colors}
            disabled={disabled}
            onPress={lan.checkConnection}
          />
          <SecondaryAction
            label="Disconnect"
            colors={colors}
            onPress={() => {
              setAddress(lan.remote!.url);
              setKey('');
              lan.stop();
            }}
          />
        </View>
      ) : (
        <>
          <View style={panel}>
            <CardHeading
              title="Host on this phone"
              subtitle="Share your loaded model"
              icon="models"
              colors={colors}
            />
            <Text style={[styles.text, { color: colors.muted }]}>
              {app.models.context
                ? app.models.model.displayName
                : 'Load a model first. The other phone does not need to download it.'}
            </Text>
            <Button
              label="Start hosting"
              icon="connected"
              colors={colors}
              disabled={disabled || !app.models.context}
              onPress={() => {
                lan.start().then(success => {
                  if (success) clearSecrets();
                });
              }}
            />
            {!app.models.context ? (
              <SecondaryAction
                label="Choose a model"
                colors={colors}
                disabled={disabled}
                onPress={() => app.setRoute('models')}
              />
            ) : null}
          </View>
          <View style={panel}>
            <CardHeading
              title="Connect to another phone"
              subtitle="No model download required"
              icon="connected"
              colors={colors}
            />
            <Text style={[styles.label, { color: colors.muted }]}>
              HOST ADDRESS
            </Text>
            <TextInput
              accessibilityLabel="LAN host address"
              placeholder="http://192.168.1.10:8080"
              placeholderTextColor={colors.muted}
              value={address}
              onChangeText={value => {
                setAddress(value);
                lan.clearError();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              editable={!disabled}
              style={inputStyle}
            />
            <Text style={[styles.label, { color: colors.muted }]}>
              ACCESS KEY
            </Text>
            <View
              style={[
                styles.inputRow,
                { backgroundColor: colors.input, borderColor: colors.border },
              ]}
            >
              <TextInput
                accessibilityLabel="LAN access key"
                placeholder="Key from the host"
                placeholderTextColor={colors.muted}
                value={key}
                onChangeText={value => {
                  setKey(value);
                  lan.clearError();
                }}
                secureTextEntry={!showClientKey}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                maxLength={48}
                editable={!disabled}
                style={[styles.keyInput, { color: colors.text }]}
              />
              <IconButton
                name={showClientKey ? 'eyeOff' : 'eye'}
                label={
                  showClientKey
                    ? 'Hide entered access key'
                    : 'Show entered access key'
                }
                colors={colors}
                disabled={disabled}
                onPress={() => setShowClientKey(value => !value)}
              />
            </View>
            <SecondaryAction
              label={
                pasteVisible
                  ? 'Close pasted details'
                  : 'Paste shared connection details'
              }
              colors={colors}
              disabled={disabled}
              onPress={() => {
                setPasteVisible(value => !value);
                setPaste('');
                setPasteError('');
              }}
            />
            {pasteVisible ? (
              <>
                <TextInput
                  accessibilityLabel="Shared LAN connection details"
                  placeholder={
                    'LLMHub LAN host\nhttp://192.168.1.10:8080\nAccess key: …'
                  }
                  placeholderTextColor={colors.muted}
                  value={paste}
                  onChangeText={value => {
                    setPaste(value);
                    setPasteError('');
                  }}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={1024}
                  editable={!disabled}
                  style={[inputStyle, styles.paste]}
                />
                <Text style={[styles.text, { color: colors.muted }]}>
                  Pasted details include your access key. They are cleared after
                  filling the fields.
                </Text>
                {pasteError ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={{ color: colors.danger }}
                  >
                    {pasteError}
                  </Text>
                ) : null}
                <SecondaryAction
                  label="Fill connection fields"
                  colors={colors}
                  disabled={disabled || !paste.trim()}
                  onPress={useDetails}
                />
              </>
            ) : null}
            <Button
              label={
                lan.activity === 'connecting'
                  ? 'Connecting…'
                  : 'Connect to host'
              }
              icon="connected"
              colors={colors}
              disabled={disabled || !address.trim() || !key.trim()}
              onPress={() => {
                lan.connect(address, key).then(success => {
                  if (success) {
                    clearSecrets();
                  }
                });
              }}
            />
          </View>
          {lan.pending ? (
            <SecondaryAction
              label="Cancel connection"
              colors={colors}
              onPress={() => {
                lan.stop();
              }}
            />
          ) : null}
        </>
      )}
      <View style={[styles.privacy, { borderColor: colors.border }]}>
        <Icon name="shield" color={colors.muted} size={18} />
        <Text style={[styles.text, styles.fill, { color: colors.muted }]}>
          Trusted Wi-Fi only. Messages and retrieved passages travel over
          unencrypted local HTTP. The access key controls access; it does not
          encrypt traffic.
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  stack: { gap: 14 },
  panel: {
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  heading: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  symbol: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', lineHeight: 23 },
  text: { fontSize: 13, lineHeight: 20 },
  label: { fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  address: { fontSize: 16, lineHeight: 23 },
  key: { fontSize: 13, lineHeight: 21, padding: 12, borderRadius: 10 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  keyInput: { flex: 1, minHeight: 48, paddingHorizontal: 12 },
  paste: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  secondary: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  disabled: { opacity: 0.45 },
  actionText: { fontSize: 14, fontWeight: '500' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  error: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  privacy: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
  },
});
