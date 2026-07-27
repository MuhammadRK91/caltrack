// src/linking/ResetLinkBridge.tsx
import { useEffect } from 'react';
import { Linking } from 'react-native';
import supabase from '../lib/supabase';
import { navToReset } from '../navigation/navRef';

// parse hash/query from the Supabase link
function parseAuthParams(url: string) {
  const frag = url.split('#')[1] || url.split('?')[1];
  if (!frag) return {};
  return Object.fromEntries(new URLSearchParams(frag) as any);
}

export default function ResetLinkBridge() {
  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        if (!url.startsWith('audiobooks://')) return;

        const p: any = parseAuthParams(url);
        if (p?.type === 'recovery' && p?.access_token && p?.refresh_token) {
          await supabase.auth.setSession({
            access_token: String(p.access_token),
            refresh_token: String(p.refresh_token),
          });
          navToReset();
        }
      } catch (err) {
        console.warn('reset link handler error:', err);
      }
    };

    // cold start
    Linking.getInitialURL().then((url) => url && handleUrl(url));

    // foreground
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return null;
}
