import { Pressable, StyleSheet, Text, View } from 'react-native';
import { modes, tasks, type HubNavigationProps } from './HubNavigation.types';
export default function HubNavigation({
  mode,
  task,
  onMode,
  onTask,
  colors,
}: HubNavigationProps) {
  return (
    <View style={s.container}>
      <View style={[s.segment, { backgroundColor: colors.input }]}>
        {modes.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: mode === value }}
            onPress={() => onMode(value)}
            style={[
              s.item,
              {
                backgroundColor:
                  mode === value ? colors.elevated : colors.input,
              },
            ]}
          >
            <Text
              style={[
                s.text,
                { color: mode === value ? colors.text : colors.muted },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.segment, { backgroundColor: colors.input }]}>
        {tasks.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Show ${label.toLowerCase()} models`}
            accessibilityState={{ selected: task === value }}
            onPress={() => onTask(value)}
            style={[
              s.item,
              {
                backgroundColor:
                  task === value ? colors.elevated : colors.input,
              },
            ]}
          >
            <Text
              style={[
                s.text,
                { color: task === value ? colors.accent : colors.muted },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 10, paddingVertical: 12 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  item: {
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9,
  },
  text: { fontSize: 12, fontWeight: '600' },
});
