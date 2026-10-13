import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import type { Colors } from './theme';
type Request = {
  id: number;
  host: symbol | null;
  title: string;
  message: string;
  buttons: AlertButton[];
  options?: AlertOptions;
  kind: 'dialog' | 'menu' | 'reader';
  phase: 'open' | 'busy' | 'closing';
  error?: string;
  afterClose?: () => void;
};
let sequence = 0;
let request: Request | null = null;
const queue: Request[] = [];
const hosts = new Map<symbol, { priority: number; order: number }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
function currentHost() {
  return (
    [...hosts].sort(
      (a, b) => b[1].priority - a[1].priority || b[1].order - a[1].order,
    )[0]?.[0] || null
  );
}
function enqueue(value: Omit<Request, 'id' | 'host' | 'phase'>) {
  const next: Request = {
    ...value,
    id: ++sequence,
    host: currentHost(),
    phase: 'open',
  };
  if (request) queue.push(next);
  else request = next;
  emit();
}
export function showDialog(
  title: string,
  message = '',
  buttons: AlertButton[] = [{ text: 'OK' }],
  options?: AlertOptions,
) {
  enqueue({ title, message, buttons, options, kind: 'dialog' });
}
export function showPassage(title: string, message: string) {
  enqueue({
    title,
    message,
    kind: 'reader',
    buttons: [{ text: 'Done' }],
    options: { cancelable: true },
  });
}
export function showActionMenu(
  options: {
    title?: string;
    options: string[];
    cancelButtonIndex: number;
    destructiveButtonIndex?: number;
  },
  callback: (index: number) => void,
) {
  enqueue({
    title: options.title || 'Choose an action',
    message: '',
    kind: 'menu',
    options: {
      cancelable: true,
      onDismiss: () => callback(options.cancelButtonIndex),
    },
    buttons: options.options.map((text, index) => ({
      text,
      style:
        index === options.cancelButtonIndex
          ? 'cancel'
          : index === options.destructiveButtonIndex
          ? 'destructive'
          : 'default',
      onPress: () => callback(index),
    })),
  });
}
function finish(id: number) {
  if (request?.id !== id || request.phase !== 'closing') return;
  const after = request.afterClose;
  request = queue.shift() || null;
  if (request) request.host = currentHost();
  emit();
  after?.();
}
function close(id: number, afterClose?: () => void) {
  if (request?.id !== id) return;
  request = { ...request, phase: 'closing', afterClose };
  emit();
  // UIKit needs the dismissal callback before another modal or native picker opens.
  if (Platform.OS !== 'ios') setTimeout(() => finish(id), 0);
}
function dismiss(id: number) {
  if (
    request?.id !== id ||
    request.phase !== 'open' ||
    request.options?.cancelable === false
  )
    return;
  close(id, request.options?.onDismiss);
}
async function choose(id: number, button: AlertButton) {
  if (request?.id !== id || request.phase !== 'open') return;
  if (request.kind === 'menu' || button.style === 'cancel') {
    close(id, () => button.onPress?.());
    return;
  }
  request = { ...request, phase: 'busy' };
  emit();
  try {
    await button.onPress?.();
    close(id);
  } catch (error) {
    if (request?.id === id) {
      request = {
        ...request,
        phase: 'open',
        error:
          error instanceof Error
            ? error.message
            : 'Unable to complete this action. Please try again.',
      };
      emit();
    }
  }
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => request;
const menuIcon = (label = ''): IconName | undefined =>
  ((
    {
      Camera: 'camera',
      Gallery: 'image',
      Conversations: 'clock',
      Models: 'models',
      Documents: 'document',
      'Nearby sharing': 'connected',
      Settings: 'settings',
      'Report an issue': 'issue',
      'Export chat': 'external',
      'Ask your documents': 'document',
      'Delete chat': 'trash',
    } as Record<string, IconName>
  )[label]);
export function PopupHost({
  colors,
  active = true,
  priority = 0,
}: {
  colors: Colors;
  active?: boolean;
  priority?: number;
}) {
  const identity = useRef(Symbol('popup-host')).current;
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!active) return;
    hosts.set(identity, { priority, order: ++sequence });
    if (request && !request.host) {
      request = { ...request, host: identity };
      emit();
    }
    return () => {
      hosts.delete(identity);
      if (request?.host === identity) {
        if (request.phase === 'closing') finish(request.id);
        else {
          const cancel = request.buttons.find(
            button => button.style === 'cancel',
          );
          const pending = cancel?.onPress || request.options?.onDismiss;
          request = queue.shift() || null;
          if (request) request.host = currentHost();
          emit();
          pending?.();
        }
      }
    };
  }, [active, identity, priority]);
  const own = value?.host === identity ? value : null;
  const open = Boolean(own && own.phase !== 'closing');
  const busy = own?.phase === 'busy';
  const menu = own?.kind === 'menu';
  const reader = own?.kind === 'reader';
  const buttons = menu
    ? [
        ...(own?.buttons.filter(button => button.style !== 'cancel') || []),
        ...(own?.buttons.filter(button => button.style === 'cancel') || []),
      ]
    : own?.buttons || [];
  const destructive = own?.buttons.some(
    button => button.style === 'destructive',
  );
  return (
    <Modal
      visible={open}
      transparent
      statusBarTranslucent
      animationType={menu || reader ? 'slide' : 'fade'}
      onRequestClose={() => {
        if (own) dismiss(own.id);
      }}
      onDismiss={() => {
        if (own) finish(own.id);
      }}
    >
      <View
        style={[
          styles.overlay,
          (menu || reader) && styles.bottom,
          {
            backgroundColor: colors.scrim,
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${own?.title || 'popup'}`}
          disabled={busy}
          onPress={() => {
            if (own) dismiss(own.id);
          }}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            (menu || reader) && styles.menu,
            { backgroundColor: colors.elevated, borderColor: colors.border },
          ]}
        >
          {reader ? (
            <View style={styles.readerHeader}>
              <Text
                accessibilityRole="header"
                numberOfLines={2}
                style={[styles.readerTitle, { color: colors.text }]}
              >
                {own?.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close passage"
                disabled={busy}
                onPress={() => {
                  if (own) dismiss(own.id);
                }}
                style={styles.closeButton}
              >
                <Icon name="close" color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {!menu && !reader ? (
              <View
                style={[
                  styles.symbol,
                  {
                    backgroundColor: destructive
                      ? colors.dangerSurface
                      : colors.input,
                  },
                ]}
              >
                <Icon
                  name={destructive ? 'trash' : 'info'}
                  color={destructive ? colors.danger : colors.accent}
                />
              </View>
            ) : null}
            {!reader ? (
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: colors.text }]}
              >
                {own?.title}
              </Text>
            ) : null}
            {own?.message ? (
              <Text
                selectable
                style={[styles.message, { color: colors.muted }]}
              >
                {own.message}
              </Text>
            ) : null}
            {own?.error ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.message, { color: colors.danger }]}
              >
                {own.error}
              </Text>
            ) : null}
            {busy ? <ActivityIndicator color={colors.muted} /> : null}
            <View style={[styles.actions, menu && styles.vertical]}>
              {buttons.map((button, index) => {
                const color =
                  button.style === 'destructive'
                    ? colors.danger
                    : !menu && button.style !== 'cancel'
                    ? colors.accent
                    : colors.text;
                const icon = menu ? menuIcon(button.text) : undefined;
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={button.text || 'OK'}
                    disabled={busy}
                    onPress={() => {
                      if (own) return choose(own.id, button);
                    }}
                    style={[
                      styles.button,
                      !menu && styles.grow,
                      menu && button.style !== 'cancel' && styles.menuAction,
                      {
                        borderColor:
                          button.style === 'destructive'
                            ? colors.danger
                            : colors.border,
                        backgroundColor:
                          button.style === 'destructive'
                            ? colors.dangerSurface
                            : colors.input,
                      },
                      busy && styles.disabled,
                    ]}
                  >
                    {icon ? <Icon name={icon} color={color} size={20} /> : null}
                    <Text style={[styles.buttonText, { color }]}>
                      {button.text || 'OK'}
                    </Text>
                  </Pressable>
                );
              })}
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
  bottom: { justifyContent: 'flex-end' },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menu: { maxWidth: 550 },
  content: { padding: 24, gap: 16 },
  symbol: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '600' },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    paddingRight: 12,
    paddingTop: 12,
  },
  readerTitle: { flex: 1, fontSize: 20, fontWeight: '600' },
  closeButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: { fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 12 },
  vertical: { flexDirection: 'column' },
  grow: { flex: 1 },
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  menuAction: { justifyContent: 'flex-start' },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  disabled: { opacity: 0.4 },
});
