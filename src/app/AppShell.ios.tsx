import { modelLabel } from '../models/modelLabels';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppController, Route } from './AppController';
import { ScreenContent } from './Screens';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton } from '../ui/Controls';
const tabs: { route: Route; label: string; icon: IconName }[] = [
  { route: 'chat', label: 'Chat', icon: 'chat' },
  { route: 'models', label: 'Models', icon: 'models' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
  { route: 'info', label: 'App Info', icon: 'info' },
];
export default function IOSAppShell({ app }: { app: AppController }) {
  const insets = useSafeAreaInsets();
  const { colors } = app;
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <StatusBar barStyle={app.dark ? 'light-content' : 'dark-content'} />
      <View
        style={[
          styles.navigation,
          { borderColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        {app.route === 'chat' ? (
          <IconButton
            name="clock"
            label="Show conversations"
            colors={colors}
            color={colors.accent}
            onPress={() => app.setHistoryVisible(true)}
          />
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={styles.heading}>
          {app.route === 'chat' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rename chat topic"
              disabled={app.chat.sending || !app.chat.loaded}
              onPress={() => app.setRenameVisible(true)}
              style={styles.titleRow}
            >
              <Text
                numberOfLines={1}
                style={[styles.title, styles.chatTitle, { color: colors.text }]}
              >
                {app.chat.title}
              </Text>
              <Icon name="edit" color={colors.muted} size={14} />
            </Pressable>
          ) : (
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              {tabs.find(tab => tab.route === app.route)?.label}
            </Text>
          )}
          {app.route === 'chat' ? (
            <Text
              numberOfLines={1}
              style={[styles.subtitle, { color: colors.muted }]}
            >
              {app.models.context
                ? modelLabel(app.models.model)
                : 'No model loaded'}
            </Text>
          ) : null}
        </View>
        {app.route === 'models' ? (
          <IconButton
            name="plus"
            label="Find more models"
            colors={colors}
            color={colors.accent}
            onPress={() => app.setDiscoveryVisible(true)}
          />
        ) : app.route === 'chat' ? (
          <>
            <IconButton
              name="edit"
              label="New conversation"
              colors={colors}
              color={colors.accent}
              disabled={app.chat.sending || !app.chat.loaded}
              onPress={app.chat.newConversation}
            />
            <IconButton
              name="sliders"
              label="Open chat settings"
              colors={colors}
              color={colors.accent}
              onPress={() => app.setChatSettingsVisible(true)}
            />
          </>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      {app.route !== 'chat' ? (
        <Text
          accessibilityRole="header"
          style={[styles.largeTitle, { color: colors.text }]}
        >
          {tabs.find(tab => tab.route === app.route)?.label}
        </Text>
      ) : null}
      <ScreenContent app={app} />
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        {tabs.map(tab => (
          <Pressable
            key={tab.route}
            accessibilityRole="tab"
            accessibilityState={{ selected: app.route === tab.route }}
            accessibilityLabel={tab.label}
            onPress={() => app.setRoute(tab.route)}
            style={styles.tab}
          >
            <Icon
              name={tab.icon}
              size={24}
              color={app.route === tab.route ? colors.accent : colors.muted}
            />
            <Text
              style={[
                styles.tabLabel,
                {
                  color: app.route === tab.route ? colors.accent : colors.muted,
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
  },
  chatTitle: { flexShrink: 1 },
  root: { flex: 1 },
  navigation: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spacer: { width: 48 },
  heading: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 3, textAlign: 'center' },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 10, fontWeight: '500' },
});
