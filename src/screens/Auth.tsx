// src/screens/Auth.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import supabase from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

export default function AuthScreen({ navigation }: any) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signUp = async () => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: 'audiobooks://signin-callback' }, // optional
      });
      if (error) throw error;
      Alert.alert('Check your inbox', 'We sent you a confirmation email.');
    } catch (e: any) {
      Alert.alert('Sign up failed', e.message);
    }
  };

  const signIn = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message);
    }
  };

  return (
    <View style={{ flex: 1, gap: 12, padding: 16, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>Sign in</Text>

      <Text>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 }}
      />

      <Text>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 }}
      />

      <Button title="Sign in" onPress={signIn} />
      <Button title="Create account" onPress={signUp} />
    </View>
  );
}
