// src/components/SubscribePopup.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { buyCalTrackSubscription, getCalTrackPlansPretty } from '../lib/iap';
import BrandedLoader from '../components/BrandedLoader';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function SubscribePopup({ visible, onClose }: Props) {
  const { refreshSubscription } = useAuth();

  const [yearly, setYearly] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [buying, setBuying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [monthlyPrice, setMonthlyPrice] = useState<string>('');
  const [yearlyPrice, setYearlyPrice] = useState<string>('');

  const selectedBasePlanId = yearly ? 'yearly-new' : 'monthly';

  useEffect(() => {
    if (!visible) return;

    setErr(null);
    setBuying(false);

    if (Platform.OS === 'web') {
      setMonthlyPrice('');
      setYearlyPrice('');
      return;
    }

    (async () => {
      setLoadingPlans(true);
      try {
        const { monthly, yearly } = await getCalTrackPlansPretty();
        setMonthlyPrice(monthly?.price || '');
        setYearlyPrice(yearly?.price || '');
      } catch (e: any) {
        setErr(e?.message || 'Could not load subscription plans.');
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, [visible]);

  const priceText = useMemo(() => {
    if (Platform.OS === 'web') return '';
    if (loadingPlans) return 'Loading price…';
    return yearly ? yearlyPrice || '' : monthlyPrice || '';
  }, [yearly, yearlyPrice, monthlyPrice, loadingPlans]);

  async function onSubscribe() {
    try {
      setErr(null);

      // Hide the big card and show only the small "processing" window immediately
      setBuying(true);

      // Starts Google purchase flow
      await buyCalTrackSubscription(selectedBasePlanId as any);

      // Pull latest entitlement from DB
      await refreshSubscription();

      // Close popup (your "success window" can be shown outside based on isSubscribed)
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Subscription failed.');
    } finally {
      setBuying(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Prevent closing while processing
        if (!buying) onClose();
      }}
    >
      <View style={styles.backdrop}>
        {/* When buying, ONLY show the small processing window (no big card behind it) */}
        {buying ? (
          <View style={styles.processingCard}>
            <BrandedLoader size={52} />
            <View style={styles.processingTextWrap}>
              <Text style={styles.processingTitle}>A moment please</Text>
              <Text style={styles.processingSubtitle}>
                We are updating your subscription data.
              </Text>
            </View>
          </View>
        ) : (
          // Normal state: show the big subscription card
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Unlock CalTrack Pro</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.subtitle}>
              Personalized diet plans, smart calorie tracking, and visual progress tracking.
            </Text>

            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, !yearly && styles.toggleActive]}>Monthly</Text>
              <Switch value={yearly} onValueChange={setYearly} />
              <Text style={[styles.toggleLabel, yearly && styles.toggleActive]}>Yearly</Text>
            </View>

            <View style={styles.priceBox}>
              {Platform.OS === 'web' ? (
                <Text style={styles.priceText}>Subscriptions available on mobile.</Text>
              ) : loadingPlans ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <Text style={styles.loadingText}>Fetching price…</Text>
                </View>
              ) : (
                <Text style={styles.priceText}>
                  {priceText
                    ? `${priceText} ${yearly ? 'per year' : 'per month'}`
                    : 'Price not available'}
                </Text>
              )}
            </View>

            {!!err && <Text style={styles.error}>{err}</Text>}

            <Pressable
              onPress={onSubscribe}
              disabled={loadingPlans || Platform.OS === 'web'}
              style={[
                styles.cta,
                (loadingPlans || Platform.OS === 'web') && styles.ctaDisabled,
              ]}
            >
              <Text style={styles.ctaText}>Subscribe</Text>
            </Pressable>

            <Text style={styles.footnote}>
              Cancel anytime in Google Play. Access remains until the end of your billing period.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  // Big subscribe card (normal)
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    overflow: 'hidden',
  },

  // Small processing card (buying)
  processingCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  processingTextWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  processingTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  processingSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 18,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  close: { fontSize: 18, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 8, color: '#374151', lineHeight: 18 },

  toggleRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  toggleLabel: { color: '#6B7280', fontWeight: '700' },
  toggleActive: { color: '#111827' },

  priceBox: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    alignItems: 'center',
  },
  priceText: { fontSize: 15, fontWeight: '800', color: '#111827' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: '#374151', fontWeight: '600' },

  error: { marginTop: 10, color: '#B91C1C', fontWeight: '700' },

  cta: {
    marginTop: 14,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  footnote: { marginTop: 10, color: '#6B7280', fontSize: 12, lineHeight: 16 },
});
