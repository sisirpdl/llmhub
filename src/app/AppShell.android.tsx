import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppController, Route } from './AppController';
import { History, ScreenContent } from './Screens';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton } from '../ui/Controls';
const destinations: { route: Route; title: string; icon: IconName }[] = [
  { route: 'chat', title: 'Chat', icon: 'chat' },
  { route: 'models', title: 'Models', icon: 'models' },
  { route: 'settings', title: 'Settings', icon: 'settings' },
  { route: 'info', title: 'App Info', icon: 'info' },
];
export default function AndroidAppShell({ app }: { app: AppController }) {
  const insets = useSafeAreaInsets();
  const [drawer, setDrawer] = useState(false);
  const offset = useRef(new Animated.Value(-360)).current;
  const { colors, route, setRoute } = app;
  useEffect(() => {
    if (drawer)
      Animated.timing(offset, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    else offset.setValue(-360);
  }, [drawer, offset]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route !== 'chat') {
        setRoute('chat');
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [route, setRoute]);
  const title = destinations.find(item => item.route === app.route)?.title;
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar
        barStyle={app.dark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.surface}
      />
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, paddingTop: insets.top },
        ]}
      >
        <View style={styles.toolbar}>
          <IconButton
            name="menu"
            label="Open navigation menu"
            colors={colors}
            onPress={() => setDrawer(true)}
          />
          <View style={styles.heading}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              {title}
            </Text>
            {app.route === 'chat' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose active model"
                onPress={() => app.setPickerVisible(true)}
                disabled={app.chat.sending}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.subtitle, { color: colors.muted }]}
                >
                  {app.models.context
                    ? app.models.model.displayName
                    : 'No model loaded'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {app.route === 'chat' ? (
            <>
              <IconButton
                name="edit"
                label="New conversation"
                colors={colors}
                disabled={app.chat.sending || !app.chat.loaded}
                onPress={app.chat.newConversation}
              />
              <IconButton
                name="more"
                label="Open chat settings"
                colors={colors}
                onPress={() => app.setChatSettingsVisible(true)}
              />
            </>
          ) : app.route === 'models' ? (
            <IconButton
              name="sliders"
              label="Search and filter models"
              colors={colors}
              onPress={() => app.setDiscoveryVisible(true)}
            />
          ) : null}
        </View>
      </View>
      <ScreenContent app={app} />
      <Modal
        visible={drawer}
        transparent
        animationType="none"
        onRequestClose={() => setDrawer(false)}
        statusBarTranslucent
      >
        <View
          style={[styles.drawerBackdrop, { backgroundColor: colors.scrim }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            style={StyleSheet.absoluteFill}
            onPress={() => setDrawer(false)}
          />
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.drawer,
              {
                backgroundColor: colors.background,
                paddingTop: insets.top + 12,
                paddingBottom: insets.bottom,
                transform: [{ translateX: offset }],
              },
            ]}
          >
            <ScrollView contentContainerStyle={styles.drawerContent}>
              <View style={styles.drawerBrand}>
                <Text style={[styles.brand, { color: colors.accent }]}>
                  LLMHub
                </Text>
                <IconButton
                  name="close"
                  label="Close navigation menu"
                  colors={colors}
                  onPress={() => setDrawer(false)}
                />
              </View>
              {destinations.map(item => (
                <Pressable
                  key={item.route}
                  accessibilityRole="button"
                  accessibilityState={{ selected: app.route === item.route }}
                  onPress={() => {
                    app.setRoute(item.route);
                    setDrawer(false);
                  }}
                  android_ripple={{ color: colors.border }}
                  style={[
                    styles.destination,
                    app.route === item.route && {
                      backgroundColor: colors.elevated,
                    },
                  ]}
                >
                  <Icon
                    name={item.icon}
                    color={
                      app.route === item.route ? colors.accent : colors.text
                    }
                    size={26}
                  />
                  <Text
                    style={[
                      styles.destinationText,
                      {
                        color:
                          app.route === item.route
                            ? colors.accent
                            : colors.text,
                      },
                    ]}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              ))}
              <View
                style={[styles.divider, { backgroundColor: colors.border }]}
              />
              <Text style={[styles.historyLabel, { color: colors.muted }]}>
                Recent conversations
              </Text>
              <History app={app} onSelect={() => setDrawer(false)} />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {},
  toolbar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  heading: { flex: 1, paddingLeft: 14, paddingVertical: 8 },
  title: { fontSize: 20, fontWeight: '500' },
  subtitle: { fontSize: 13, marginTop: 2 },
  drawerBackdrop: { flex: 1 },
  drawer: { width: '80%', maxWidth: 360, height: '100%' },
  drawerContent: { paddingHorizontal: 16, paddingBottom: 24 },
  drawerBrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 12,
    marginBottom: 16,
  },
  brand: { fontSize: 22, fontWeight: '600' },
  destination: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  destinationText: { fontSize: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  historyLabel: { fontSize: 13, marginBottom: 12, paddingLeft: 12 },
});
