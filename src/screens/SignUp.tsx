// src/screens/SignUp.tsx
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
import { getCalendars } from 'expo-localization';
import supabase from '../lib/supabase';
import BackButton from '../components/BackButton';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; color: string } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const RequiredLabel = ({ children }: { children: string }) => (
    <Text style={styles.fieldLabel}>
      {children}
      <Text style={styles.req}> *</Text>
    </Text>
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,
      headerLeft: Platform.OS === 'android' ? () => <BackButton /> : null,
      headerRight: () => null,
      headerStyle: {
        backgroundColor: 'transparent',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerShadowVisible: false,
    });
  }, [navigation]);

  useEffect(() => {
    const sh = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hd = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      sh.remove();
      hd.remove();
    };
  }, []);

  const isWeb = Platform.OS === 'web';

  const nameOk = fullName.trim().length > 0;
  const emailOk = EMAIL_RE.test(email.trim());
  const pwOk = password.trim().length >= 8;
  const isValid = nameOk && emailOk && pwOk;

  const handleSignUp = async () => {
    setMessage(null);

    const name = fullName.trim();
    const mail = email.trim();
    const pass = password.trim();

    if (!name) {
      setMessage({ text: 'Please enter your full name.', color: '#b91c1c' });
      return;
    }
    if (!EMAIL_RE.test(mail)) {
      setMessage({ text: 'Please enter a valid email address.', color: '#b91c1c' });
      return;
    }
    if (pass.length < 8) {
      setMessage({ text: 'Password must be at least 8 characters.', color: '#b91c1c' });
      return;
    }

    try {
      setBusy(true);

      const { data, error } = await supabase.auth.signUp({ email: mail, password: pass });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error('No user id returned from sign up.');

      // Get device timezone, e.g. "Asia/Qatar"
      const calendars = getCalendars();
const timeZone = calendars[0]?.timeZone ?? null;

console.log('SignUp timezone detected:', timeZone);

      // Create / update profile with timezone
      const { error: profErr } = await supabase
        .from('caltrack_profiles')
        .upsert(
          {
            id: userId,
            full_name: name,
            email: mail,
            time_zone: timeZone,
          },
          { onConflict: 'id', ignoreDuplicates: false }
        );

      if (profErr) throw profErr;

      setMessage({
        text: 'Account created successfully! Let’s set up your goals.',
        color: '#16a34a',
      });

      // Go to onboarding
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Onboarding' as never }],
        });
      }, 1500);
    } catch (e: any) {
      const raw = e?.message ?? 'Sign up failed.';
      const friendly = /User already registered/i.test(raw)
        ? 'This email is already registered. Try signing in instead.'
        : raw;
      setMessage({ text: friendly, color: '#b91c1c' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f9f9f9' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.containerContent,
          { paddingTop: 120, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.label, { fontSize: 20, marginBottom: 12, textAlign: 'center' }]}>
          Create account
        </Text>

        <RequiredLabel>Full name</RequiredLabel>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          returnKeyType="next"
          style={styles.input}
        />

        <RequiredLabel>Email</RequiredLabel>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          style={styles.input}
          {...(isWeb ? { autoComplete: 'email' as any } : {})}
        />
        {!emailOk && email.length > 0 && (
          <Text style={{ color: '#b91c1c', marginTop: -12, marginBottom: 12 }}>
            Enter a valid email (e.g., name@example.com)
          </Text>
        )}

        <RequiredLabel>Password</RequiredLabel>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
            {...(isWeb ? { autoComplete: 'new-password' as any } : {})}
          />
          <Pressable onPress={() => setShowPassword(prev => !prev)} style={styles.eyeButton} hitSlop={8}>
            <MaterialCommunityIcons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="#444"
            />
          </Pressable>
        </View>

        {!pwOk && password.length > 0 && (
          <Text style={{ color: '#b91c1c', marginTop: -8, marginBottom: 12 }}>
            Password must be at least 8 characters.
          </Text>
        )}

        {message && <Text style={[styles.message, { color: message.color }]}>{message.text}</Text>}

        <Pressable
          onPress={handleSignUp}
          disabled={!isValid || busy}
          style={[styles.button, (!isValid || busy) && { opacity: 0.5 }]}
          accessibilityState={{ disabled: !isValid || busy }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  containerContent: {},
  label: { marginBottom: 6, fontWeight: '700' },
  fieldLabel: { marginBottom: 6, fontWeight: '600' },
  req: { color: '#b91c1c', fontWeight: '700' },
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
  message: { marginBottom: 12, fontWeight: '600', textAlign: 'center' },
  button: {
    backgroundColor: '#000',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  footerText: { color: '#6B7280' },
  footerLink: { color: '#2563EB', fontWeight: '600' },
});
