// src/linking/ResetLinkListener.tsx
import React, { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import supabase from '../lib/supabase';
import type { RootStackParamList } from '../types/navigation';

function extractParams(url: string) {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const query =
    queryIndex >= 0
      ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : '';

  const merged = [query, hash].filter(Boolean).join('&');
  const params = new URLSearchParams(merged);

  const get = (k: string) => params.get(k) ?? undefined;

  return {
    type: get('type'),
    access_token: get('access_token'),
    refresh_token: get('refresh_token'),
    error: get('error'),
    error_description: get('error_description'),
  };
}

type Props = {
  navigationRef: NavigationContainerRef<RootStackParamList>;
};

export default function ResetLinkListener({ navigationRef }: Props) {
  const handledOnce = useRef<string | null>(null);

  useEffect(() => {
    const handle = async (url: string) => {
      if (!url) return;

      // Avoid double-firing
      if (handledOnce.current === url) return;
      handledOnce.current = url;

      // Only handle CalTrack reset links
      if (!url.startsWith('caltrack://reset')) return;

      const p = extractParams(url);

      if (p.error) {
        console.log('[ResetLinkListener] recovery error', p.error, p.error_description);
        return;
      }

      if (p.type !== 'recovery') return;
      if (!p.access_token || !p.refresh_token) return;

      const { error } = await supabase.auth.setSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token,
      });

      if (error) {
        console.log('[ResetLinkListener] setSession error', error.message);
        return;
      }

      const go = () => {
        if (navigationRef.isReady()) {
          navigationRef.navigate('ResetPassword');
          return true;
        }
        return false;
      };

      // Try now, otherwise retry shortly (cold start case)
      if (!go()) {
        setTimeout(go, 250);
        setTimeout(go, 750);
      }
    };

    Linking.getInitialURL().then((u) => {
      if (u) handle(u);
    });

    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [navigationRef]);

  return null;
}
