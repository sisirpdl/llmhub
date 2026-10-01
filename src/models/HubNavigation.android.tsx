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
      <View style={[s.tabs, { borderColor: colors.border }]}>
        {modes.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: mode === value }}
            onPress={() => onMode(value)}
            android_ripple={{ color: colors.border }}
            style={[
              s.tab,
              {
                borderBottomColor:
                  mode === value ? colors.accent : colors.surface,
              },
            ]}
          >
            <Text
              style={[
                s.tabText,
                { color: mode === value ? colors.accent : colors.muted },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={s.types}>
        {tasks.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Show ${label.toLowerCase()} models`}
            accessibilityState={{ selected: task === value }}
            onPress={() => onTask(value)}
            style={[
              s.type,
              {
                backgroundColor:
                  task === value ? colors.elevated : colors.surface,
                borderColor: task === value ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={{ color: task === value ? colors.accent : colors.muted }}
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
  container: { gap: 12, paddingTop: 8 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 12, fontWeight: '600' },
  types: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  type: {
    minHeight: 40,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
  },
});
