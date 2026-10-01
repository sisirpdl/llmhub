import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button, Sheet } from '../ui/Controls';
import type { Colors } from '../ui/theme';
export function RenameChatSheet({
  visible,
  title,
  onClose,
  onSave,
  colors,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: (value: string) => void;
  colors: Colors;
}) {
  const input = useRef<TextInput>(null);
  const [draft, setDraft] = useState(title);
  useEffect(() => {
    if (visible) setDraft(title);
  }, [visible, title]);
  return (
    <Sheet
      visible={visible}
      title="Rename chat"
      onClose={onClose}
      colors={colors}
      onShow={() => input.current?.focus()}
    >
      <TextInput
        accessibilityLabel="Chat title"
        ref={input}
        value={draft}
        onChangeText={setDraft}
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (draft.trim()) {
            onSave(draft);
            onClose();
          }
        }}
        style={[s.input, { color: colors.text, backgroundColor: colors.input }]}
      />
      <View style={s.row}>
        <View style={s.grow}>
          <Button label="Cancel" colors={colors} onPress={onClose} />
        </View>
        <View style={s.grow}>
          <Button
            label="Save title"
            colors={colors}
            disabled={!draft.trim()}
            onPress={() => {
              onSave(draft);
              onClose();
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}
const s = StyleSheet.create({
  input: { minHeight: 52, padding: 14, borderRadius: 12, fontSize: 17 },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
});
