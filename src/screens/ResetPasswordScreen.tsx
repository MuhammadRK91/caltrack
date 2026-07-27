// src/screens/ResetPasswordScreen.tsx
import React, { useState, useLayoutEffect, useEffect } from 'react';
import {
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from '../lib/supabase';
import BackButton from '../components/BackButton';

export default function ResetPasswordScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Match ForgotPassword / SignIn header: Back on LEFT, nothing on right, no logo
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,

      // Back button on the LEFT (same as ForgotPassword / SignIn)
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

  const validate = () => {
    if (!pw1 || pw1.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return false;
    }
    if (pw1 !== pw2) {
      Alert.alert('Passwords do not match');
      return false;
    }
    return true;
  };

  const onSubmit = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => navigation.replace('SignIn') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update password.');
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
          paddingTop: 110, // match ForgotPassword / SignIn
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>
          Enter your new password below. Minimum 8 characters.
        </Text>

        <TextInput
          secureTextEntry={!showPw}
          placeholder="New password"
          value={pw1}
          onChangeText={setPw1}
          autoCapitalize="none"
          textContentType="newPassword"
          style={styles.input}
        />

        <TextInput
          secureTextEntry={!showPw}
          placeholder="Confirm new password"
          value={pw2}
          onChangeText={setPw2}
          autoCapitalize="none"
          textContentType="newPassword"
          style={styles.input}
        />

        <Pressable
          onPress={() => setShowPw((s) => !s)}
          style={{ alignSelf: 'flex-start', marginBottom: 20 }}
          disabled={loading}
        >
          <Text style={{ color: '#2563EB', fontWeight: '600' }}>
            {showPw ? 'Hide' : 'Show'} passwords
          </Text>
        </Pressable>

        <Pressable
          onPress={onSubmit}
          disabled={loading}
          style={[styles.button, loading && { opacity: 0.6 }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Update Password</Text>
          )}
        </Pressable>

        {/* No logo, no footer (matches ForgotPassword / SignIn) */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  subtitle: { color: '#6B7280', marginBottom: 16, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#000',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
