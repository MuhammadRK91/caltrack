// App.tsx
import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  NavigationContainer,
  createNavigationContainerRef,
  useFocusEffect,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AuthLanding from './src/screens/AuthLanding';
import SignIn from './src/screens/SignIn';
import SignUp from './src/screens/SignUp';
import Home from './src/screens/Home';
import ForgotPassword from './src/screens/ForgotPassword';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import Support from './src/screens/Support';
import FAQ from './src/screens/FAQ';

import OnboardingWizard from './src/screens/OnboardingWizard';
import PersonalDetails from './src/screens/PersonalDetails';
import Progress from './src/screens/Progress';
import DietPlan from './src/screens/DietPlan';

import MealAnalysisScreen from './src/screens/MealAnalysisScreen';

import { AuthProvider, useAuth } from './src/providers/AuthProvider';
import type { RootStackParamList, RootTabParamList } from './src/types/navigation';

import BrandedLoader from './src/components/BrandedLoader';
import SubscribePopup from './src/components/SubscribePopup';
import ProWelcomeModal from './src/components/ProWelcomeModal';
import ProStatusBadge from './src/components/ProStatusBadge';
import { initIap, endIap } from './src/lib/iap';
import ResetLinkListener from './src/linking/ResetLinkListener';
import supabase from './src/lib/supabase';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type SubscriptionRow = {
  user_id: string;
  provider: string;
  plan_id: string | null; // caltrack_pro / caltrack_yearly
  entitlement: string;
  status: 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type PlanType = 'free' | 'monthly' | 'yearly';

function TabIconWithBadge({
  base,
  size,
  focused,
  showProBadge,
  activeColor,
  inactiveColor,
  glowColor,
}: {
  base: keyof typeof Ionicons.glyphMap;
  size: number;
  focused: boolean;
  showProBadge: boolean;
  activeColor: string;
  inactiveColor: string;
  glowColor: string;
}) {
  const tint = focused ? activeColor : inactiveColor;

  const containerStyle = [
    styles.tabIconBase,
    focused && [
      styles.tabIconBaseActive,
      {
        backgroundColor: glowColor,
        shadowColor: activeColor,
      },
    ],
  ];

  return (
    <View style={containerStyle}>
      <Ionicons name={base} color={tint} size={size} />
      {showProBadge && (
        <View pointerEvents="none" style={styles.tabProBadge}>
          <ProStatusBadge />
        </View>
      )}
    </View>
  );
}

function MainTabs() {
  const {
    session,
    isSubscribed,
    subLoading,
    refreshSubscription,
    subscriptionKey,
    proWelcomeShownFor,
    markProWelcomeShown,
  } = useAuth();

  const insets = useSafeAreaInsets();

  const [subPopupOpen, setSubPopupOpen] = useState(false);
  const [proWelcomeOpen, setProWelcomeOpen] = useState(false);

  // ----- plan type (free / monthly / yearly) for coloring -----
  const [planType, setPlanType] = useState<PlanType>('free');

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from<SubscriptionRow>('caltrack_subscriptions')
          .select('plan_id,status')
          .eq('user_id', userId)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data || data.status !== 'active') {
          setPlanType('free');
          return;
        }

        if (data.plan_id === 'caltrack_yearly') {
          setPlanType('yearly');
        } else if (data.plan_id === 'caltrack_pro') {
          setPlanType('monthly');
        } else {
          setPlanType('monthly');
        }
      } catch {
        if (!cancelled) setPlanType('free');
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, subscriptionKey]);

  // gate welcome logic until we completed at least 1 refresh
  const [subChecked, setSubChecked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        try {
          await refreshSubscription();
        } finally {
          if (alive) setSubChecked(true);
        }
      })();

      return () => {
        alive = false;
      };
    }, [refreshSubscription])
  );

  // Show only once per token, saved in DB
  useEffect(() => {
    if (!subChecked) return;
    if (subLoading) return;
    if (!isSubscribed) return;
    if (!subscriptionKey) return;
    if (proWelcomeShownFor === subscriptionKey) return;

    setProWelcomeOpen(true);
    markProWelcomeShown(subscriptionKey);
  }, [
    subChecked,
    subLoading,
    isSubscribed,
    subscriptionKey,
    proWelcomeShownFor,
    markProWelcomeShown,
  ]);

  // COLORS:
  // monthly -> #10B981
  // yearly  -> #0EA5E9
  // free    -> #111827

  const activeColor =
    planType === 'yearly'
      ? '#0EA5E9'
      : planType === 'monthly'
      ? '#10B981'
      : '#111827';

  const inactiveColor = '#9CA3AF';

  const glowColor =
    planType === 'yearly'
      ? '#E0F2FE'
      : planType === 'monthly'
      ? '#D1FAE5'
      : '#E5E7EB';

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarLabelStyle: {
            fontSize: 11,
            marginBottom: 6,
          },

          // FIX: push the bar up using insets, but keep size compact
          tabBarStyle: {
            position: 'absolute',
            left: 16,
            right: 16,

            // push above Android/iOS system bottom area
            bottom: insets.bottom + 4,

            // keep pill compact (no extra height/padding from inset)
            height: 64,

            borderRadius: 999,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 0,
            shadowColor: '#000000',
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          },

          tabBarItemStyle: {
            paddingTop: 4,
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={Home}
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: ({ focused, size }) => (
              <TabIconWithBadge
                base="home"
                size={size}
                focused={focused}
                showProBadge={false}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                glowColor={glowColor}
              />
            ),
          }}
        />

        <Tab.Screen
          name="DietPlan"
          component={DietPlan}
          listeners={{
            tabPress: (e) => {
              if (!isSubscribed) {
                e.preventDefault();
                setSubPopupOpen(true);
              }
            },
          }}
          options={{
            tabBarLabel: 'Diet Plan',
            tabBarIcon: ({ focused, size }) => (
              <TabIconWithBadge
                base="fast-food"
                size={size}
                focused={focused}
                showProBadge={!isSubscribed}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                glowColor={glowColor}
              />
            ),
          }}
        />

        <Tab.Screen
          name="Progress"
          component={Progress}
          listeners={{
            tabPress: (e) => {
              if (!isSubscribed) {
                e.preventDefault();
                setSubPopupOpen(true);
              }
            },
          }}
          options={{
            tabBarLabel: 'Progress',
            tabBarIcon: ({ focused, size }) => (
              <TabIconWithBadge
                base="stats-chart"
                size={size}
                focused={focused}
                showProBadge={!isSubscribed}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                glowColor={glowColor}
              />
            ),
          }}
        />

        <Tab.Screen
          name="Profile"
          component={PersonalDetails}
          options={{
            tabBarLabel: 'Profile',
            tabBarIcon: ({ focused, size }) => (
              <TabIconWithBadge
                base="person"
                size={size}
                focused={focused}
                showProBadge={!!isSubscribed}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                glowColor={glowColor}
              />
            ),
          }}
        />
      </Tab.Navigator>

      <SubscribePopup
        visible={subPopupOpen}
        onClose={() => setSubPopupOpen(false)}
      />
      <ProWelcomeModal
        visible={proWelcomeOpen}
        onClose={() => setProWelcomeOpen(false)}
      />
    </>
  );
}

