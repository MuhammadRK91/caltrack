import React, { useCallback, useLayoutEffect, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  BackHandler,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '../components/BackButton';
import { requireEnv } from '../lib/env';

const WEBHOOK = requireEnv(
  'EXPO_PUBLIC_SUPPORT_WEBHOOK_URL',
  process.env.EXPO_PUBLIC_SUPPORT_WEBHOOK_URL
);

export default function Support() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // Header — match SignIn / ForgotPassword (transparent, no shadow, BackButton on LEFT)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,

      // Back button on the LEFT
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

  // HW back (exit if no stack)
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

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

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

  const validate = () => {
    if (!name.trim() || !email.trim() || !msg.trim()) {
      Alert.alert('Required', 'Please fill in Name, Email, and Message.');
      return false;
    }
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!okEmail) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return false;
    }
    return true;
  };

  const onSend = async () => {
    if (!validate()) return;
    try {
      setSending(true);
      const res = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: msg.trim(),
          app: 'CalTrack',
          platform: Platform.OS,
          ts: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Alert.alert('Sent', 'Thanks! Your message has been delivered.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setName('');
      setEmail('');
      setMsg('');
    } catch {
      Alert.alert('Failed to send', 'Please check your connection and try again.');
    } finally {
      setSending(false);
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
          paddingTop: 110, // match SignIn/ForgotPassword
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Support</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          value={msg}
          onChangeText={setMsg}
          style={[styles.input, styles.messageBox]}
          multiline
          scrollEnabled
          textAlignVertical="top"
          returnKeyType="done"
        />

        <Pressable
          style={[styles.primaryBtn, sending && { opacity: 0.6 }]}
          onPress={onSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Send message</Text>
          )}
        </Pressable>

        {/* footer removed */}
        {keyboardVisible ? null : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20, // match SignIn/ForgotPassword
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  label: { fontWeight: '600', marginBottom: 6, color: '#111827' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  messageBox: {
    height: 200,
  },
  primaryBtn: {
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
});
