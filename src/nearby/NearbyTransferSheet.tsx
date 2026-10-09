import { PairingQRCode } from './PairingQRCode';
import { encodePairing } from './pairing';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Sheet } from '../ui/Controls';
import { formatBytes, type Colors } from '../ui/theme';
import type { NearbyTransfer } from './useNearbyTransfer';
import { catalogMatch, totalBytes } from './protocol';
import { SUPPORTED_MODELS } from '../models/modelCatalog';
import { SUPPORTED_VISION_MODELS } from '../models/visionCatalog';
import type { ModelController } from '../app/useModelController';
const labels = {
  idle: 'Ready to pair',
  preparing: 'Checking model files…',
  sharing: 'Ready to send',
  connecting: 'Checking sender…',
  preview: 'Review model',
  receiving: 'Receiving model…',
  verifying: 'Verifying complete files…',
  paused: 'Transfer paused',
  done: 'Transfer complete',
  stopping: 'Pausing…',
  error: 'Transfer interrupted',
};
export function NearbyTransferSheet({
  transfer,
  colors,
  models,
}: {
  transfer: NearbyTransfer;
  colors: Colors;
  models: ModelController;
}) {
  const { state, mode } = transfer,
    offer = state.offer;
  const known =
    offer &&
    catalogMatch(offer, [...SUPPORTED_MODELS, ...SUPPORTED_VISION_MODELS]);
  const field = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.elevated,
      borderColor: colors.border,
    },
  ];
  return (
    <Sheet
      visible={transfer.visible}
      onClose={transfer.close}
      title="Nearby model transfer"
      colors={colors}
    >
      <View style={styles.content}>
        <Text style={{ color: colors.muted }}>
          Connect both phones to the same Wi-Fi. Keep both apps open. Model
          files are encrypted during transfer; chats and tokens stay on your
          phone.
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.heading, { color: colors.text }]}
        >
          {labels[state.stage]}
        </Text>
        {state.error ? (
          <Text style={{ color: colors.danger }}>{state.error}</Text>
        ) : null}
        {transfer.discoveryError ? (
          <Text style={{ color: colors.muted }}>{transfer.discoveryError}</Text>
        ) : null}
        {offer ? (
          <View style={[styles.summary, { borderColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.text }]}>
              {offer.name}
            </Text>
            <Text style={{ color: colors.muted }}>
              {formatBytes(totalBytes(offer))}
              {offer.artifacts.length === 2
                ? ' · Includes vision projector'
                : ''}
            </Text>
            <Text style={{ color: colors.muted }}>
              License: {known?.license || offer.license}. Only share models you
              have permission to redistribute.
            </Text>
            <Text style={{ color: colors.muted }}>
              {known
                ? 'Matches the bundled catalog’s file hashes.'
                : 'Sender’s file hashes verify the transfer. Publisher authenticity is unverified.'}
            </Text>
            {mode === 'receive' ? (
              <Text style={{ color: colors.muted }}>
                RAM compatibility is checked when loading. File size alone
                cannot establish that this model fits your phone.
              </Text>
            ) : null}
            {mode === 'receive' && models.freeSpace !== null ? (
              <Text style={{ color: colors.muted }}>
                {formatBytes(models.freeSpace)} free storage
              </Text>
            ) : null}
            <Text
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.floor((100 * state.bytes) / totalBytes(offer)),
              }}
              style={{ color: colors.accent }}
            >
              {formatBytes(state.bytes)} / {formatBytes(totalBytes(offer))}
            </Text>
          </View>
        ) : null}
        {mode === 'send' && state.host && state.secret ? (
          <>
            <View style={styles.qr}>
              <PairingQRCode
                value={encodePairing(state.host.url, state.secret)}
              />
            </View>
            <Text style={{ color: colors.muted }}>
              Scan this code on the receiving phone. It contains the private
              pairing key; keep it visible only to the intended receiver.
            </Text>
            <Text selectable style={{ color: colors.text }}>
              {state.host.url}
            </Text>
            <Text style={{ color: colors.muted }}>
              Enter this address and pairing key on the other phone. Anyone with
              the key can receive this model while sharing is open.
            </Text>
            {transfer.reveal ? (
              <Text selectable style={{ color: colors.text }}>
                {state.secret}
              </Text>
            ) : null}
            <Button
              label={transfer.reveal ? 'Hide pairing key' : 'Show pairing key'}
              icon={transfer.reveal ? 'eyeOff' : 'eye'}
              colors={colors}
              onPress={() => transfer.setReveal(!transfer.reveal)}
            />
          </>
        ) : null}
        {mode === 'receive' && !transfer.working && state.stage !== 'done' ? (
          <>
            <Button
              label={transfer.scanning ? 'Scanning…' : 'Scan to connect'}
              icon="qr"
              colors={colors}
              onPress={transfer.scan}
              disabled={transfer.scanning}
            />
            {transfer.scanError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.danger }}
              >
                {transfer.scanError}
              </Text>
            ) : null}
            {transfer.peers.map(peer => (
              <Button
                key={peer.id}
                label={peer.name}
                icon="connected"
                colors={colors}
                onPress={() => transfer.setAddress(peer.url)}
                disabled={transfer.scanning}
              />
            ))}
            {!transfer.peers.length ? (
              <Text style={{ color: colors.muted }}>
                Open Share model on the sending phone. You can also enter its
                address manually.
              </Text>
            ) : null}
            <TextInput
              accessibilityLabel="Sender address"
              placeholder="http://192.168.1.10:8081"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!transfer.scanning}
              value={transfer.address}
              onChangeText={transfer.setAddress}
              style={field}
            />
            <TextInput
              accessibilityLabel="Pairing key"
              placeholder="48-character pairing key"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
              editable={!transfer.scanning}
              value={transfer.key}
              onChangeText={transfer.setKey}
              style={field}
            />
            <Button
              label="Review model"
              icon="connected"
              colors={colors}
              onPress={transfer.connect}
              disabled={
                transfer.scanning ||
                !transfer.address.trim() ||
                !transfer.key.trim()
              }
            />
            {state.stage === 'preview' ? (
              <Button
                label={state.bytes ? 'Accept and resume' : 'Accept and receive'}
                icon="download"
                colors={colors}
                onPress={transfer.receive}
                disabled={transfer.scanning}
              />
            ) : null}
          </>
        ) : null}
        {transfer.busy && state.stage !== 'stopping' ? (
          <Button
            label={mode === 'send' ? 'Stop sharing' : 'Pause transfer'}
            icon="stop"
            colors={colors}
            onPress={transfer.pause}
          />
        ) : null}
        {mode === 'receive' &&
        !transfer.busy &&
        !transfer.working &&
        state.stage !== 'done' ? (
          <Button
            label="Delete partial transfer"
            icon="trash"
            colors={colors}
            onPress={transfer.discard}
            disabled={transfer.scanning}
          />
        ) : null}
        {state.stage === 'paused' ? (
          <Text style={{ color: colors.muted }}>
            Complete chunks are kept. Pair again with the same model to resume.
            A sender that restarted sharing has a new key.
          </Text>
        ) : null}
        {state.stage === 'done' ? (
          <Text style={{ color: colors.active }}>
            {mode === 'receive'
              ? 'Model added to Your models. Load it when you’re ready.'
              : 'The receiver verified and imported the model.'}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
const styles = StyleSheet.create({
  content: { gap: 14 },
  qr: { alignItems: 'center' },
  heading: { fontSize: 17, fontWeight: '600' },
  summary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
  },
});
