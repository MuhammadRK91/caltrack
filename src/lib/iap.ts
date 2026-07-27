// src/lib/iap.ts
import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import * as RNIapImport from 'react-native-iap';
import type { Purchase, Subscription } from 'react-native-iap';
import supabase from './supabase';
import Constants from 'expo-constants';

const IAP: any = (RNIapImport as any)?.default ?? (RNIapImport as any);

const TAG = '[IAP]';
const IS_ANDROID = Platform.OS === 'android';
const IS_IOS = Platform.OS === 'ios';

const VERIFY_URL =
  process.env.EXPO_PUBLIC_IAP_VERIFY_URL ||
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_IAP_VERIFY_URL ||
  (Constants.manifest as any)?.extra?.EXPO_PUBLIC_IAP_VERIFY_URL; // legacy fallback

// Two separate subscriptions (Google Play)
// Monthly product: caltrack_pro
// Yearly product: caltrack_yearly
export const CALTRACK_PRODUCTS = {
  monthly: 'caltrack_pro',
  yearly: 'caltrack_yearly',
} as const;

export type CalTrackPlanKey = keyof typeof CALTRACK_PRODUCTS; // 'monthly' | 'yearly'

// Some older values might still be passed by UI or old code.
// We normalize them to avoid sending null productId into native BillingBridge.
type CalTrackPlanInput = CalTrackPlanKey | string;

const log = (...a: any[]) => console.log(TAG, ...a);
const warn = (...a: any[]) => console.warn(TAG, ...a);

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

async function getAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    userId: session?.user?.id ?? null,
    accessToken: session?.access_token ?? null,
  };
}

/* -----------------------------------------------------------------------------
 * Normalize plan input (FIXES yearly crash)
 * - accepts 'monthly'/'yearly'
 * - accepts productIds 'caltrack_pro'/'caltrack_yearly'
 * - accepts older basePlanId values ('yearly-new', 'caltrack-yearly') and maps to 'yearly'
 * -------------------------------------------------------------------------- */
function normalizePlan(input: CalTrackPlanInput): CalTrackPlanKey {
  const v = String(input || '').trim();

  // Correct keys
  if (v === 'monthly' || v === 'yearly') return v;

  // Product IDs
  if (v === CALTRACK_PRODUCTS.monthly) return 'monthly';
  if (v === CALTRACK_PRODUCTS.yearly) return 'yearly';

  // Legacy / base plan ids (old UI or old code may still pass these)
  if (v === 'yearly-new') return 'yearly';
  if (v === 'caltrack-yearly') return 'yearly';
  if (v === 'caltrack-yearly-new') return 'yearly';

  // Defensive default: if something unknown comes in, fail loudly (no native crash)
  throw new Error(`Invalid plan "${v}". Expected monthly/yearly or productId.`);
}

/* -----------------------------------------------------------------------------
 * Android BillingBridge
 * -------------------------------------------------------------------------- */
const BillingBridge = (NativeModules as any)?.BillingBridge;
// Use emitter without module arg for max compatibility
const billingEmitter = IS_ANDROID ? new NativeEventEmitter() : null;

type BillingPurchaseEvent = {
  type: string; // PURCHASED | PENDING | USER_CANCELED | ERROR | UNSPECIFIED ...
  orderId?: string;
  purchaseToken?: string;
  products?: string[];
  quantity?: number;
  acknowledged?: boolean;
  state?: 'PENDING' | 'PURCHASED' | 'UNSPECIFIED';
  [k: string]: any;
};

function waitForAndroidPurchase(productId: string, timeoutMs = 120_000) {
  if (!billingEmitter) throw new Error('Billing events not available.');

  return new Promise<BillingPurchaseEvent>((resolve, reject) => {
    let done = false;

    const cleanup = () => {
      try {
        sub?.remove();
      } catch {}
      try {
        metaSub?.remove();
      } catch {}
      done = true;
    };

    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error('Purchase timed out. Please retry.'));
    }, timeoutMs);

    const sub = billingEmitter.addListener(
      'billing_purchase_event',
      (evt: BillingPurchaseEvent) => {
        try {
          const products = evt?.products ?? [];
          const matches = products.includes(productId);

          // Non-matching events can still be cancel/error
          if (!matches) {
            if (evt?.type === 'USER_CANCELED') {
              clearTimeout(timer);
              cleanup();
              return reject(new Error('Purchase canceled.'));
            }
            if (evt?.type === 'ERROR') {
              clearTimeout(timer);
              cleanup();
              return reject(new Error('Purchase failed.'));
            }
            return;
          }

          // Matched our product
          if (evt?.type === 'PENDING' || evt?.state === 'PENDING') {
            clearTimeout(timer);
            cleanup();
            return reject(
              new Error('Your subscription is pending. Access will unlock once it completes.')
            );
          }

          if (evt?.type === 'PURCHASED' || evt?.state === 'PURCHASED') {
            clearTimeout(timer);
            cleanup();
            return resolve(evt);
          }
        } catch (e: any) {
          clearTimeout(timer);
          cleanup();
          reject(e);
        }
      }
    );

    const metaSub = billingEmitter.addListener('billing_purchase_event_meta', (m: any) => {
      log('billing meta:', safeJson(m));
    });
  });
}

