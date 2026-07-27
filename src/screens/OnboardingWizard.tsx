// src/screens/OnboardingWizard.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import supabase from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import type { RootStackParamList } from '../types/navigation';
import BrandedLoader from '../components/BrandedLoader';
import { requireEnv } from '../lib/env';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

type UnitSystem = 'metric' | 'imperial';

// Keep SpeedType ONLY for backward compatibility in DB (caltrack_profile_goals.speed)
type SpeedType = 'slow' | 'normal' | 'aggressive';

const WEBHOOK_URL = requireEnv(
  'EXPO_PUBLIC_MEAL_PLAN_WEBHOOK_URL',
  process.env.EXPO_PUBLIC_MEAL_PLAN_WEBHOOK_URL
);

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

// ---- plan helpers (months-based) ----
const MONTH_WEEKS = 4.345;
const monthOptions = [1, 2, 3, 4, 6, 9, 12];

const parseNum = (s: string) => {
  const t = (s ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

type PlanMeta = {
  deltaKg: number; // absolute
  durationMonths: number;
  durationWeeks: number;
  requiredWeeklyChangeKg: number;
  maxSafeWeeklyChangeKg: number;
  minMonths: number;
  ok: boolean;
  effectiveSpeed: SpeedType; // derived only for DB compatibility
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

  // updated: 0.5 kg/week for both lose & gain
  const maxSafe = goal === 'lose' ? 0.5 : 0.5;
  const minMonths =
    delta === 0 ? 1 : Math.ceil(delta / (maxSafe * MONTH_WEEKS));

  // map to old speed labels (ONLY for storing in DB)
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

export default function OnboardingWizard({ navigation }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');

  // canonical values are always stored in METRIC
  const [heightCm, setHeightCm] = useState<string>('');
  const [weightKg, setWeightKg] = useState<string>('');
  const [targetWeightKg, setTargetWeightKg] = useState<string>('');

  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain' | ''>('');

  // NEW: timeframe instead of speed
  const [durationMonths, setDurationMonths] = useState<number>(3);

  const [constraints, setConstraints] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // FULL-SCREEN “personalizing” overlay
  const [personalizing, setPersonalizing] = useState(false);

  // DOB picker state
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [tempDob, setTempDob] = useState<Date | null>(null);

  // ----------------- helpers: unit conversion -----------------
  const kgToLbs = (kg: number) => kg * 2.20462;
  const lbsToKg = (lbs: number) => lbs / 2.20462;
  const cmToFeetInches = (
    cm: number,
  ): { feet: number; inches: number } => {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches - feet * 12);
    return { feet, inches };
  };
  const feetInchesToCm = (feet: number, inches: number) =>
    (feet * 12 + inches) * 2.54;

  // imperial fields are just for UI
  const [imperialHeightFeet, setImperialHeightFeet] = useState('');
  const [imperialHeightInches, setImperialHeightInches] = useState('');
  const [imperialWeightLbs, setImperialWeightLbs] = useState('');
  const [imperialTargetWeightLbs, setImperialTargetWeightLbs] =
    useState('');

  const syncImperialFromMetric = () => {
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    const tw = parseFloat(targetWeightKg);

    if (!isNaN(h)) {
      const { feet, inches } = cmToFeetInches(h);
      setImperialHeightFeet(feet.toString());
      setImperialHeightInches(inches.toString());
    }
    if (!isNaN(w)) setImperialWeightLbs(kgToLbs(w).toFixed(1));
    if (!isNaN(tw))
      setImperialTargetWeightLbs(kgToLbs(tw).toFixed(1));
  };

  const syncMetricFromImperial = () => {
    const feet = parseFloat(imperialHeightFeet);
    const inches = parseFloat(imperialHeightInches);
    const lbs = parseFloat(imperialWeightLbs);
    const targetLbs = parseFloat(imperialTargetWeightLbs);

    if (!isNaN(feet) && !isNaN(inches)) {
      setHeightCm(feetInchesToCm(feet, inches).toFixed(1));
    }
    if (!isNaN(lbs)) setWeightKg(lbsToKg(lbs).toFixed(1));
    if (!isNaN(targetLbs))
      setTargetWeightKg(lbsToKg(targetLbs).toFixed(1));
  };

  const handleToggleUnits = (target: UnitSystem) => {
    if (target === unitSystem) return;
    if (target === 'imperial') syncImperialFromMetric();
    else syncMetricFromImperial();
    setUnitSystem(target);
  };

  // ----------------- load existing profile (edit case) -----------------
  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('caltrack_profile_goals')
        .select(
          `
          unit_system,
          height_cm,
          weight_kg,
          goal_weight_kg,
          dob,
          gender,
          goal,
          constraints
        `,
        )
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setUnitSystem((data.unit_system as UnitSystem) || 'metric');
        setHeightCm(data.height_cm != null ? String(data.height_cm) : '');
        setWeightKg(data.weight_kg != null ? String(data.weight_kg) : '');
        setTargetWeightKg(
          data.goal_weight_kg != null ? String(data.goal_weight_kg) : '',
        );
        setDob(data.dob || '');
        setGender((data.gender as any) || '');
        setGoal((data.goal as any) || '');
        setConstraints(data.constraints || '');

        // default timeframe
        setDurationMonths(
          data.goal === 'maintain' ? 3 : 3,
        );

        // sync imperial fields for toggle
        if (data.height_cm) {
          const { feet, inches } = cmToFeetInches(Number(data.height_cm));
          setImperialHeightFeet(String(feet));
          setImperialHeightInches(String(inches));
        }
        if (data.weight_kg) {
          setImperialWeightLbs(kgToLbs(Number(data.weight_kg)).toFixed(1));
        }
        if (data.goal_weight_kg) {
          setImperialTargetWeightLbs(
            kgToLbs(Number(data.goal_weight_kg)).toFixed(1),
          );
        }
      }
    } catch (e) {
      console.log('Error loading profile goals', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ----------------- step 3 live validation (in kg, from either unit system) -----------------
  const step3PlanMeta = useMemo(() => {
    if (goal !== 'lose' && goal !== 'gain') return null;
    if (!durationMonths) return null;

    let cwKg: number | null = null;
    let twKg: number | null = null;

    if (unitSystem === 'metric') {
      cwKg = parseNum(weightKg);
      twKg = parseNum(targetWeightKg);
    } else {
      const cwLbs = parseNum(imperialWeightLbs);
      const twLbs = parseNum(imperialTargetWeightLbs);
      cwKg = cwLbs != null ? lbsToKg(cwLbs) : null;
      twKg = twLbs != null ? lbsToKg(twLbs) : null;
    }

    if (cwKg == null || twKg == null) return null;

    if (goal === 'lose' && twKg >= cwKg) return null;
    if (goal === 'gain' && twKg <= cwKg) return null;

    return computePlanMeta({
      goal,
      currentWeightKg: cwKg,
      targetWeightKg: twKg,
      durationMonths,
    });
  }, [
    goal,
    durationMonths,
    unitSystem,
    weightKg,
    targetWeightKg,
    imperialWeightLbs,
    imperialTargetWeightLbs,
  ]);

  // ----------------- validation -----------------
  const canGoNext = () => {
    if (step === 1) {
      if (unitSystem === 'metric') return !!heightCm && !!weightKg;
      return (
        !!imperialHeightFeet &&
        !!imperialHeightInches &&
        !!imperialWeightLbs
      );
    }

    if (step === 2) return !!dob && !!gender;

    if (step === 3) {
      if (!goal) return false;

      if (goal === 'maintain') return true;

      // lose/gain requires target + timeframe and must be safe/valid
      const hasTarget =
        unitSystem === 'metric'
          ? !!targetWeightKg
          : !!imperialTargetWeightLbs;

      if (!hasTarget) return false;
      if (!durationMonths) return false;

      // compute weights in kg based on current unit system
      let cwKg: number | null = null;
      let twKg: number | null = null;

      if (unitSystem === 'metric') {
        cwKg = parseNum(weightKg);
        twKg = parseNum(targetWeightKg);
      } else {
        const cwLbs = parseNum(imperialWeightLbs);
        const twLbs = parseNum(imperialTargetWeightLbs);
        cwKg = cwLbs != null ? lbsToKg(cwLbs) : null;
        twKg = twLbs != null ? lbsToKg(twLbs) : null;
      }

      if (cwKg == null || twKg == null) return false;

      if (goal === 'lose' && twKg >= cwKg) return false;
      if (goal === 'gain' && twKg <= cwKg) return false;

      const meta = computePlanMeta({
        goal,
        currentWeightKg: cwKg,
        targetWeightKg: twKg,
        durationMonths,
      });

      return meta.ok;
    }

    return false;
  };

  const goNext = () => {
    if (!canGoNext()) return;
    if (step === 3) handleSubmit();
    else setStep((s) => (s === 1 ? 2 : 3));
  };

  const goBackStep = () => {
    if (step === 1) return;
    setStep((s) => (s === 3 ? 2 : 1));
  };

  const openDobPicker = () => {
    const base = dob ? parseDateYYYYMMDD(dob) : new Date(1990, 0, 1);
    setTempDob(base);
    setDobPickerOpen(true);
  };

  // ----------------- submit: save + webhook -----------------
  const handleSubmit = async () => {
    if (!user) return;
    setSaving(true);
    setPersonalizing(true);

    // compute metric values locally so we don't depend on async state updates
    let metricHeight: number | null = heightCm ? parseFloat(heightCm) : null;
    let metricWeight: number | null = weightKg ? parseFloat(weightKg) : null;
    let metricGoalWeight: number | null = targetWeightKg
      ? parseFloat(targetWeightKg)
      : null;

    if (unitSystem === 'imperial') {
      const feet = parseFloat(imperialHeightFeet);
      const inches = parseFloat(imperialHeightInches);
      const lbs = parseFloat(imperialWeightLbs);
      const targetLbs = parseFloat(imperialTargetWeightLbs);

      if (!isNaN(feet) && !isNaN(inches)) {
        metricHeight = feetInchesToCm(feet, inches);
        setHeightCm(metricHeight.toFixed(1));
      } else metricHeight = null;

      if (!isNaN(lbs)) {
        metricWeight = lbsToKg(lbs);
        setWeightKg(metricWeight.toFixed(1));
      } else metricWeight = null;

      if (!isNaN(targetLbs)) {
        metricGoalWeight = lbsToKg(targetLbs);
        setTargetWeightKg(metricGoalWeight.toFixed(1));
      } else metricGoalWeight = null;
    }

    // For maintain, set goal_weight to current weight (like PersonalDetails)
    if (goal === 'maintain') {
      metricGoalWeight = metricWeight;
    }

    // For lose/gain, derive compatibility speed + meta and validate safety
    let effectiveSpeed: SpeedType | null = null;
    let meta: PlanMeta | null = null;

    if (goal === 'lose' || goal === 'gain') {
      if (metricWeight == null || metricGoalWeight == null) {
        setSaving(false);
        setPersonalizing(false);
        Alert.alert('Error', 'Please enter valid weight values.');
        return;
      }

      // direction sanity
      if (goal === 'lose' && metricGoalWeight >= metricWeight) {
        setSaving(false);
        setPersonalizing(false);
        Alert.alert(
          'Target weight',
          'For weight loss, target weight must be less than current weight.',
        );
        return;
      }
      if (goal === 'gain' && metricGoalWeight <= metricWeight) {
        setSaving(false);
        setPersonalizing(false);
        Alert.alert(
          'Target weight',
          'For weight gain, target weight must be greater than current weight.',
        );
        return;
      }

      meta = computePlanMeta({
        goal,
        currentWeightKg: metricWeight,
        targetWeightKg: metricGoalWeight,
        durationMonths,
      });

      if (!meta.ok) {
        setSaving(false);
        setPersonalizing(false);
        Alert.alert(
          'Timeframe too fast',
          `This timeframe is too fast. The fastest recommended timeframe is ${meta.minMonths} month${
            meta.minMonths === 1 ? '' : 's'
          }.`,
        );
        return;
      }

      effectiveSpeed = meta.effectiveSpeed;
    } else if (goal === 'maintain') {
      effectiveSpeed = 'normal';
    }

    // payload that matches the table columns ONLY
    const dbPayload = {
      user_id: user.id,
      unit_system: unitSystem,
      height_cm: metricHeight,
      weight_kg: metricWeight,
      goal_weight_kg: metricGoalWeight,
      dob: dob || null,
      gender: gender || null,
      goal: goal || null,
      // store speed ONLY for backward compatibility
      speed: effectiveSpeed,
      constraints: constraints || null,
    };

    // payload for webhook (includes email + plan data)
    const webhookPayload = {
      ...dbPayload,
      email: (user as any).email ?? null,

      // NEW plan fields consumed by your n8n macro calculator
      duration_months: goal === 'maintain' ? null : durationMonths,
      duration_weeks: meta ? meta.durationWeeks : goal === 'maintain' ? null : durationMonths * MONTH_WEEKS,
      required_weekly_change_kg: meta ? meta.requiredWeeklyChangeKg : null,
      max_safe_weekly_change_kg: meta ? meta.maxSafeWeeklyChangeKg : null,
      weight_delta_kg: meta ? meta.deltaKg : null,
    };

    try {
      // 1) Upsert into DB
      const { error } = await supabase
        .from('caltrack_profile_goals')
        .upsert(dbPayload, { onConflict: 'user_id' });

      if (error) throw error;

      // 2) Call webhook (WAIT)
      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      if (!resp.ok) {
        throw new Error(`Personalization failed (status ${resp.status})`);
      }

      // 3) Navigate AFTER webhook
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs' as any,
            params: { screen: 'Home' },
          },
        ],
      });
    } catch (e: any) {
      console.log('Save onboarding error', e);
      Alert.alert(
        'Error',
        e?.message ||
          'Could not personalize your dashboard. Please try again.',
      );
    } finally {
      setSaving(false);
      setPersonalizing(false);
    }
  };

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text>Please sign in again.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading your details…</Text>
      </View>
    );
  }

  const totalSteps = 3;

  return (
  <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  >
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* Progress bar */}
      <View style={styles.progressRow}>
          {Array.from({ length: totalSteps }).map((_, idx) => {
            const current = idx + 1;
            const active = current <= step;
            return (
              <View
                key={current}
                style={[
                  styles.progressBar,
                  active && styles.progressBarActive,
                ]}
              />
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 1 */}
          {step === 1 && (
            <>
              <Text style={styles.title}>Your body stats</Text>
              <Text style={styles.subtitle}>
                Enter your current weight and height. You can switch between
                metric and imperial units.
              </Text>

              {/* Unit toggle */}
              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => handleToggleUnits('metric')}
                  style={[
                    styles.toggleChip,
                    unitSystem === 'metric' && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      unitSystem === 'metric' && styles.toggleChipTextActive,
                    ]}
                  >
                    Metric (kg / cm)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleToggleUnits('imperial')}
                  style={[
                    styles.toggleChip,
                    unitSystem === 'imperial' && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      unitSystem === 'imperial' && styles.toggleChipTextActive,
                    ]}
                  >
                    Imperial (lbs / ft)
                  </Text>
                </Pressable>
              </View>

              {unitSystem === 'metric' ? (
                <>
                  <Text style={styles.label}>Current weight (kg)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={weightKg}
                    onChangeText={setWeightKg}
                    placeholder="e.g. 72"
                  />

                  <Text style={styles.label}>Height (cm)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={heightCm}
                    onChangeText={setHeightCm}
                    placeholder="e.g. 175"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Current weight (lbs)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={imperialWeightLbs}
                    onChangeText={setImperialWeightLbs}
                    placeholder="e.g. 160"
                  />

                  <Text style={styles.label}>Height (feet & inches)</Text>
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, styles.inputHalf]}
                      keyboardType="decimal-pad"
                      value={imperialHeightFeet}
                      onChangeText={setImperialHeightFeet}
                      placeholder="ft"
                    />
                    <View style={{ width: 10 }} />
                    <TextInput
                      style={[styles.input, styles.inputHalf]}
                      keyboardType="decimal-pad"
                      value={imperialHeightInches}
                      onChangeText={setImperialHeightInches}
                      placeholder="in"
                    />
                  </View>
                </>
              )}
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <Text style={styles.title}>Basic info</Text>
              <Text style={styles.subtitle}>
                Your age and gender help us calculate a more accurate daily
                target.
              </Text>

              <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={openDobPicker}>
                <View style={[styles.input, { justifyContent: 'center' }]}>
                  <Text
                    style={
                      dob ? styles.dateValueText : styles.datePlaceholderText
                    }
                  >
                    {dob || '1995-04-21'}
                  </Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.label}>Gender</Text>
              <View style={styles.chipRow}>
                {(['male', 'female', 'other'] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setGender(g)}
                    style={[styles.chip, gender === g && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        gender === g && styles.chipTextActive,
                      ]}
                    >
                      {g === 'male' ? 'Male' : g === 'female' ? 'Female' : 'Other'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <Text style={styles.title}>Your body goal</Text>
              <Text style={styles.subtitle}>
                Tell us what you want to achieve so we can set the right daily
                targets for calories, protein, carbs and fats.
              </Text>

              <Text style={styles.label}>Goal</Text>
              <View style={styles.chipRow}>
                {(['lose', 'maintain', 'gain'] as const).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setGoal(g)}
                    style={[styles.chip, goal === g && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        goal === g && styles.chipTextActive,
                      ]}
                    >
                      {g === 'lose' ? 'Lose weight' : g === 'maintain' ? 'Maintain' : 'Gain weight'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {(goal === 'lose' || goal === 'gain') && (
                <>
                  <Text style={styles.label}>
                    Target weight ({unitSystem === 'metric' ? 'kg' : 'lbs'})
                  </Text>

                  {unitSystem === 'metric' ? (
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={targetWeightKg}
                      onChangeText={setTargetWeightKg}
                      placeholder={goal === 'lose' ? 'e.g. 70' : 'e.g. 90'}
                    />
                  ) : (
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={imperialTargetWeightLbs}
                      onChangeText={setImperialTargetWeightLbs}
                      placeholder={goal === 'lose' ? 'e.g. 154' : 'e.g. 198'}
                    />
                  )}

                  <Text style={styles.helper}>
                    We’ll base your calorie plan on moving from your current
                    weight to this target.
                  </Text>

                  <Text style={styles.label}>Timeframe (months)</Text>
                  <View style={styles.monthRow}>
                    {monthOptions.map((m) => {
                      const active = durationMonths === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setDurationMonths(m)}
                          style={[styles.monthChip, active && styles.monthChipActive]}
                        >
                          <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
                            {m} mo
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* live validation – works for metric & imperial */}
                  {(() => {
                    if (goal !== 'lose' && goal !== 'gain') return null;
                    if (!durationMonths) return null;

                    let cwKg: number | null = null;
                    let twKg: number | null = null;

                    if (unitSystem === 'metric') {
                      cwKg = parseNum(weightKg);
                      twKg = parseNum(targetWeightKg);
                    } else {
                      const cwLbs = parseNum(imperialWeightLbs);
                      const twLbs = parseNum(imperialTargetWeightLbs);
                      cwKg = cwLbs != null ? lbsToKg(cwLbs) : null;
                      twKg = twLbs != null ? lbsToKg(twLbs) : null;
                    }

                    if (cwKg == null || twKg == null) return null;

                    if (goal === 'lose' && twKg >= cwKg) {
                      return (
                        <Text style={styles.warnText}>
                          For weight loss, target must be less than current.
                        </Text>
                      );
                    }
                    if (goal === 'gain' && twKg <= cwKg) {
                      return (
                        <Text style={styles.warnText}>
                          For weight gain, target must be greater than current.
                        </Text>
                      );
                    }

                    const meta = computePlanMeta({
                      goal,
                      currentWeightKg: cwKg,
                      targetWeightKg: twKg,
                      durationMonths,
                    });

                    const ok = meta.ok;

                    return (
                      <Text
                        style={[
                          styles.helper,
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
                </>
              )}

              <Text style={styles.label}>Any health constraints? (optional)</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={constraints}
                onChangeText={setConstraints}
                placeholder="e.g. no sugar, low salt, lactose-free…"
                multiline
              />
            </>
          )}

          {/* Navigation buttons */}
          <View style={styles.inlineNavRow}>
            <View style={styles.footerLeft}>
              {step > 1 ? (
                <Pressable onPress={goBackStep} style={styles.secondaryBtn}>
                  <Ionicons name="arrow-back-outline" size={18} color="#111827" />
                  <Text style={styles.secondaryBtnText}>Back</Text>
                </Pressable>
              ) : (
                <View style={{ height: 44 }} />
              )}
            </View>

            <View style={styles.footerRight}>
              <Pressable
                onPress={goNext}
                disabled={!canGoNext() || saving}
                style={[
                  styles.primaryBtn,
                  (!canGoNext() || saving) && styles.btnDisabled,
                ]}
              >
                {saving ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.primaryBtnText}>Saving…</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>
                      {step === totalSteps ? 'Finish' : 'Next'}
                    </Text>
                    <Ionicons name="arrow-forward-outline" size={18} color="#fff" />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* FULL-SCREEN PERSONALIZING OVERLAY */}
        {personalizing && (
  <View style={styles.personalizingOverlay}>
    <View style={styles.personalizingCard}>
      <BrandedLoader />
      <Text style={styles.personalizingTitle}>
        Personalizing your dashboard…
      </Text>
      <Text style={styles.personalizingSubtitle}>
        We&apos;re calculating your daily calories, protein, carbs and fats
        based on your answers.
      </Text>
    </View>
  </View>
)}
        {/* DOB picker: iOS sheet */}
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
                    tempDob ?? (dob ? parseDateYYYYMMDD(dob) : new Date(1990, 0, 1))
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
                        (dob ? parseDateYYYYMMDD(dob) : new Date(1990, 0, 1));
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

        {/* DOB picker: Android dialog */}
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 6,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  progressBarActive: {
    backgroundColor: '#111827',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 120,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  helper: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 10,
  },
  warnText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 10,
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  dateValueText: {
    fontSize: 14,
    color: '#111827',
  },
  datePlaceholderText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputHalf: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toggleChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  toggleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  toggleChipTextActive: {
    color: '#FFFFFF',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },

  monthRow: {
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

  inlineNavRow: {
    marginTop: 24,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLeft: {
    flex: 1,
  },
  footerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: {
    color: '#111827',
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalizingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(249, 250, 251, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalizingCard: {
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
  personalizingTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  personalizingSubtitle: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    color: '#6B7280',
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
});
