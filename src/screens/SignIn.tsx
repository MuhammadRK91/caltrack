// src/screens/SignIn.tsx
import React, { useState, useLayoutEffect, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  useWindowDimensions,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from '../lib/supabase';
import BackButton from '../components/BackButton';

export default function SignIn() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,

      // Back button on the LEFT (same as SignUp)
      headerLeft: Platform.OS === 'android' ? () => <BackButton /> : null,

      // Nothing on the right
      headerRight: () => null,

      headerStyle: {
        backgroundColor: 'transparent',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerShadowVisible: false, // no gray bar
    });
  }, [navigation]);

  useEffect(() => {
    const sh = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hd = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      sh.remove();
      hd.remove();
    };
  }, []);

  const isWeb = Platform.OS === 'web';

  const handleSignIn = async () => {
    setError(null);

    const mail = email.trim();

    if (!mail || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setLoading(true);

      // 1) Sign in with Supabase
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: mail,
        password,
      });

      if (error) {
        throw error;
      }

      const userId = authData.user?.id;
      if (!userId) {
        throw new Error('No user id returned after sign in.');
      }

      // 2) Check if onboarding (goals row) exists
      const { data: goalsRow, error: goalsError } = await supabase
        .from('caltrack_profile_goals')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (goalsError) {
        throw goalsError;
      }

      if (!goalsRow) {
        // user has no goals row yet → send to onboarding wizard
        navigation.reset({
          index: 0,
          routes: [{ name: 'Onboarding' as never }],
        });
      } else {
        // onboarding already done → send to main app (bottom tabs)
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' as never }],
        });
      }
    } catch (e: any) {
      const raw = e?.message ?? 'Sign in failed.';

      // Supabase uses this message for "email not found" OR "wrong password"
      if (/Invalid login credentials/i.test(raw)) {
        // Check if an account exists with this email in our profiles table
        const { data: profile, error: profileError } = await supabase
          .from('caltrack_profiles')
          .select('id')
          .eq('email', mail)
          .maybeSingle();

        if (!profile && !profileError) {
          setError('No account found with this email. Please create an account.');
        } else {
          setError('Invalid email or password. Please try again.');
        }
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f9f9f9' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 110,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title only, logo removed (matches SignUp style) */}
        <Text
          style={{
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          Sign in
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            style={styles.eyeButton}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="#444"
            />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleSignIn}
          disabled={loading}
          style={[styles.button, loading && { opacity: 0.6 }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>

        {/* Forgot Password link BELOW Sign In button (aligned right) */}
        <View
          style={{ alignItems: 'flex-end', marginTop: 10, marginBottom: 16 }}
        >
          <Pressable
            onPress={() => navigation.navigate('ForgotPassword' as never)}
          >
            <Text style={{ color: '#2563EB', fontWeight: '600' }}>
              Forgot password?
            </Text>
          </Pressable>
        </View>

        {/* Footer removed: no "A product of PET" */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  eyeButton: { paddingHorizontal: 12 },
  error: { color: '#b91c1c', marginBottom: 12, textAlign: 'center' },
  button: {
    backgroundColor: '#000',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  footerText: { color: '#6B7280' },
  footerLink: { color: '#2563EB', fontWeight: '600' },
});