/* -----------------------------------------------------------------------------
 * Plan shaping
 * -------------------------------------------------------------------------- */
export type PrettyPlan = {
  productId: string;
  price: string;
  currency: string;
  periodISO: string;
  periodShort: string;
  periodLong: string;
  raw: any;
};

function formatPeriodLabel(iso?: string): { short: string; long: string } | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?$/i.exec(iso);
  if (!m) return null;

  const years = Number(m[1] || 0);
  const months = Number(m[2] || 0);
  const weeks = Number(m[3] || 0);

  if (years)
    return {
      short: years === 1 ? '/yr' : `/${years}yr`,
      long: years === 1 ? 'per year' : `every ${years} years`,
    };
  if (months)
    return {
      short: months === 1 ? '/mo' : `/${months}mo`,
      long: months === 1 ? 'per month' : `every ${months} months`,
    };
  if (weeks)
    return {
      short: weeks === 1 ? '/wk' : `/${weeks}wk`,
      long: weeks === 1 ? 'per week' : `every ${weeks} weeks`,
    };
  return null;
}

/* -----------------------------------------------------------------------------
 * Init / end
 * -------------------------------------------------------------------------- */
let _inited = false;

export async function initIap() {
  if (Platform.OS === 'web') return;
  if (_inited) return;

  if (IS_ANDROID) {
    if (!BillingBridge) {
      throw new Error(
        'BillingBridge native module not found. Check MainApplication.kt (BillingBridgePackage) and rebuild.'
      );
    }

    await BillingBridge.initTap();
    await BillingBridge.listProducts([CALTRACK_PRODUCTS.monthly, CALTRACK_PRODUCTS.yearly]);

    _inited = true;
    log('initIap: Android BillingBridge initialized');
    return;
  }

  // iOS uses RN-IAP
  log('initConnection() start (iOS)');
  await IAP.initConnection();
  log('initConnection() ok (iOS)');
  _inited = true;
}

export async function endIap() {
  _inited = false;

  if (IS_IOS) {
    try {
      log('endConnection() (iOS)');
      await IAP.endConnection?.();
    } catch (e: any) {
      warn('endConnection error:', e?.message || e);
    }
  }
}

async function withBillingReady<T>(op: () => Promise<T>): Promise<T> {
  try {
    await initIap();
    return await op();
  } catch (e1: any) {
    warn('withBillingReady first attempt failed:', e1?.message || e1);
    try {
      await endIap();
    } catch {}
    await initIap();
    return await op();
  }
}

/* -----------------------------------------------------------------------------
 * Get plans / pricing
 * -------------------------------------------------------------------------- */
