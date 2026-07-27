import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;

  // Subscription
  isSubscribed: boolean;
  subLoading: boolean;
  refreshSubscription: () => Promise<void>;

  // stable key for “welcome once”
  subscriptionKey: string | null;

  // NEW: what DB says we already showed
  proWelcomeShownFor: string | null;

  // NEW: mark as shown in DB
  markProWelcomeShown: (token: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);

  const [subscriptionKey, setSubscriptionKey] = useState<string | null>(null);
  const [proWelcomeShownFor, setProWelcomeShownFor] = useState<string | null>(null);

  const refreshSubscription = useCallback(async () => {
    const u = user;
    if (!u) {
      setIsSubscribed(false);
      setSubscriptionKey(null);
      setProWelcomeShownFor(null);
      return;
    }

    setSubLoading(true);
    try {
      const { data, error } = await supabase
        .from('caltrack_subscriptions')
        .select('status,current_period_end,purchase_token,pro_welcome_shown_for')
        .eq('user_id', u.id)
        .maybeSingle();

      if (error) throw error;

      const statusOk = data?.status === 'active' || data?.status === 'trialing';

      const periodOk =
        !data?.current_period_end ||
        new Date(data.current_period_end).getTime() > Date.now();

      const ok = !!data && statusOk && periodOk;

      setIsSubscribed(ok);

      // IMPORTANT: ONLY purchase_token (no fallback), otherwise it changes and re-triggers
      setSubscriptionKey(ok ? (data?.purchase_token ?? null) : null);

      setProWelcomeShownFor(data?.pro_welcome_shown_for ?? null);
    } catch (e) {
      console.log('[Auth] refreshSubscription error', e);
      setIsSubscribed(false);
      setSubscriptionKey(null);
      setProWelcomeShownFor(null);
    } finally {
      setSubLoading(false);
    }
  }, [user]);

  const markProWelcomeShown = useCallback(
    async (token: string) => {
      const u = user;
      if (!u) return;

      try {
        const { error } = await supabase
          .from('caltrack_subscriptions')
          .update({
            pro_welcome_shown_for: token,
            pro_welcome_shown_at: new Date().toISOString(),
          })
          .eq('user_id', u.id);

        if (error) throw error;

        setProWelcomeShownFor(token);
      } catch (e) {
        console.log('[Auth] markProWelcomeShown error', e);
      }
    },
    [user]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const sess = data.session ?? null;
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      refreshSubscription();
    } else {
      setIsSubscribed(false);
      setSubscriptionKey(null);
      setProWelcomeShownFor(null);
    }
  }, [user, refreshSubscription]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIsSubscribed(false);
    setSubscriptionKey(null);
    setProWelcomeShownFor(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      signOut,

      isSubscribed,
      subLoading,
      refreshSubscription,

      subscriptionKey,
      proWelcomeShownFor,
      markProWelcomeShown,
    }),
    [
      session,
      user,
      loading,
      signOut,
      isSubscribed,
      subLoading,
      refreshSubscription,
      subscriptionKey,
      proWelcomeShownFor,
      markProWelcomeShown,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
