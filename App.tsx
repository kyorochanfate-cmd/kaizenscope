import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initDatabase } from './src/db/database';
import { RootStackParamList } from './src/navigation/types';
import { colors } from './src/theme';
import { initAds } from './src/utils/ads';
import { hasSeenOnboarding } from './src/utils/appState';
import { captureException, initTelemetry } from './src/utils/telemetry';
import AnalysisScreen from './src/screens/AnalysisScreen';
import ChartsScreen from './src/screens/ChartsScreen';
import GanttScreen from './src/screens/GanttScreen';
import ImprovementsScreen from './src/screens/ImprovementsScreen';
import NewSessionScreen from './src/screens/NewSessionScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SessionListScreen from './src/screens/SessionListScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import YamazumiScreen from './src/screens/YamazumiScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    initTelemetry();
    // AdMob 初期化はバックグラウンドで走らせて DB 初期化と並列化
    initAds();
    initDatabase()
      .then(async () => {
        // DB 初期化後にオンボーディング閲覧フラグを読む
        try {
          const seen = await hasSeenOnboarding();
          setNeedsOnboarding(!seen);
        } catch (e) {
          captureException(e, { context: 'hasSeenOnboarding' });
        }
        setReady(true);
      })
      .catch((e) => {
        console.error('DB init failed', e);
        captureException(e, { context: 'initDatabase' });
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (needsOnboarding) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary>
          <OnboardingScreen onDone={() => setNeedsOnboarding(false)} />
        </ErrorBoundary>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            // ヘッダーは solid な深い indigo (LinearGradient だと
            // android で content が header の下に潜り込む不具合があるため避ける)
            headerStyle: { backgroundColor: '#1e1b4b' },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              fontWeight: '800',
              fontSize: 17,
              color: '#ffffff',
            },
            headerShadowVisible: true,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen
            name="SessionList"
            component={SessionListScreen}
            options={{ title: 'カイゼンスコープ' }}
          />
          <Stack.Screen
            name="NewSession"
            component={NewSessionScreen}
            options={{ title: '新規セッション' }}
          />
          <Stack.Screen
            name="Analysis"
            component={AnalysisScreen}
            options={{ title: '作業分析' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: '設定' }}
          />
          <Stack.Screen
            name="Charts"
            component={ChartsScreen}
            options={{ title: '分析' }}
          />
          <Stack.Screen
            name="Gantt"
            component={GanttScreen}
            options={{ title: 'ガントチャート' }}
          />
          <Stack.Screen
            name="Yamazumi"
            component={YamazumiScreen}
            options={{ title: '山積み表' }}
          />
          <Stack.Screen
            name="Improvements"
            component={ImprovementsScreen}
            options={{ title: '改善ポイント' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      </ErrorBoundary>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}
