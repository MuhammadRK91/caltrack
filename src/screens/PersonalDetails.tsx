// src/screens/PersonalDetails.tsx
import React, {
  useEffect,
  useState,
  useLayoutEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Platform,
  useWindowDimensions,
  KeyboardAvoidingView,
  TextInput,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import supabase from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import type { RootStackParamList } from '../types/navigation';
import BrandedLoader from '../components/BrandedLoader';
import { requireEnv } from '../lib/env';

const RECALC_WEBHOOK = requireEnv(
  'EXPO_PUBLIC_MEAL_PLAN_WEBHOOK_URL',
  process.env.EXPO_PUBLIC_MEAL_PLAN_WEBHOOK_URL
);

const LOGO_URL =
  'https://dunbmrbhucjzdkhtunew.supabase.co/storage/v1/object/public/logos/y-manual.png';

const headerH = 56;

type SpeedType = 'slow' | 'normal' | 'aggressive';

type GoalsRow = {
  user_id: string;
  unit_system: 'metric' | 'imperial';
  height_cm: number | null;
  weight_kg: number | null;
  dob: string | null;
  gender: string | null;
  goal: 'lose' | 'maintain' | 'gain' | null;
  speed: SpeedType | null;
  goal_weight_kg?: number | null;
};

type NutritionTargetsRow = {
  user_id: string;
  time_to_goal_months: number | null;
  required_weekly_change_kg: number | null;
};

type SubscriptionRow = {
  user_id: string;
  provider: string;
  plan_id: string | null; // caltrack_pro / caltrack_yearly
  entitlement: string; // 'pro'
  status: 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type Props = NativeStackScreenProps<RootStackParamList, 'PersonalDetails'>;

// ---- date helpers ----
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const formatDateYYYYMMDD = (date: Date) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

const parseDateYYYYMMDD = (value: string | null): Date => {
  if (!value) return new Date(1990, 0, 1);
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return new Date(1990, 0, 1);
  return new Date(y, m - 1, d);
};

const formatReadableDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(d);
};

const planLabel = (planId: string | null) => {
  if (!planId) return 'Free';
  if (planId === 'caltrack_pro') return 'Monthly Pro';
  if (planId === 'caltrack_yearly') return 'Yearly Pro';
  return 'Pro';
};

// ---- plan helpers ----
const MONTH_WEEKS = 4.345;

const parseNum = (s: string) => {
  const t = (s ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const monthOptions = [1, 2, 3, 4, 6, 9, 12];

type PlanMeta = {
  deltaKg: number;
  durationMonths: number;
  durationWeeks: number;
  requiredWeeklyChangeKg: number;
  maxSafeWeeklyChangeKg: number;
  minMonths: number;
  ok: boolean;
  effectiveSpeed: SpeedType;
};

const computePlanMeta = (args: {
  goal: 'lose' | 'gain';
  currentWeightKg: number;
  targetWeightKg: number;
  durationMonths: number;
}): PlanMeta => {
  const { goal, currentWeightKg, targetWeightKg, durationMonths } = args;

  const delta = Math.abs(currentWeightKg - targetWeightKg);
  const weeks = durationMonths * MONTH_WEEKS;
  const requiredWeekly = weeks > 0 ? delta / weeks : 0;

  const maxSafe = goal === 'lose' ? 0.5 : 0.5;
  const minMonths = delta === 0 ? 1 : Math.ceil(delta / (maxSafe * MONTH_WEEKS));

  let effectiveSpeed: SpeedType = 'normal';
  if (goal === 'lose') {
    if (requiredWeekly <= 0.5) effectiveSpeed = 'slow';
    else if (requiredWeekly <= 0.8) effectiveSpeed = 'normal';
    else effectiveSpeed = 'aggressive';
  } else {
    if (requiredWeekly <= 0.25) effectiveSpeed = 'slow';
    else if (requiredWeekly <= 0.4) effectiveSpeed = 'normal';
    else effectiveSpeed = 'aggressive';
  }

  const ok = requiredWeekly <= maxSafe + 1e-9;

  return {
    deltaKg: delta,
    durationMonths,
    durationWeeks: weeks,
    requiredWeeklyChangeKg: requiredWeekly,
    maxSafeWeeklyChangeKg: maxSafe,
    minMonths,
    ok,
    effectiveSpeed,
  };
};

export default function PersonalDetails({ navigation }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  // --- Floating logo geometry ---
  const logoAspect = 140 / 320;
  const logoW = Math.min(340, Math.max(200, Math.round(screenW * 0.58)));
  const logoH = Math.round(logoW * logoAspect);
  const isWeb = Platform.OS === 'web';
  const logoTop = isWeb ? -35 : Math.max(0, insets.top - 35);
  const logoLeft = isWeb ? -40 : 0;
  const logoShift = isWeb ? -80 : -80;
  const logoTopAdj = logoTop + 15;
  const logoLeftAdj = logoLeft + 10;

  const topPad = headerH + 80;

  const [goals, setGoals] = useState<GoalsRow | null>(null);
  const [nutritionTargets, setNutritionTargets] =
    useState<NutritionTargetsRow | null>(null);

  // subscription state (display-only)
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // editable form state
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain' | ''>('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [height, setHeight] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [durationMonths, setDurationMonths] = useState<number | null>(null);

  // originals for dirty check
  const [origGoal, setOrigGoal] = useState<'lose' | 'maintain' | 'gain' | ''>('');
  const [origWeight, setOrigWeight] = useState('');
  const [origHeight, setOrigHeight] = useState('');
  const [origDob, setOrigDob] = useState('');
  const [origGender, setOrigGender] = useState('');
  const [origTargetWeight, setOrigTargetWeight] = useState('');
  const [origDurationMonths, setOrigDurationMonths] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);

  // streak
  const [loginStreak, setLoginStreak] = useState<number | null>(null);
  const [streakLoading, setStreakLoading] = useState(false);

  // goal picker bottom sheet
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);

  // local sheet state (so user can cancel)
  const [sheetGoal, setSheetGoal] = useState<'lose' | 'maintain' | 'gain' | ''>('');
  const [sheetTargetWeight, setSheetTargetWeight] = useState('');
  const [sheetDurationMonths, setSheetDurationMonths] = useState<number>(3);
  const [sheetPlanError, setSheetPlanError] = useState<string | null>(null);

  // new pickers / sheets
  const [weightPickerOpen, setWeightPickerOpen] = useState(false);
  const [heightPickerOpen, setHeightPickerOpen] = useState(false);
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [genderSheetOpen, setGenderSheetOpen] = useState(false);

  const [tempWeight, setTempWeight] = useState<number | null>(null);
  const [tempHeight, setTempHeight] = useState<number | null>(null);
  const [tempDob, setTempDob] = useState<Date | null>(null);

  // ---- open subscription manage/cancel page ----
  const ANDROID_PACKAGE_NAME = 'com.pet.caltrack';
  const GOOGLE_SUBS_MANAGE_URL = `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE_NAME}`;

  const openManageSubscription = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.openURL(GOOGLE_SUBS_MANAGE_URL);
        return;
      }
      await Linking.openURL('https://apps.apple.com/account/subscriptions');
    } catch {
      console.log('[PersonalDetails] Could not open subscription settings');
    }
  }, []);

  // ---- header: streak pill only ----
  useLayoutEffect(() => {
    const isWebHeader = Platform.OS === 'web';

    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: true,

      headerStyle: {
        backgroundColor: 'transparent',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerShadowVisible: false,
      headerBackground: () => (
        <View style={{ flex: 1, backgroundColor: 'transparent' }} />
      ),

      headerLeftContainerStyle: {
        paddingLeft: 0,
        marginLeft: isWebHeader ? 0 : -10,
      },
      headerRightContainerStyle: {
        paddingRight: 0,
        marginRight: 0,
      },

      headerRight: () =>
        userId ? (
          <View style={{ marginRight: 15 }}>
            <View style={styles.headerStreakPill}>
              <Ionicons name="flame-outline" size={16} color="#F97316" />
              <Text style={styles.headerStreakText}>
                {streakLoading ? '—' : loginStreak ?? 0}
              </Text>
            </View>
          </View>
        ) : null,
    });
  }, [navigation, userId, loginStreak, streakLoading]);

  // ---- load subscription (display only) ----
  const loadSubscription = useCallback(async () => {
    if (!userId) return;

    try {
      setSubLoading(true);
      const { data, error } = await supabase
        .from<SubscriptionRow>('caltrack_subscriptions')
        .select(
          'user_id,provider,plan_id,entitlement,status,current_period_start,current_period_end,cancel_at_period_end'
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setSubscription(data ?? null);
    } catch (e) {
      console.log('[PersonalDetails] subscription load error', e);
      setSubscription(null);
    } finally {
      setSubLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  useFocusEffect(
    useCallback(() => {
      loadSubscription();
      return () => {};
    }, [loadSubscription])
  );

  // ---- load profile goals + nutrition targets ----
  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from<GoalsRow>('caltrack_profile_goals')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        setGoals(data ?? null);

        const { data: ntData, error: ntErr } = await supabase
          .from<NutritionTargetsRow>('caltrack_nutrition_targets')
          .select('user_id,time_to_goal_months,required_weekly_change_kg')
          .eq('user_id', userId)
          .maybeSingle();

        if (ntErr) {
          console.log('[PersonalDetails] nutrition targets load error', ntErr);
        }
        setNutritionTargets(ntData ?? null);

        if (data) {
  const g = (data.goal ?? '') as 'lose' | 'maintain' | 'gain' | '';
  const w = data.weight_kg != null ? String(data.weight_kg) : '';
  const h = data.height_cm != null ? String(data.height_cm) : '';
  const d = data.dob ?? '';
  const ge = data.gender ?? '';
  const tw = data.goal_weight_kg != null ? String(data.goal_weight_kg) : '';

  // use existing time_to_goal_months from nutrition targets if available
  const monthsFromTargets =
    ntData?.time_to_goal_months != null
      ? Number(ntData.time_to_goal_months)
      : null;

  const safeMonthsFromTargets =
    monthsFromTargets != null &&
    Number.isFinite(monthsFromTargets) &&
    monthsFromTargets > 0
      ? monthsFromTargets
      : null;

  const defaultMonths =
    g === 'maintain'
      ? null
      : safeMonthsFromTargets ?? 3; // fallback to 3 only if we really have nothing

  setGoal(g);
  setCurrentWeight(w);
  setHeight(h);
  setDob(d);
  setGender(ge);
  setTargetWeight(tw);
  setDurationMonths(defaultMonths);

  setOrigGoal(g);
  setOrigWeight(w);
  setOrigHeight(h);
  setOrigDob(d);
  setOrigGender(ge);
  setOrigTargetWeight(tw);
  setOrigDurationMonths(defaultMonths);
}

      } catch (err: any) {
        console.error('Error loading goals', err);
        setError('Could not load your details.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  // ---- load streak ----
  useEffect(() => {
    if (!userId) return;

    const loadStreak = async () => {
      try {
        setStreakLoading(true);
        const { data, error } = await supabase.rpc('caltrack_touch_streak', {
          p_user: userId,
        });
        if (error) throw error;

        const row: any = Array.isArray(data) ? data?.[0] : data;
        const current =
          row?.v_streak ?? row?.login_streak ?? row?.current_streak ?? 0;
        setLoginStreak(current);
      } catch (e) {
        console.log('[PersonalDetails] streak error', e);
      } finally {
        setStreakLoading(false);
      }
    };

    loadStreak();
  }, [userId]);

  // ---- dirty check ----
  const isDirty = useMemo(() => {
    return (
      goal !== origGoal ||
      currentWeight !== origWeight ||
      height !== origHeight ||
      dob !== origDob ||
      gender !== origGender ||
      targetWeight !== origTargetWeight ||
      durationMonths !== origDurationMonths
    );
  }, [
    goal,
    currentWeight,
    height,
    dob,
    gender,
    targetWeight,
    durationMonths,
    origGoal,
    origWeight,
    origHeight,
    origDob,
    origGender,
    origTargetWeight,
    origDurationMonths,
  ]);

  // Revert unsaved changes ONLY when leaving the screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (navigation.isFocused()) return;
        if (isDirty) {
          setGoal(origGoal);
          setCurrentWeight(origWeight);
          setHeight(origHeight);
          setDob(origDob);
          setGender(origGender);
          setTargetWeight(origTargetWeight);
          setDurationMonths(origDurationMonths);
        }
      };
    }, [
      navigation,
      isDirty,
      origGoal,
      origWeight,
      origHeight,
      origDob,
      origGender,
      origTargetWeight,
      origDurationMonths,
    ])
  );

  const goalLabel = () => {
    if (!goal) return '—';
    if (goal === 'lose') return 'Loss';
    if (goal === 'maintain') return 'Maintain';
    return 'Gain';
  };

  const goalTargetLabel = useMemo(() => {
    if (!goals && !targetWeight && !currentWeight) return '—';
    if (goal === 'maintain') return currentWeight || '—';
    if (targetWeight) return targetWeight;
    if (goals?.goal_weight_kg != null) return String(goals.goal_weight_kg);
    return '—';
  }, [goals, goal, currentWeight, targetWeight]);

  const timeframeLabel = useMemo(() => {
    if (goal === 'maintain') return '—';

    const monthsFromTargets =
      nutritionTargets?.time_to_goal_months != null
        ? Number(nutritionTargets.time_to_goal_months)
        : null;

    if (
      monthsFromTargets != null &&
      Number.isFinite(monthsFromTargets) &&
      monthsFromTargets > 0
    ) {
      const rounded = Math.round(monthsFromTargets * 10) / 10;
      return `${rounded} month${rounded === 1 ? '' : 's'}`;
    }

    if (!durationMonths) return '—';
    return `${durationMonths} month${durationMonths === 1 ? '' : 's'}`;
  }, [goal, durationMonths, nutritionTargets]);

  const liveMeta = useMemo(() => {
    if (goal !== 'lose' && goal !== 'gain') return null;
    const cw = parseNum(currentWeight);
    const tw = parseNum(goal === 'maintain' ? currentWeight : targetWeight);
    const m = durationMonths ?? null;
    if (cw == null || tw == null || !m) return null;

    if (goal === 'lose' && tw >= cw) return null;
    if (goal === 'gain' && tw <= cw) return null;

    return computePlanMeta({
      goal,
      currentWeightKg: cw,
      targetWeightKg: tw,
      durationMonths: m,
    });
  }, [goal, currentWeight, targetWeight, durationMonths]);

  // ---- open handlers for pickers ----
  const openWeightPicker = () => {
    const fallback = currentWeight ? Number(currentWeight) : 70;
    setTempWeight(fallback);
    setWeightPickerOpen(true);
  };

  const openHeightPicker = () => {
    const fallback = height ? Number(height) : 170;
    setTempHeight(fallback);
    setHeightPickerOpen(true);
  };

  const openDobPicker = () => {
    const baseDate = dob ? parseDateYYYYMMDD(dob) : new Date(1990, 0, 1);
    setTempDob(baseDate);
    setDobPickerOpen(true);
  };

  // ---- apply goal + target + months from sheet ----
  const handleApplyGoalChange = () => {
    setSheetPlanError(null);

    if (!sheetGoal) {
      setGoalSheetOpen(false);
      return;
    }

    if (sheetGoal === 'lose' || sheetGoal === 'gain') {
      const cw = parseNum(currentWeight);
      const tw = parseNum(sheetTargetWeight);

      if (cw == null) {
        setSheetPlanError('Please set your current weight first.');
        return;
      }
      if (tw == null) {
        setSheetPlanError('Please enter a valid target weight.');
        return;
      }

      if (sheetGoal === 'lose' && tw >= cw) {
        setSheetPlanError(
          'For weight loss, target weight must be less than current weight.'
        );
        return;
      }
      if (sheetGoal === 'gain' && tw <= cw) {
        setSheetPlanError(
          'For weight gain, target weight must be greater than current weight.'
        );
        return;
      }

      const meta = computePlanMeta({
        goal: sheetGoal,
        currentWeightKg: cw,
        targetWeightKg: tw,
        durationMonths: sheetDurationMonths,
      });

      if (!meta.ok) {
        const suggested = Math.max(meta.minMonths, 1);
        setSheetPlanError(
          `This timeframe is too fast. The fastest recommended timeframe is ${suggested} month${
            suggested === 1 ? '' : 's'
          }.`
        );
        return;
      }

      setGoal(sheetGoal);
      setTargetWeight(sheetTargetWeight.trim());
      setDurationMonths(sheetDurationMonths);
      setGoalSheetOpen(false);
      return;
    }

    setGoal('maintain');
    setTargetWeight('');
    setDurationMonths(null);
    setGoalSheetOpen(false);
  };

  // ---- save handler ----
  const onSave = async () => {
  if (!userId || !goals || !isDirty) return;

  setSaving(true);
  setSaveMessage(null);
  setSaveStatus(null);

  try {
    const parsedWeight = currentWeight.trim() === '' ? null : Number(currentWeight);
    const parsedHeight = height.trim() === '' ? null : Number(height);

    const parsedTargetWeight =
      goal === 'maintain'
        ? parsedWeight
        : targetWeight.trim() === ''
        ? null
        : Number(targetWeight);

    // existing duration from nutrition targets (what backend already has)
    const monthsFromTargets =
      nutritionTargets?.time_to_goal_months != null
        ? Number(nutritionTargets.time_to_goal_months)
        : null;

    let effectiveSpeed: SpeedType | null = null;
    let planMeta: PlanMeta | null = null;
    let usedDurationMonths: number | null = durationMonths;

    if (goal === 'lose' || goal === 'gain') {
      // If user didn't explicitly pick a duration on this screen,
      // reuse the duration that is already stored in nutrition_targets.
      const durationForCalc =
        durationMonths ??
        (monthsFromTargets != null &&
        Number.isFinite(monthsFromTargets) &&
        monthsFromTargets > 0
          ? monthsFromTargets
          : null);

      if (parsedWeight == null || parsedTargetWeight == null || !durationForCalc) {
        throw new Error(
          'Please make sure current weight, target weight, and timeframe are set.'
        );
      }

      usedDurationMonths = durationForCalc;

      planMeta = computePlanMeta({
        goal,
        currentWeightKg: parsedWeight,
        targetWeightKg: parsedTargetWeight,
        durationMonths: durationForCalc,
      });

      if (!planMeta.ok) {
        throw new Error(
          `Selected timeframe is too fast. Minimum recommended timeframe is ${planMeta.minMonths} months.`
        );
      }

      effectiveSpeed = planMeta.effectiveSpeed;
    } else if (goal === 'maintain') {
      effectiveSpeed = 'normal';
      usedDurationMonths = null;
    }

    const updates: Partial<GoalsRow> = {
      weight_kg: parsedWeight,
      height_cm: parsedHeight,
      dob: dob.trim() || null,
      gender: gender.trim() || null,
      goal: goal || null,
      speed: effectiveSpeed,
      goal_weight_kg: parsedTargetWeight,
    };

    const { error } = await supabase
      .from<GoalsRow>('caltrack_profile_goals')
      .update(updates)
      .eq('user_id', userId);

    if (error) throw error;

    if (parsedWeight != null) {
      const today = new Date().toISOString().slice(0, 10);
      const { error: logError } = await supabase
        .from('caltrack_weight_logs')
        .upsert(
          {
            user_id: userId,
            logged_at: today,
            weight_kg: parsedWeight,
            source: 'manual',
          },
          { onConflict: 'user_id,logged_at' }
        );

      if (logError) {
        console.log('[PersonalDetails] log weight error', logError);
      }
    }

    setOrigGoal(goal);
    setOrigWeight(currentWeight);
    setOrigHeight(height);
    setOrigDob(dob);
    setOrigGender(gender);
    setOrigTargetWeight(targetWeight);
    setOrigDurationMonths(usedDurationMonths);

    setGoals((prev) =>
      prev
        ? {
            ...prev,
            weight_kg: parsedWeight ?? prev.weight_kg,
            height_cm: parsedHeight ?? prev.height_cm,
            dob: updates.dob ?? prev.dob,
            gender: updates.gender ?? prev.gender,
            goal: updates.goal ?? prev.goal,
            speed: updates.speed ?? prev.speed,
            goal_weight_kg: parsedTargetWeight ?? prev.goal_weight_kg ?? null,
          }
        : prev
    );

    const resp = await fetch(RECALC_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        unit_system: goals.unit_system,
        height_cm: parsedHeight,
        weight_kg: parsedWeight,
        goal_weight_kg: parsedTargetWeight,
        dob: updates.dob,
        gender: updates.gender,
        goal: goal || null,
        speed: effectiveSpeed,
        // use the effective duration we decided above (existing plan if user didn’t change it)
        duration_months: goal === 'maintain' ? null : usedDurationMonths,
        duration_weeks: planMeta ? planMeta.durationWeeks : null,
        required_weekly_change_kg: planMeta
          ? planMeta.requiredWeeklyChangeKg
          : null,
        max_safe_weekly_change_kg: planMeta
          ? planMeta.maxSafeWeeklyChangeKg
          : null,
        weight_delta_kg: planMeta ? planMeta.deltaKg : null,
      }),
    });

    let webhookJson: any = null;
    try {
      webhookJson = await resp.json();
    } catch {}

    if (!resp.ok || webhookJson?.success === false) {
      throw new Error(
        webhookJson?.message ||
          `Could not recalculate your targets (status ${resp.status}).`
      );
    }

    const { data: ntData2, error: ntErr2 } = await supabase
      .from<NutritionTargetsRow>('caltrack_nutrition_targets')
      .select('user_id,time_to_goal_months,required_weekly_change_kg')
      .eq('user_id', userId)
      .maybeSingle();

    if (ntErr2) {
      console.log('[PersonalDetails] nutrition targets refresh error', ntErr2);
    }
    setNutritionTargets(ntData2 ?? null);

    setSaveStatus('success');
    setSaveMessage(
      'Your data has been updated and your daily targets have been recalculated.'
    );
  } catch (err: any) {
    console.error('Error saving details', err);
    setSaveStatus('error');
    setSaveMessage(
      err?.message || 'Could not save and update your targets. Please try again.'
    );
  } finally {
    setSaving(false);
    setTimeout(() => {
      setSaveMessage(null);
      setSaveStatus(null);
    }, 3500);
  }
};

  // ---- picker ranges ----
  const weightMin = 30;
  const weightMax = 300;
  const heightMin = 120;
  const heightMax = 250;

  const weightStep = 0.1;
  const weightValues = useMemo(() => {
    const vals: number[] = [];
    for (let w = weightMin; w <= weightMax; w += weightStep) {
      vals.push(parseFloat(w.toFixed(1)));
    }
    return vals;
  }, [weightMin, weightMax, weightStep]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const showRenewalLine =
    subscription?.status === 'active' && !!subscription.current_period_end;

  const renewalLabel = subscription?.cancel_at_period_end ? 'Ends on' : 'Renews on';

  const planName = subLoading
    ? 'Loading…'
    : subscription?.status === 'active'
    ? planLabel(subscription?.plan_id ?? null)
    : 'Free';

  const showCancelButton = subscription?.status === 'active';

  // ---- visual theme for Pro / Free (UI only) ----
  type PlanType = 'free' | 'monthly' | 'yearly';

  const planType: PlanType =
    subscription?.status === 'active'
      ? subscription.plan_id === 'caltrack_yearly'
        ? 'yearly'
        : 'monthly'
      : 'free';

  const planTheme = useMemo(
  () => ({
    // badge
    badgeBg:
      planType === 'yearly'
        ? '#E0F2FE' // teal/sky-100
        : planType === 'monthly'
        ? '#DCFCE7' // green-100
        : '#F3F4F6', // gray-100
    badgeBorder:
      planType === 'yearly'
        ? '#0EA5E9' // teal main
        : planType === 'monthly'
        ? '#22C55E' // green-500
        : '#E5E7EB',
    badgeText:
      planType === 'yearly' || planType === 'monthly' ? '#0F172A' : '#6B7280',
    // cards
    cardBg:
      planType === 'yearly'
        ? '#ECFEFF' // very light teal
        : planType === 'monthly'
        ? '#ECFDF3' // green-50
        : '#F7F7F7',
    cardBorder:
      planType === 'yearly'
        ? '#0EA5E9'
        : planType === 'monthly'
        ? '#22C55E'
        : '#E5E7EB',
  }),
  [planType]
);

  const proBadgeText =
  planType === 'yearly'
    ? '🏆 Yearly Pro member — committed to your goals for the year.'
    : '⭐ Monthly Pro member — focused on your journey';

    // Colors for Cancel button based on plan type
const cancelBtnColors =
  planType === 'yearly'
    ? { bg: '#E0F2FE', border: '#0EA5E9', text: '#0369A1' } // teal
    : planType === 'monthly'
    ? { bg: '#ECFDF3', border: '#22C55E', text: '#065F46' } // soft green
    : { bg: '#F3F4F6', border: '#E5E7EB', text: '#6B7280' };

  const proIconColor = planType === 'yearly' ? '#0EA5E9' : '#22C55E';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.screenWrapper}>
        <Image
          source={{ uri: LOGO_URL }}
          resizeMode="contain"
          style={[
            styles.fixedLogo,
            {
              top: logoTopAdj,
              left: logoLeftAdj,
              width: logoW,
              height: logoH,
              transform: [{ translateX: logoShift }],
            },
          ]}
          pointerEvents="none"
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: topPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={styles.pageTitle}>Personal Details</Text>

          {planType !== 'free' && (
  <View
    style={[
      styles.proBadge,
      {
        backgroundColor: planTheme.badgeBg,
        borderColor: planTheme.badgeBorder,
      },
    ]}
  >
    <Text
      style={[
        styles.proBadgeText,
        { color: planTheme.badgeText },
      ]}
    >
      {proBadgeText}
    </Text>
  </View>
)}
          {/* Goal card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: planTheme.cardBg,
                borderColor: planTheme.cardBorder,
              },
            ]}
          >
            <View>
              <Text style={styles.cardLabel}>Muscle Goal</Text>
              <Text style={styles.cardValue}>{goalLabel()}</Text>

              <Text style={[styles.cardLabel, { marginTop: 4 }]}>
                Target weight:{' '}
                <Text style={styles.cardHighlight}>{goalTargetLabel} kg</Text>
              </Text>

              <Text style={[styles.cardLabel, { marginTop: 2 }]}>
                Time To Achieve Goal:{' '}
                <Text style={styles.cardHighlight}>{timeframeLabel}</Text>
              </Text>

              {goal !== 'maintain' &&
                nutritionTargets?.required_weekly_change_kg != null &&
                Number.isFinite(
                  Number(nutritionTargets.required_weekly_change_kg),
                ) && (
                  <Text style={[styles.cardLabel, { marginTop: 2 }]}>
                    Weekly Target:{' '}
                    <Text style={styles.cardHighlight}>
                      {Number(
                        nutritionTargets.required_weekly_change_kg,
                      ).toFixed(2)}{' '}
                      kg/week
                    </Text>
                  </Text>
                )}

              {goal !== 'maintain' &&
                (nutritionTargets?.required_weekly_change_kg == null ||
                  !Number.isFinite(
                    Number(nutritionTargets.required_weekly_change_kg),
                  )) &&
                !!liveMeta && (
                  <Text style={[styles.cardLabel, { marginTop: 2 }]}>
                    Required pace:{' '}
                    <Text style={styles.cardHighlight}>
                      {liveMeta.requiredWeeklyChangeKg.toFixed(2)} kg/week
                    </Text>
                  </Text>
                )}
            </View>

            <TouchableOpacity
              style={styles.changeGoalButton}
              onPress={() => {
                setSheetPlanError(null);
                setSheetGoal(goal || '');

                const fallbackTarget =
                  targetWeight ||
                  (goals?.goal_weight_kg != null ? String(goals.goal_weight_kg) : '');
                setSheetTargetWeight(goal === 'maintain' ? '' : fallbackTarget);

                const fallbackMonths = durationMonths ?? 3;
                setSheetDurationMonths(fallbackMonths);

                setGoalSheetOpen(true);
              }}
            >
              <Text style={styles.changeGoalText}>Change Goal</Text>
            </TouchableOpacity>
          </View>

          {/* Compact editable details */}
          <View style={styles.detailCard}>
            <View style={styles.detailRow2Col}>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>Current weight</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={openWeightPicker}>
                  <View style={styles.detailValueRow}>
                    <Text style={styles.detailValueText}>
                      {currentWeight || '—'}
                    </Text>
                    <Text style={styles.detailUnit}>kg</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[styles.detailCol, { marginLeft: 40 }]}>
                <Text style={styles.detailLabel}>Height</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={openHeightPicker}>
                  <View style={styles.detailValueRow}>
                    <Text style={styles.detailValueText}>{height || '—'}</Text>
                    <Text style={styles.detailUnit}>cm</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.detailRow2Col, { marginTop: 12 }]}>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>Date of birth</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={openDobPicker}>
                  <View style={styles.detailValueRow}>
                    <Text style={styles.detailValueText}>
                      {dob || 'YYYY-MM-DD'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[styles.detailCol, { marginLeft: 40 }]}>
                <Text style={styles.detailLabel}>Gender</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setGenderSheetOpen(true)}
                >
                  <View style={styles.detailValueRow}>
                    <Text style={styles.detailValueText}>
                      {gender || 'Select'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Save button */}
          <View style={styles.saveRow}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!isDirty || saving) && styles.saveButtonDisabled,
              ]}
              disabled={!isDirty || saving}
              onPress={onSave}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          {saveMessage && (
            <Text
              style={[
                styles.saveMessage,
                saveStatus === 'success' && styles.saveMessageSuccess,
                saveStatus === 'error' && styles.saveMessageError,
              ]}
            >
              {saveMessage}
            </Text>
          )}

          {/* Current plan card */}
          <View
            style={[
              styles.planCard,
              {
                backgroundColor: planTheme.cardBg,
                borderColor: planTheme.cardBorder,
              },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.planLabel}>Current plan</Text>
              <Text style={styles.planValue}>{planName}</Text>

              {showRenewalLine && (
                <Text style={styles.planMeta}>
                  {renewalLabel}{' '}
                  {formatReadableDate(
                    subscription?.current_period_end ?? null,
                  )}
                </Text>
              )}
            </View>

            {showCancelButton ? (
  <TouchableOpacity
    style={[
      styles.managePlanButton,
      styles.cancelButtonAbs, // ← anchor here
      {
        backgroundColor: cancelBtnColors.bg,
        borderColor: cancelBtnColors.border,
      },
      subLoading && { opacity: 0.55 },
    ]}
    onPress={openManageSubscription}
    disabled={subLoading}
  >
    <Text
      style={[
        styles.managePlanText,
        { color: cancelBtnColors.text },
      ]}
    >
      Cancel
    </Text>
  </TouchableOpacity>
) : (
  <View style={{ width: 1 }} />
)}
          </View>
        </ScrollView>

        {/* Goal selection bottom sheet */}
        <Modal
          visible={goalSheetOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setGoalSheetOpen(false)}
        >
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Select your goal</Text>

              <View style={styles.goalRow}>
                {(['lose', 'gain', 'maintain'] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.goalChip,
                      sheetGoal === g && styles.goalChipActive,
                    ]}
                    onPress={() => {
                      setSheetPlanError(null);
                      setSheetGoal(g);
                      if (g === 'maintain') setSheetTargetWeight('');
                      else if (!sheetDurationMonths) setSheetDurationMonths(3);
                    }}
                  >
                    <Text
                      style={[
                        styles.goalChipText,
                        sheetGoal === g && styles.goalChipTextActive,
                      ]}
                    >
                      {g === 'lose'
                        ? 'Loss'
                        : g === 'gain'
                        ? 'Gain'
                        : 'Maintain'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(sheetGoal === 'lose' || sheetGoal === 'gain') && (
                <>
                  <Text style={[styles.sheetTitle, { marginTop: 16 }]}>
                    Target weight (kg)
                  </Text>
                  <TextInput
                    style={styles.sheetInput}
                    keyboardType="decimal-pad"
                    value={sheetTargetWeight}
                    onChangeText={(v) => {
                      setSheetPlanError(null);
                      setSheetTargetWeight(v);
                    }}
                    placeholder={sheetGoal === 'lose' ? 'e.g. 75' : 'e.g. 95'}
                  />
                  <Text style={styles.sheetHelper}>
                    We&apos;ll recalculate your daily calories and macros based on
                    this target.
                  </Text>

                  <Text style={[styles.sheetTitle, { marginTop: 18 }]}>
                    How long do you want to take?
                  </Text>

                  <View style={styles.goalRowWrap}>
                    {monthOptions.map((m) => {
                      const active = sheetDurationMonths === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[
                            styles.monthChip,
                            active && styles.monthChipActive,
                          ]}
                          onPress={() => {
                            setSheetPlanError(null);
                            setSheetDurationMonths(m);
                          }}
                        >
                          <Text
                            style={[
                              styles.monthChipText,
                              active && styles.monthChipTextActive,
                            ]}
                          >
                            {m} mo
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {(() => {
                    const cw = parseNum(currentWeight);
                    const tw = parseNum(sheetTargetWeight);
                    if (cw == null || tw == null) return null;

                    if (sheetGoal === 'lose' && tw >= cw) {
                      return (
                        <Text style={styles.sheetWarn}>
                          For weight loss, target must be less than current.
                        </Text>
                      );
                    }
                    if (sheetGoal === 'gain' && tw <= cw) {
                      return (
                        <Text style={styles.sheetWarn}>
                          For weight gain, target must be greater than current.
                        </Text>
                      );
                    }

                    const meta = computePlanMeta({
                      goal: sheetGoal,
                      currentWeightKg: cw,
                      targetWeightKg: tw,
                      durationMonths: sheetDurationMonths,
                    });

                    const ok = meta.ok;

                    return (
                      <Text
                        style={[
                          styles.sheetHelper,
                          { marginTop: 10 },
                          !ok && { color: '#DC2626', fontWeight: '700' },
                        ]}
                      >
                        Required pace:{' '}
                        {meta.requiredWeeklyChangeKg.toFixed(2)} kg/week (max
                        safe: {meta.maxSafeWeeklyChangeKg.toFixed(2)} kg/week)
                        {!ok
                          ? ` • Suggested minimum: ${meta.minMonths} months`
                          : ''}
                      </Text>
                    );
                  })()}

                  {!!sheetPlanError && (
                    <Text style={styles.sheetError}>{sheetPlanError}</Text>
                  )}
                </>
              )}

              <View style={styles.pickerActionsRow}>
                <TouchableOpacity
                  onPress={() => {
                    setGoalSheetOpen(false);
                    setSheetPlanError(null);
                    setSheetGoal(goal || '');
                    setSheetTargetWeight(targetWeight);
                    setSheetDurationMonths(durationMonths ?? 3);
                  }}
                >
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleApplyGoalChange}>
                  <Text style={styles.pickerConfirm}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Weight picker */}
        <Modal
          visible={weightPickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setWeightPickerOpen(false)}
        >
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Select weight (kg)</Text>

              <Picker
                selectedValue={
                  (tempWeight ??
                    (currentWeight ? Number(currentWeight) : 70)) as number
                }
                onValueChange={(value) => setTempWeight(value as number)}
              >
                {weightValues.map((w) => (
                  <Picker.Item key={w} label={w.toFixed(1)} value={w} />
                ))}
              </Picker>

              <View style={styles.pickerActionsRow}>
                <TouchableOpacity
                  onPress={() => {
                    setWeightPickerOpen(false);
                    setTempWeight(null);
                  }}
                >
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const fallback = currentWeight ? Number(currentWeight) : 70;
                    const finalW = tempWeight ?? fallback;
                    setCurrentWeight(finalW.toFixed(1));
                    setWeightPickerOpen(false);
                    setTempWeight(null);
                  }}
                >
                  <Text style={styles.pickerConfirm}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Height picker */}
        <Modal
          visible={heightPickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setHeightPickerOpen(false)}
        >
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Select height (cm)</Text>
              <Picker
                selectedValue={
                  (tempHeight ?? (height ? Number(height) : 170)) as number
                }
                onValueChange={(value) => setTempHeight(value as number)}
              >
                {Array.from(
                  { length: heightMax - heightMin + 1 },
                  (_, i) => heightMin + i,
                ).map((h) => (
                  <Picker.Item key={h} label={`${h}`} value={h} />
                ))}
              </Picker>
              <View style={styles.pickerActionsRow}>
                <TouchableOpacity
                  onPress={() => {
                    setHeightPickerOpen(false);
                    setTempHeight(null);
                  }}
                >
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const finalH = tempHeight ?? (height ? Number(height) : 170);
                    setHeight(String(finalH));
                    setHeightPickerOpen(false);
                    setTempHeight(null);
                  }}
                >
                  <Text style={styles.pickerConfirm}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* DOB picker */}
        {Platform.OS === 'ios' && (
          <Modal
            visible={dobPickerOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setDobPickerOpen(false)}
          >
            <View style={styles.sheetBackdrop}>
              <View style={styles.sheet}>
                <Text style={styles.sheetTitle}>Select date of birth</Text>
                <DateTimePicker
                  value={
                    tempDob ??
                    (dob ? parseDateYYYYMMDD(dob) : new Date(1990, 0, 1))
                  }
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  minimumDate={new Date(1900, 0, 1)}
                  onChange={(_, selectedDate) => {
                    if (selectedDate) setTempDob(selectedDate);
                  }}
                />
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setDobPickerOpen(false);
                      setTempDob(null);
                    }}
                  >
                    <Text style={styles.pickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const finalDate =
                        tempDob ??
                        (dob
                          ? parseDateYYYYMMDD(dob)
                          : new Date(1990, 0, 1));
                      setDob(formatDateYYYYMMDD(finalDate));
                      setDobPickerOpen(false);
                      setTempDob(null);
                    }}
                  >
                    <Text style={styles.pickerConfirm}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === 'android' && dobPickerOpen && (
          <DateTimePicker
            value={dob ? parseDateYYYYMMDD(dob) : new Date(1990, 0, 1)}
            mode="date"
            display="calendar"
            maximumDate={new Date()}
            minimumDate={new Date(1900, 0, 1)}
            onChange={(event, selectedDate) => {
              if (event.type === 'set' && selectedDate) {
                setDob(formatDateYYYYMMDD(selectedDate));
              }
              setDobPickerOpen(false);
              setTempDob(null);
            }}
          />
        )}

        {/* Gender sheet */}
        <Modal
          visible={genderSheetOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setGenderSheetOpen(false)}
        >
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Select gender</Text>
              <View style={styles.goalRow}>
                {[
                  { label: 'Male', value: 'male' },
                  { label: 'Female', value: 'female' },
                  { label: 'Other', value: 'other' },
                ].map((g) => (
                  <TouchableOpacity
                    key={g.value}
                    style={[
                      styles.goalChip,
                      gender === g.value && styles.goalChipActive,
                    ]}
                    onPress={() => {
                      setGender(g.value);
                      setGenderSheetOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.goalChipText,
                        gender === g.value && styles.goalChipTextActive,
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>

        {/* Full-screen saving overlay */}
        {saving && (
          <View style={styles.savingOverlay}>
            <View style={styles.savingCard}>
              <BrandedLoader size={52} />
              <Text style={styles.savingTitle}>
                Updating your data and recalculating targets…
              </Text>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  fixedLogo: {
    position: 'absolute',
    zIndex: 9999,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    color: '#111827',
  },

  proBadge: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  proBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#D00', textAlign: 'center', paddingHorizontal: 24 },

  planCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 12,
    marginBottom: 16,
    position: 'relative',
  },
  planLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  planValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  planMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },

  managePlanButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  managePlanText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },

  cancelButtonAbs: {
    position: 'absolute',
    right: 10,
    bottom: 10,
  },

  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardLabel: { fontSize: 14, color: '#777' },
  cardValue: { marginTop: 4, fontSize: 18, fontWeight: '600' },
  cardHighlight: { fontWeight: '700', color: '#111827' },

  changeGoalButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#000',
  },
  changeGoalText: { color: '#fff', fontSize: 13, fontWeight: '500' },

  detailCard: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  detailRow2Col: {
    flexDirection: 'row',
    gap: 16,
  },
  detailCol: { flex: 1 },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    marginBottom: 4,
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  detailValueText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  detailUnit: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
  },

  saveRow: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  saveButton: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  saveMessage: {
    marginTop: 8,
    textAlign: 'center',
    color: '#4B5563',
  },
  saveMessageSuccess: { color: '#16A34A' },
  saveMessageError: { color: '#DC2626' },

  headerStreakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  headerStreakText: {
    color: '#7c2d12',
    fontWeight: '700',
  },

  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  sheetHelper: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  sheetWarn: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 10,
    fontWeight: '700',
  },
  sheetError: {
    marginTop: 10,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '800',
  },

  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalChip: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    alignItems: 'center',
  },
  goalChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  goalChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  goalChipTextActive: {
    color: '#FFFFFF',
  },

  goalRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  monthChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  monthChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  monthChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
  },

  pickerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  pickerCancel: {
    fontSize: 14,
    color: '#6B7280',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickerConfirm: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  savingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(249,250,251,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingCard: {
    width: '80%',
    maxWidth: 340,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  savingTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111827',
  },
});
