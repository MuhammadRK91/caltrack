import React, { useLayoutEffect } from 'react';
import { View, Text, Pressable, Image, Linking, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const LOGO_URL =
  'https://dunbmrbhucjzdkhtunew.supabase.co/storage/v1/object/public/logos/new-logo.png';

export default function AuthLanding() {
  const navigation = useNavigation();

  // Transparent header with logo on the left; no Back button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: {
        backgroundColor: 'transparent',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerTitle: '',
      headerBackVisible: false,
      headerLeft: () => (
        <Image
          source={{ uri: LOGO_URL }}
          style={{ width: 220, height: 80, marginLeft: 6, marginTop: -12 }}
          resizeMode="cover"
        />
      ),
      headerRight: () => null,
    });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        {/* no middle logo */}
        <Text style={styles.title}>AudioBooks</Text>

        <Pressable style={styles.button} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.buttonText}>Sign in</Text>
        </Pressable>

        <Text style={styles.helper}>
          Don’t have an account?{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('SignUp')}>
            Create account
          </Text>
        </Text>
      </View>

      {/* footer (copied from SignIn) */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          A product of{' '}
          <Text style={styles.footerLink} onPress={() => Linking.openURL('https://y-manual.com')}>
            Y-Manual
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9f9f9', justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 24 },
  button: {
    backgroundColor: '#333',              // ← BLACK
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 260,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  helper: { color: '#6B7280' },
  link: { color: '#2563EB', fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' },
  footerText: { color: '#6B7280' },
  footerLink: { color: '#2563EB', fontWeight: '600' },
});
