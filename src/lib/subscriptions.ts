// src/lib/subscriptions.ts
// CalTrack subscription constants (Google Play)

export const CALTRACK_PRODUCT_ID = 'caltrack_pro';

// Base plan IDs (must match Play Console base plan IDs)
export const CALTRACK_BASE_PLANS = {
  monthly: 'monthly',
  yearly: 'yearly-new',
} as const;

export type CalTrackBasePlanId = keyof typeof CALTRACK_BASE_PLANS;

// Convenience list for UI
export const CALTRACK_PLAN_OPTIONS: Array<{
  label: string;
  basePlanId: typeof CALTRACK_BASE_PLANS[keyof typeof CALTRACK_BASE_PLANS];
}> = [
  { label: 'Monthly', basePlanId: CALTRACK_BASE_PLANS.monthly },
  { label: 'Yearly', basePlanId: CALTRACK_BASE_PLANS.yearly },
];