export async function getCalTrackPlansPretty(): Promise<{
  monthly?: PrettyPlan;
  yearly?: PrettyPlan;
}> {
  if (Platform.OS === 'web') return {};

  if (IS_ANDROID) {
    await withBillingReady(async () => {});
    const catalog = await BillingBridge.refreshCatalog();

    console.log('CATALOG subscriptions:', JSON.stringify(catalog?.subscriptions ?? [], null, 2));

    const subs: any[] = catalog?.subscriptions ?? [];

    const toPretty = (s: any): PrettyPlan | undefined => {
      if (!s) return undefined;
      const price = String(s?.price ?? '');
      if (!price) return undefined;

      const p = formatPeriodLabel(s?.billingPeriod);
      return {
        productId: String(s?.productId ?? ''),
        price,
        currency: String(s?.currency ?? ''),
        periodISO: String(s?.billingPeriod ?? ''),
        periodShort: p?.short ?? '',
        periodLong: p?.long ?? '',
        raw: s,
      };
    };

    const monthly = toPretty(subs.find((s) => String(s?.productId) === CALTRACK_PRODUCTS.monthly));
    const yearly = toPretty(subs.find((s) => String(s?.productId) === CALTRACK_PRODUCTS.yearly));

    return { monthly, yearly };
  }

  if (IS_IOS) {
    return withBillingReady(async () => {
      const skus = [CALTRACK_PRODUCTS.monthly, CALTRACK_PRODUCTS.yearly];
      const res: Subscription[] = await IAP.getSubscriptions?.({ skus });

      const findById = (id: string) =>
        (res || []).find((x: any) => String(x?.productId ?? x?.id) === String(id)) as any;

      const make = (sub: any): PrettyPlan | undefined => {
        if (!sub) return undefined;
        const price = sub?.localizedPrice ?? sub?.price ?? '';
        const currency = sub?.currency ?? '';
        return {
          productId: String(sub?.productId ?? sub?.id ?? ''),
          price: String(price),
          currency: String(currency),
          periodISO: '',
          periodShort: '',
          periodLong: '',
          raw: sub,
        };
      };

      return {
        monthly: make(findById(CALTRACK_PRODUCTS.monthly)),
        yearly: make(findById(CALTRACK_PRODUCTS.yearly)),
      };
    });
  }

  return {};
}

/* -----------------------------------------------------------------------------
 * Backend verify helper
 * -------------------------------------------------------------------------- */
async function verifyOnBackend(payload: any, accessToken?: string | null) {
  if (!VERIFY_URL) throw new Error('Missing EXPO_PUBLIC_IAP_VERIFY_URL in environment.');

  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  return res;
}

/* -----------------------------------------------------------------------------
 * Buy subscription
 * -------------------------------------------------------------------------- */
export async function buyCalTrackSubscription(planInput: CalTrackPlanInput) {
  if (Platform.OS === 'web') throw new Error('Purchases are only available in the mobile app.');

  const { userId, accessToken } = await getAuth();
  if (!userId) throw new Error('Please sign in again and retry.');

  // FIX: normalize whatever UI passes, so we never send null productId to native.
  const plan = normalizePlan(planInput);
  const productId = CALTRACK_PRODUCTS[plan];

  // Extra defensive guard (prevents native crash)
  if (!productId) {
    throw new Error(`Invalid productId for plan "${String(planInput)}"`);
  }

  if (IS_ANDROID) {
    await withBillingReady(async () => {
      await BillingBridge.subscribe(productId, null, String(userId));
    });

    const evt = await waitForAndroidPurchase(productId);

    const token = evt?.purchaseToken;
    if (!token) throw new Error('Missing purchase token. Please retry.');

    const res = await verifyOnBackend(
      {
        platform: 'android',
        user_id: userId,
        product_id: productId, // caltrack_pro | caltrack_yearly
        plan, // monthly | yearly
        purchase_token: token,
        environment: __DEV__ ? 'sandbox' : 'production',
        latest_raw: evt,
      },
      accessToken
    );

    log('verify status:', res.status);

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      warn('verify failed:', res.status, t);
      throw new Error('Couldn’t activate subscription. You were not charged.');
    }

    // Acknowledge after successful verification
    try {
      await BillingBridge.acknowledgePurchase(String(token));
      log('acknowledge ok');
    } catch (e: any) {
      warn('acknowledge failed:', e?.message || e);
    }

    return;
  }

  if (IS_IOS) {
    await withBillingReady(async () => {
      if (typeof IAP.requestSubscription === 'function') {
        await IAP.requestSubscription({ sku: productId });
      } else if (typeof IAP.requestPurchase === 'function') {
        await IAP.requestPurchase({ sku: productId });
      } else {
        throw new Error('No purchase method available in this RN-IAP build.');
      }
    });

    const purchase = await waitForIosPurchase(productId);

    const receipt =
      (purchase as any)?.transactionReceipt ?? (purchase as any)?.receipt ?? null;

    if (!receipt) {
      warn('iOS receipt missing on purchase object:', safeJson(purchase));
      throw new Error('Missing iOS receipt. Please retry.');
    }

    const res = await verifyOnBackend(
      {
        platform: 'ios',
        user_id: userId,
        product_id: productId,
        plan,
        receipt,
        environment: __DEV__ ? 'sandbox' : 'production',
        latest_raw: purchase,
      },
      accessToken
    );

    log('verify status:', res.status);

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      warn('verify failed:', res.status, t);
      throw new Error('Couldn’t activate subscription. You were not charged.');
    }

    try {
      await IAP.finishTransaction?.({ purchase, isConsumable: false });
    } catch (e: any) {
      warn('finishTransaction error:', e?.message || e);
    }

    return;
  }

  throw new Error('Unsupported platform.');
}