function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Auth"
      screenOptions={({ navigation }) => ({
        headerTitle: 'CalTrack',
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: true,
        headerLeft: () => (
          <Pressable
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else if (Platform.OS === 'web' && window.history.length > 1)
                window.history.back();
              else navigation.navigate('Auth' as never);
            }}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Text style={{ color: '#2563EB', fontWeight: '700' }}>Back</Text>
          </Pressable>
        ),
      })}
    >
      <Stack.Screen
        name="Auth"
        component={AuthLanding}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SignIn"
        component={SignIn}
        options={{ title: 'Sign in', headerRight: () => null }}
      />
      <Stack.Screen
        name="SignUp"
        component={SignUp}
        options={{ title: 'Create account', headerRight: () => null }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPassword}
        options={{ title: 'Forgot password', headerRight: () => null }}
      />

      <Stack.Screen
        name="Onboarding"
        component={OnboardingWizard}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PersonalDetails"
        component={PersonalDetails}
        options={{ title: 'Personal Details', headerRight: () => null }}
      />

      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="MealAnalysis"
        component={MealAnalysisScreen}
        options={{ title: 'Meal analysis', headerRight: () => null }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ title: 'Set new password', headerRight: () => null }}
      />

      <Stack.Screen
        name="Support"
        component={Support}
        options={{ title: 'Support', headerRight: () => null }}
      />
      <Stack.Screen
        name="FAQ"
        component={FAQ}
        options={{ title: 'FAQ', headerRight: () => null }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [navBusy, setNavBusy] = useState(false);
  const navBusyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bootBilling = async () => {
    try {
      await initIap();
    } catch {}
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        // @ts-ignore
        LottieView.enableMergePathsAndroidForKitKatAndAbove(true);
      } catch {}
    }
  }, []);

  useEffect(() => {
    bootBilling();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') bootBilling();
    });
    return () => {
      try {
        sub.remove();
      } catch {}
      endIap();
    };
  }, []);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    return (
      <View style={styles.bootWrap}>
        <BrandedLoader size={52} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <NavigationContainer
        ref={navigationRef}
        linking={{
          prefixes: ['caltrack://'],
          config: { screens: { ResetPassword: 'reset' } },
        }}
        onStateChange={() => {
          if (navBusyTimer.current) clearTimeout(navBusyTimer.current);
          setNavBusy(true);
          navBusyTimer.current = setTimeout(() => setNavBusy(false), 380);
        }}
      >
        <AppNavigator />
        <ResetLinkListener navigationRef={navigationRef} />

        {navBusy && (
          <View pointerEvents="none" style={styles.loaderOverlay}>
            <BrandedLoader size={52} />
          </View>
        )}
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  bootWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loaderOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBase: {
    minWidth: 44,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBaseActive: {
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  tabProBadge: {
    position: 'absolute',
    top: -8,
    right: -10,
  },
});
