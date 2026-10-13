import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Controls';
import { Icon } from './Icon';
import type { Colors } from './theme';
export function DeleteChatDialog({
  title,
  colors,
  busy,
  error,
  onCancel,
  onDelete,
}: {
  title: string | null;
  colors: Colors;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={title !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View
        style={[
          styles.overlay,
          {
            backgroundColor: colors.scrim,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Dismiss delete confirmation"
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: colors.elevated, borderColor: colors.border },
          ]}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <View
              style={[styles.symbol, { backgroundColor: colors.dangerSurface }]}
            >
              <Icon name="trash" color={colors.danger} size={24} />
            </View>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              Delete chat?
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.chatName, { color: colors.text }]}
            >
              {title}
            </Text>
            <Text style={[styles.description, { color: colors.muted }]}>
              This chat and its messages will be deleted from this device. This
              cannot be undone.
            </Text>
            <Text style={[styles.description, { color: colors.muted }]}>
              Documents stay in your library.
            </Text>
            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.description, { color: colors.danger }]}
              >
                {error}
              </Text>
            ) : null}
            {busy ? (
              <View style={styles.progress}>
                <ActivityIndicator color={colors.muted} />
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ color: colors.muted }}
                >
                  Deleting…
                </Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel chat deletion"
                disabled={busy}
                onPress={onCancel}
                style={[
                  styles.cancel,
                  { borderColor: colors.border },
                  busy && styles.disabled,
                ]}
              >
                <Text style={[styles.cancelText, { color: colors.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <View style={styles.action}>
                <Button
                  label="Delete"
                  icon="trash"
                  destructive
                  colors={colors}
                  disabled={busy}
                  onPress={onDelete}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '100%',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  content: { padding: 24, gap: 12 },
  symbol: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '600' },
  chatName: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  description: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  action: { flex: 1 },
  cancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: { fontWeight: '600' },
  disabled: { opacity: 0.4 },
  progress: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
