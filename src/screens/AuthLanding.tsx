import React, {
  useLayoutEffect,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  BackHandler,
  Image,
  ActivityIndicator,
} from 'react-native';
import {
  useNavigation,
  useFocusEffect,
  useIsFocused,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ResetLinkListener from '../linking/ResetLinkListener';
import ExitButton from '../components/ExitButton';
import CalTrackIcon from '../../assets/caltrack-icon.png';

import supabase from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

export default function AuthLanding() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isFocused = useIsFocused(); // 👈 NEW

  // when we have a session, we briefly show a loader while we check onboarding
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,
      headerLeft: Platform.OS === 'android' ? () => <ExitButton /> : () => null,
      headerStyle: {
        backgroundColor: 'transparent',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerShadowVisible: false,
      headerRight:
        Platform.OS === 'android'
          ? () => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginRight: 8,
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={() => navigation.navigate('FAQ')}
                  style={styles.iconCircle}
                >
                  <Text style={styles.iconCircleText}>?</Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate('Support')}
                  style={styles.iconCircle}
                >
                  <Text style={styles.iconCircleText}>💬</Text>
                </Pressable>
              </View>
            )
          : () => null,
    });
  }, [navigation]);

  // Android back → exit app on this screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (!navigation.canGoBack()) {
          BackHandler.exitApp();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation]),
  );

  // 👉 On app open: if there is already a logged-in user,
  //    decide whether to send them to Onboarding or Home
  useEffect(() => {
    // Only run this logic when AuthLanding is actually focused
    if (!isFocused) return;

    const runCheck = async () => {
      // no session → show normal AuthLanding UI
      if (!session?.user) {
        setCheckingOnboarding(false);
        return;
      }

      try {
        const userId = session.user.id;

        const { data, error } = await supabase
          .from('caltrack_profile_goals')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.log('Onboarding check error:', error);
          navigation.reset({
            index: 0,
            routes: [{ name: 'Onboarding' as never }],
          });
          return;
        }

        if (!data) {
          // user is logged in but never finished onboarding
          navigation.reset({
            index: 0,
            routes: [{ name: 'Onboarding' as never }],
          });
        } else {
          // user has goals row → straight to main app (bottom tabs)
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' as never }],
          });
        }
      } finally {
        setCheckingOnboarding(false);
      }
    };

    runCheck();
  }, [session, navigation, isFocused]);

  // While we’re checking an existing session, just show a loader
  if (checkingOnboarding && session?.user) {
    return (
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 0) }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // Normal "Sign in / Create account" landing for users with no session
  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 0) }]}>
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <Image source={CalTrackIcon} style={styles.logoImage} />
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('SignIn')}
        >
          <Text style={styles.primaryBtnText}>Sign in</Text>
        </Pressable>

        <Text style={styles.helper}>
          Don’t have an account?{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('SignUp')}>
            Create account
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: {
    alignItems: 'center',
    marginBottom: 180,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  primaryBtn: {
    backgroundColor: '#000',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    minWidth: 260,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  helper: { color: '#6B7280' },
  link: { color: '#2563EB', fontWeight: '600' },
  iconCircle: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: '#E5E7EB', // light grey (same family as Exit)
  alignItems: 'center',
  justifyContent: 'center',
},
iconCircleText: {
  color: '#374151', // dark grey text
  fontSize: 18,
  fontWeight: '700',
},
});
