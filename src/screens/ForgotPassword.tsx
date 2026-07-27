// src/screens/ForgotPassword.tsx
import React, { useLayoutEffect, useState, useEffect } from 'react';
import {
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '../components/BackButton';
import { requireEnv } from '../lib/env';

// Supabase Edge Function that sends the reset mail.
// Shape: https://<project-ref>.supabase.co/functions/v1/send-reset-caltrack
const FORGOT_PASSWORD_FN_URL = requireEnv(
  'EXPO_PUBLIC_FORGOT_PASSWORD_FN_URL',
  process.env.EXPO_PUBLIC_FORGOT_PASSWORD_FN_URL
);

// Shared secret checked by the Edge Function. Must match the value set in the
// Supabase project's function environment variables.
const FUNCTION_SECRET_KEY = requireEnv(
  'EXPO_PUBLIC_FUNCTION_SECRET_KEY',
  process.env.EXPO_PUBLIC_FUNCTION_SECRET_KEY
);

// This MUST be in Supabase Auth > URL Configuration > Redirect URLs
// You already added: caltrack://reset
const RESET_REDIRECT_URL = 'caltrack://reset';

export default function ForgotPassword() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,

      // Back button on the LEFT (same as SignIn)
      headerLeft: Platform.OS === 'android' ? () => <BackButton /> : null,

      // Nothing on the right
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

  const isEmail = (str: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

  const handleSend = async () => {
    setError(null);

    const mail = email.trim();
    if (!mail) {
      setError('Email is required.');
      return;
    }
    if (!isEmail(mail)) {
      setError('Please enter a valid email.');
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(FORGOT_PASSWORD_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': FUNCTION_SECRET_KEY, // shared secret
        },
        body: JSON.stringify({
          email: mail,
          resetLink: RESET_REDIRECT_URL, // must match allowed redirect(s) in function
        }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // ignore JSON parse errors
      }

      // For security, we still show "sent" even if account doesn't exist,
      // but we DO show real errors if the function call itself fails.
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || json?.message || `Failed (status ${res.status})`);
      }

      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send password reset email.');
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
          paddingTop: 110, // same as SignIn
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title only (no logo) */}
        <Text style={styles.title}>Reset password</Text>

        <Text style={styles.helper}>
          Enter your account email and we’ll send you a reset link.
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (error) setError(null);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="done"
          style={styles.input}
          placeholder="you@example.com"
          editable={!sent && !loading}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {sent ? (
          <Text style={styles.sentText}>
            If an account exists for {email.trim() || 'this email'}, a reset link has been sent.
          </Text>
        ) : null}

        <Pressable
          onPress={handleSend}
          disabled={loading || sent}
          style={[styles.button, (loading || sent) && { opacity: 0.6 }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{sent ? 'Link Sent' : 'Send Reset Link'}</Text>
          )}
        </Pressable>

        {/* No footer (removed) */}
        {/* No extra bottom content, matches SignIn */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  helper: {
    color: '#6B7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  label: { marginBottom: 6, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  error: { color: '#b91c1c', marginBottom: 12, textAlign: 'center' },
  sentText: {
    marginBottom: 12,
    textAlign: 'center',
    color: '#065F46',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#000',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
