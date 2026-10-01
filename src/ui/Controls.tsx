import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import type { Colors } from './theme';
export function IconButton({
  name,
  label,
  onPress,
  colors,
  color,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  colors: Colors;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.border, borderless: true }}
      style={[s.iconButton, disabled && s.disabled]}
    >
      <Icon name={name} color={color || colors.text} />
    </Pressable>
  );
}
export function Button({
  label,
  icon,
  onPress,
  colors,
  disabled = false,
  green = false,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  colors: Colors;
  disabled?: boolean;
  green?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.border }}
      style={[
        s.button,
        {
          backgroundColor: green ? colors.greenSurface : colors.primary,
          borderColor: green ? colors.green : colors.primary,
        },
        disabled && s.disabled,
      ]}
    >
      {icon ? (
        <Icon
          name={icon}
          color={green ? colors.green : colors.onPrimary}
          size={20}
        />
      ) : null}
      <Text
        style={[
          s.buttonText,
          { color: green ? colors.green : colors.onPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Sheet({
  visible,
  onClose,
  title,
  colors,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  colors: Colors;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[s.modal, { backgroundColor: colors.scrim }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={s.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={[s.handle, { backgroundColor: colors.muted }]} />
          <View style={s.sheetHeader}>
            <Text
              accessibilityRole="header"
              style={[s.sheetTitle, { color: colors.text }]}
            >
              {title}
            </Text>
            <IconButton
              name="close"
              label={`Close ${title}`}
              onPress={onClose}
              colors={colors}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.sheetContent}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export const s = StyleSheet.create({
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  disabled: { opacity: 0.4 },
  button: {
    minHeight: 48,
    borderRadius: Platform.OS === 'ios' ? 14 : 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonText: { fontSize: 16, fontWeight: '500' },
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: {
    height: 4,
    width: 32,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 12,
  },
  sheetTitle: { fontSize: 21, fontWeight: '500' },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 12, gap: 16 },
});
