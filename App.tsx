import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import AppShell from './src/app/AppShell';
import { useAppController } from './src/app/AppController';
import { Onboarding } from './src/app/Screens';
function AppContent() {
  const app = useAppController();
  const insets = useSafeAreaInsets();
  if (app.onboarding === null)
    return (
      <View
        style={[styles.loading, { backgroundColor: app.colors.background }]}
      >
        <ActivityIndicator color={app.colors.accent} />
      </View>
    );
  if (!app.onboarding)
    return (
      <View
        style={[
          styles.fill,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            backgroundColor: app.colors.background,
          },
        ]}
      >
        <StatusBar
          barStyle={app.dark ? 'light-content' : 'dark-content'}
          backgroundColor={app.colors.background}
        />
        <Onboarding colors={app.colors} onComplete={app.completeOnboarding} />
      </View>
    );
  return <AppShell app={app} />;
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