/* -----------------------------------------------------------------------------
 * iOS purchase waiting helpers
 * -------------------------------------------------------------------------- */
function waitForIosPurchase(filterProductId: string, timeoutMs = 120_000) {
  return new Promise<Purchase>((resolve, reject) => {
    let done = false;

    const cleanup = () => {
      try {
        updateSub?.remove();
      } catch {}
      try {
        errorSub?.remove();
      } catch {}
      done = true;
    };

    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error('Purchase timed out. Please retry.'));
    }, timeoutMs);

    const updateSub = IAP.purchaseUpdatedListener((purchase: Purchase) => {
      try {
        const pid =
          (purchase as any)?.productId ??
          (purchase as any)?.productIds?.[0] ??
          (purchase as any)?.id;

        if (String(pid) !== String(filterProductId)) return;

        clearTimeout(timer);
        cleanup();
        resolve(purchase);
      } catch (e: any) {
        clearTimeout(timer);
        cleanup();
        reject(e);
      }
    });

    const errorSub = IAP.purchaseErrorListener((err: any) => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(err?.message || 'Purchase failed.'));
    });
  });
}

/* -----------------------------------------------------------------------------
 * Restore
 * -------------------------------------------------------------------------- */
export async function restoreCalTrackSubscription() {
  if (Platform.OS === 'web') return;

  const { userId, accessToken } = await getAuth();
  if (!userId) return;
  if (!VERIFY_URL) return;

  if (IS_ANDROID) {
    await withBillingReady(async () => {
      await BillingBridge.queryExistingPurchases();
    });

    for (const pid of [CALTRACK_PRODUCTS.monthly, CALTRACK_PRODUCTS.yearly]) {
      const evt = await waitForAndroidPurchase(pid).catch(() => null);
      if (!evt?.purchaseToken) continue;

      const res = await verifyOnBackend(
        {
          platform: 'android',
          user_id: userId,
          product_id: pid,
          plan: pid === CALTRACK_PRODUCTS.monthly ? 'monthly' : 'yearly',
          purchase_token: evt.purchaseToken,
          environment: __DEV__ ? 'sandbox' : 'production',
          latest_raw: evt,
        },
        accessToken
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        warn('restore verify failed:', res.status, t);
        continue;
      }

      try {
        await BillingBridge.acknowledgePurchase(String(evt.purchaseToken));
      } catch (e: any) {
        warn('restore acknowledge failed:', e?.message || e);
      }
      return;
    }

    return;
  }

  if (IS_IOS) {
    await withBillingReady(async () => {});

    const purchases: Purchase[] = await IAP.getAvailablePurchases?.();
    if (!Array.isArray(purchases) || purchases.length === 0) return;

    const matches = purchases.filter((p: any) => {
      const pid = p?.productId ?? p?.productIds?.[0] ?? p?.id;
      return (
        String(pid) === String(CALTRACK_PRODUCTS.monthly) ||
        String(pid) === String(CALTRACK_PRODUCTS.yearly)
      );
    });

    for (const match of matches) {
      const receipt =
        (match as any)?.transactionReceipt ?? (match as any)?.receipt ?? null;
      if (!receipt) continue;

      const pid =
        (match as any)?.productId ?? (match as any)?.productIds?.[0] ?? (match as any)?.id;

      const res = await verifyOnBackend(
        {
          platform: 'ios',
          user_id: userId,
          product_id: pid,
          plan: pid === CALTRACK_PRODUCTS.monthly ? 'monthly' : 'yearly',
          receipt,
          environment: __DEV__ ? 'sandbox' : 'production',
          latest_raw: match,
        },
        accessToken
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        warn('restore verify failed:', res.status, t);
        continue;
      }

      try {
        await IAP.finishTransaction?.({ purchase: match, isConsumable: false });
      } catch (e: any) {
        warn('restore finishTransaction failed:', e?.message || e);
      }
      return;
    }
  }
}
