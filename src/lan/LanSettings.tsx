import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppController } from '../app/AppController';
import { Button } from '../ui/Controls';
export function LanSettings({ app }: { app: AppController }) {
  const { lan, colors } = app;
  const [address, setAddress] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const disabled = lan.pending || app.chat.sending;
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.text, { color: colors.muted }]}>
        One phone runs the model; another chats over the same Wi-Fi. Keep both
        apps open. Text chat only; replies appear when complete.
      </Text>
      <Text style={[styles.text, { color: colors.muted }]}>
        Use trusted Wi-Fi. Messages and retrieved document passages go to the
        host over unencrypted local HTTP. The access key controls who can
        connect. No internet or cloud inference is used.
      </Text>
      {lan.host ? (
        <>
          <Text selectable style={{ color: colors.text }}>
            {lan.host.url}
          </Text>
          <Text style={{ color: colors.green }}>
            {lan.serving
              ? 'Generating for a connected device…'
              : 'Hosting · local chat paused'}
          </Text>
          <Button
            label={showKey ? 'Hide access key' : 'Show access key'}
            colors={colors}
            disabled={!lan.host.token}
            onPress={() => setShowKey(value => !value)}
          />
          {showKey ? (
            <Text
              selectable
              accessibilityLabel="Host access key"
              style={{ color: colors.text }}
            >
              {lan.host.token}
            </Text>
          ) : null}
          <Text style={[styles.text, { color: colors.muted }]}>
            Copy the address and key to the other phone. Switching to another
            app stops hosting and invalidates this key.
          </Text>
          <Button
            label="Share address and access key"
            icon="external"
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
          <Button
            label="Stop hosting"
            colors={colors}
            onPress={() => {
              lan.stop();
            }}
          />
        </>
      ) : lan.remote ? (
        <>
          <Text selectable style={{ color: colors.text }}>
            {lan.remote.url}
          </Text>
          <Text style={{ color: colors.green }}>
            {lan.remote.model.displayName}
          </Text>
          <Button
            label="Open LAN chat"
            icon="chat"
            colors={colors}
            onPress={() => app.setRoute('chat')}
          />
          <Button
            label="Disconnect"
            colors={colors}
            disabled={lan.pending}
            onPress={() => {
              lan.stop();
            }}
          />
        </>
      ) : (
        <>
          <Button
            label={lan.pending ? 'Connecting…' : 'Host loaded model'}
            colors={colors}
            disabled={disabled || !app.models.context}
            onPress={lan.start}
          />
          {!app.models.context ? (
            <Text style={[styles.text, { color: colors.muted }]}>
              Load a model in Models to host. Connecting to a host needs no
              model download.
            </Text>
          ) : null}
          <TextInput
            accessibilityLabel="LAN host address"
            placeholder="http://192.168.1.10:8080"
            placeholderTextColor={colors.muted}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border },
            ]}
          />
          <TextInput
            accessibilityLabel="LAN access key"
            placeholder="Access key from host"
            placeholderTextColor={colors.muted}
            value={key}
            onChangeText={setKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            maxLength={48}
            editable={!disabled}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border },
            ]}
          />
          <Button
            label="Connect to host"
            colors={colors}
            disabled={disabled || !address.trim() || !key.trim()}
            onPress={() => {
              lan.connect(address, key).then(success => {
                if (success) setKey('');
              });
            }}
          />
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  text: { fontSize: 13, lineHeight: 20 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
});
