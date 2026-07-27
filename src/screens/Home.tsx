// src/screens/Home.tsx
import React, {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Platform,
  Image,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Svg, { Circle } from 'react-native-svg';

import supabase from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import type { RootTabScreenProps } from '../types/navigation';
import BrandedLoader from '../components/BrandedLoader';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import SubscribePopup from '../components/SubscribePopup';
import { requireEnv } from '../lib/env';

const WEBHOOK_URL = requireEnv(
  'EXPO_PUBLIC_MEAL_ANALYSIS_WEBHOOK_URL',
  process.env.EXPO_PUBLIC_MEAL_ANALYSIS_WEBHOOK_URL
);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const headerH = 56;

const LOGO_URL =
  'https://dunbmrbhucjzdkhtunew.supabase.co/storage/v1/object/public/logos/y-manual.png';

// --- Debug helper ---
const LOG = (...args: any[]) => console.log('[Home]', ...args);

type Props = RootTabScreenProps<'Home'>;

type PickedFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

type NutritionTargetsRow = {
  user_id: string;
  calories_target_kcal: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
};

type DayPill = {
  key: string; // 'YYYY-MM-DD'
  weekday: string;
  dayNum: number;
  isToday: boolean;
};

type MealTag = 'breakfast' | 'snack' | 'lunch' | 'dinner';

type MealRow = {
  id: string;
  user_id: string;
  eaten_at: string; // date
  image_url: string | null;
  calories_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  meal_tag: MealTag | null;
  created_at: string;
};

type DailyIntakeRow = {
  user_id: string;
  day: string; // date
  calories_consumed_kcal: number | null;
  protein_consumed_g: number | null;
  carbs_consumed_g: number | null;
  fat_consumed_g: number | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  time_zone: string | null;
};

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Build current week: Monday → Sunday
const buildDayPills = (): DayPill[] => {
  const today = new Date(); // DON'T zero hours here

  const dayIdx = today.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = (dayIdx + 6) % 7; // how many days to go back to Monday

  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);

  const pills: DayPill[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);

    pills.push({
      key: d.toISOString().slice(0, 10), // matches DB keys
      weekday: WEEKDAYS_SHORT[d.getDay()],
      dayNum: d.getDate(),
      isToday: d.toDateString() === today.toDateString(),
    });
  }
  return pills;
};

/* --------- Circular progress ring (for calories/macros) --------- */
const ProgressCircle: React.FC<{
  size?: number;
  strokeWidth?: number;
  progress: number; // 0..1 (consumed / target)
  color: string;
}> = ({ size = 64, strokeWidth = 6, progress, color }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(progress, 1));
  const strokeDashoffset = circumference * (1 - clamped);

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
};

export default function Home({ navigation }: Props) {
  const { user, isSubscribed, refreshSubscription } = useAuth();

  const [subPopupOpen, setSubPopupOpen] = useState(false);

  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const dayPills = useMemo(() => buildDayPills(), []);
  const todayDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

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

  // --- login streak ---
  const [loginStreak, setLoginStreak] = useState<number | null>(null);
  const [longestStreak, setLongestStreak] = useState<number | null>(null);
  const [streakLoading, setStreakLoading] = useState(false);

  const syncLoginStreak = useCallback(async () => {
    if (!user) return;
    setStreakLoading(true);
    try {
      const { data, error } = await supabase.rpc('caltrack_touch_streak', {
        p_user: user.id,
      });

      if (error) throw error;

      const row: any = Array.isArray(data) ? data?.[0] : data;
      if (row) {
        const current =
          row.v_streak ?? row.login_streak ?? row.current_streak ?? 0;
        const longest =
          row.v_longest ?? row.longest_streak ?? row.best_streak ?? 0;

        setLoginStreak(current);
        setLongestStreak(longest);
      }
    } catch (e) {
      console.log('[Home] syncLoginStreak error', e);
    } finally {
      setStreakLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      syncLoginStreak();
    }
  }, [user, syncLoginStreak]);

  useFocusEffect(
    useCallback(() => {
      if (user) syncLoginStreak();
      return () => {};
    }, [user, syncLoginStreak])
  );

  // --- header: streak pill only ---
  useLayoutEffect(() => {
    const isWebHeader = Platform.OS === 'web';

    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,

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

      headerLeft: () => null,

      headerRight: () =>
        user ? (
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
  }, [navigation, user, loginStreak, streakLoading]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- upload/convert state ---
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);

  // --- meal tag modal ---
  const [mealTagModalOpen, setMealTagModalOpen] = useState(false);
  const [pendingMealTag, setPendingMealTag] = useState<MealTag | null>(null);

  // confirm popup after image + label chosen
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const resetPicked = () => {
    setFile(null);
    setFileSize(null);
    setReady(false);
    setErrorMsg(null);

    setPendingMealTag(null);
    setMealTagModalOpen(false);
    setConfirmModalOpen(false);
  };

  // only subscribed users can pick
  const canPickFile = !!user && isSubscribed && !processing;

  const canConvert = useMemo(
    () =>
      !!user &&
      isSubscribed &&
      !!file &&
      ready &&
      !!pendingMealTag &&
      !processing,
    [user, isSubscribed, file, ready, pendingMealTag, processing]
  );

  useEffect(() => {
    LOG('state', {
      user: !!user,
      isSubscribed,
      file: !!file ? file.name || 'file' : null,
      ready,
      processing,
      pendingMealTag,
      canPickFile,
      canConvert,
    });
  }, [
    user,
    isSubscribed,
    file,
    ready,
    processing,
    pendingMealTag,
    canPickFile,
    canConvert,
  ]);

  const getRootNav = () => navigation.getParent() || (navigation as any);

  const signInGate = (
    <View style={[styles.centered, { paddingTop: headerH + 20 }]}>
      <Text style={styles.title}>CalTrack</Text>

      <Pressable
        onPress={() => {
          const rootNav = getRootNav();
          (rootNav as any).navigate('Auth');
        }}
        style={[styles.primaryBtn, styles.btnWide]}
      >
        <Text style={styles.primaryBtnText}>Sign In</Text>
      </Pressable>

      <Text style={{ marginTop: 8 }}>
        Don’t have an account?{' '}
        <Text
          style={{ color: '#2563EB', fontWeight: '600' }}
          onPress={() => {
            const rootNav = getRootNav();
            (rootNav as any).navigate('SignUp');
          }}
        >
          Create account
        </Text>
      </Text>
    </View>
  );

  // --------------- Profile (extra user info) ---------------
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from<ProfileRow>('caltrack_profiles')
          .select('id, full_name, email, time_zone')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.log('[Home] loadProfile error', error);
          return;
        }

        setProfile(data ?? null);
      } catch (e) {
        console.log('[Home] loadProfile exception', e);
      }
    };

    loadProfile();
  }, [user]);

  // --------------- Nutrition targets ---------------
  const [targets, setTargets] = useState<NutritionTargetsRow | null>(null);
  const [targetsLoading, setTargetsLoading] = useState(false);

  const loadTargets = useCallback(async () => {
    if (!user) {
      setTargets(null);
      return;
    }

    setTargetsLoading(true);
    try {
      const { data, error } = await supabase
        .from<NutritionTargetsRow>('caltrack_nutrition_targets')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setTargets(data ?? null);
    } catch (e) {
      console.log('[Home] loadTargets error', e);
      setTargets(null);
    } finally {
      setTargetsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTargets();
    } else {
      setTargets(null);
    }
  }, [user, loadTargets]);

  // --------------- Today's meals ---------------
  const [recentMeals, setRecentMeals] = useState<MealRow[]>([]);
  const [recentMealsLoading, setRecentMealsLoading] = useState(false);

  const loadRecentMeals = useCallback(async () => {
    if (!user) {
      setRecentMeals([]);
      return;
    }

    setRecentMealsLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from<MealRow>('caltrack_meals')
        .select('*')
        .eq('user_id', user.id)
        .eq('eaten_at', todayStr)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentMeals(data ?? []);
    } catch (e) {
      console.log('[Home] loadRecentMeals error', e);
      setRecentMeals([]);
    } finally {
      setRecentMealsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadRecentMeals();
    }
  }, [user, loadRecentMeals]);

  // --------------- Today's total intake (daily_intake) ---------------
  const [dailyIntake, setDailyIntake] = useState<DailyIntakeRow | null>(null);
  const [dailyIntakeLoading, setDailyIntakeLoading] = useState(false);

  const loadDailyIntake = useCallback(async () => {
    if (!user) {
      setDailyIntake(null);
      return;
    }
    setDailyIntakeLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from<DailyIntakeRow>('caltrack_daily_intake')
        .select('*')
        .eq('user_id', user.id)
        .eq('day', todayStr)
        .maybeSingle();

      if (error) throw error;
      setDailyIntake(data ?? null);
    } catch (e) {
      console.log('[Home] loadDailyIntake error', e);
      setDailyIntake(null);
    } finally {
      setDailyIntakeLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadDailyIntake();
    }
  }, [user, loadDailyIntake]);

  // --------------- Weekly intake (Mon → today) ---------------
  const [weeklyIntake, setWeeklyIntake] = useState<
    Record<string, DailyIntakeRow>
  >({});

  const loadWeeklyIntake = useCallback(async () => {
    if (!user) {
      setWeeklyIntake({});
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayIdx = today.getDay();
    const diffToMonday = (dayIdx + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);

    const mondayStr = monday.toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    try {
      const { data, error } = await supabase
        .from<DailyIntakeRow>('caltrack_daily_intake')
        .select('*')
        .eq('user_id', user.id)
        .gte('day', mondayStr)
        .lte('day', todayStr);

      if (error) throw error;

      const map: Record<string, DailyIntakeRow> = {};
      (data ?? []).forEach((row) => {
        if (!row.day) return;

        const key =
          typeof row.day === 'string'
            ? row.day.slice(0, 10)
            : new Date(row.day as any).toISOString().slice(0, 10);

        map[key] = row;
      });

      setWeeklyIntake(map);
      console.log('[Home] weeklyIntake keys:', Object.keys(map));
    } catch (e) {
      console.log('[Home] loadWeeklyIntake error', e);
      setWeeklyIntake({});
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadWeeklyIntake();
    } else {
      setWeeklyIntake({});
    }
  }, [user, loadWeeklyIntake]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        refreshSubscription();

        loadTargets();
        loadRecentMeals();
        loadDailyIntake();
        loadWeeklyIntake();
      }
      return () => {};
    }, [
      user,
      refreshSubscription,
      loadTargets,
      loadRecentMeals,
      loadDailyIntake,
      loadWeeklyIntake,
    ])
  );

  // --------------- Image picking helpers ---------------
  const handlePickedImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!user) {
      setErrorMsg('Please sign in to upload an image.');
      return;
    }
    if (!isSubscribed) {
      setErrorMsg('Subscribe to upload and analyze meals.');
      return;
    }

    resetPicked();
    setErrorMsg(null);

    let uri = asset.uri;
    let name = asset.fileName ?? 'photo.jpg';
    let mimeType =
      asset.type === 'image'
        ? 'image/jpeg'
        : (asset as any).mimeType || 'image/jpeg';

    if (uri.startsWith('content://')) {
      try {
        const safe = name.replace(/[^\w.-]/g, '_');
        const dest =
          (FileSystem.cacheDirectory || FileSystem.documentDirectory!) + safe;
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      } catch {}
    }

    let size: number | null = asset.fileSize ?? null;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && typeof info.size === 'number') size = info.size;
    } catch {}

    if (size != null && size > MAX_BYTES) {
      setErrorMsg('Image must be 10 MB or less.');
      return;
    }

    const picked: PickedFile = { uri, name, mimeType, size };
    setFile(picked);
    setFileSize(size);
    setReady(true);

    setPendingMealTag(null);
    setMealTagModalOpen(true);
  };

  const pickFromGallery = async () => {
    if (!user) {
      setErrorMsg('Please sign in to upload an image.');
      return;
    }
    if (!isSubscribed) {
      setErrorMsg('Subscribe to upload and analyze meals.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('We need access to your photos to continue.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;

    await handlePickedImage(result.assets[0]);
    setSourceSheetOpen(false);
  };

  const takePhoto = async () => {
    if (!user) {
      setErrorMsg('Please sign in to upload an image.');
      return;
    }
    if (!isSubscribed) {
      setErrorMsg('Subscribe to upload and analyze meals.');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('We need camera access to continue.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;

    await handlePickedImage(result.assets[0]);
    setSourceSheetOpen(false);
  };

  // --------------- Analyze food (call webhook + navigate) ---------------
  const analyzeFood = async () => {
    if (processing || !file || !user) return;

    if (!isSubscribed) {
      setErrorMsg('Subscribe to upload and analyze meals.');
      return;
    }

    if (!pendingMealTag) {
      setMealTagModalOpen(true);
      return;
    }

    setConfirmModalOpen(false);
    setProcessing(true);

    try {
      const form = new FormData();

      const authEmail = (user as any).email ?? '';
      const profileEmail = profile?.email ?? '';

      form.append('user_id', user.id);
      form.append('user_email', profileEmail || authEmail);
      form.append('user_full_name', profile?.full_name ?? '');
      form.append('user_time_zone', profile?.time_zone ?? '');

      form.append('login_streak', String(loginStreak ?? 0));
      form.append('longest_streak', String(longestStreak ?? 0));

      form.append('meal_tag', pendingMealTag);
      form.append('file_name', file.name ?? 'image.jpg');

      const maybeWebBlob: any = (file as any)?.file;
      if (Platform.OS === 'web' && maybeWebBlob instanceof Blob) {
        form.append('file', maybeWebBlob, file.name || 'image.jpg');
      } else {
        form.append('file', {
          uri: file.uri,
          name: file.name || 'image.jpg',
          type: file.mimeType || 'image/jpeg',
        } as any);
      }

      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json' },
      });

      const status = resp.status;
      const raw = await resp.text();

      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}

      console.log('[Home] webhook response:', json);

      if (resp.ok) {
        const arr = Array.isArray(json) ? json : json ? [json] : [];
        const payload = arr[0] || null;

        console.log('[Home] payload for navigation:', payload);

        resetPicked();
        setProcessing(false);
        loadRecentMeals();
        loadDailyIntake();
        loadWeeklyIntake();

        if (payload) {
          const meal = payload.meal ?? payload;
          const breakdown = payload.breakdown ?? null;

          const rootNav = navigation.getParent() || navigation;
          (rootNav as any).navigate('MealAnalysis', {
            meal,
            breakdown,
          });
        } else {
          setSuccessMsg(
            json?.message || 'Image sent for calorie analysis successfully.'
          );
          setTimeout(() => setSuccessMsg(null), 6000);
        }
      } else {
        setProcessing(false);
        setErrorMsg(
          json?.error || `Request failed (${status}). Please try again.`
        );
      }
    } catch (e: any) {
      setProcessing(false);
      setErrorMsg(e?.message ?? 'Analysis failed.');
    }
  };

  const topPad = headerH + (Platform.OS === 'web' ? 20 : 60);

  const fmtMB = (bytes?: number | null) =>
    bytes == null ? '' : ` (${(bytes / (1024 * 1024)).toFixed(2)} MB)`;

  const fmtInt = (n?: number | null) =>
    n == null ? '—' : Math.round(Number(n)).toString();

  const fmtTime = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12;
    if (h === 0) h = 12;
    const mm = m.toString().padStart(2, '0');
    return `${h}:${mm}${ampm}`;
  };

  // --------------- Derived "left" + progress values ---------------
  const totals = useMemo(() => {
    const calTarget = targets?.calories_target_kcal ?? 0;
    const pTarget = targets?.protein_target_g ?? 0;
    const cTarget = targets?.carbs_target_g ?? 0;
    const fTarget = targets?.fat_target_g ?? 0;

    const calCons = dailyIntake?.calories_consumed_kcal ?? 0;
    const pCons = dailyIntake?.protein_consumed_g ?? 0;
    const cCons = dailyIntake?.carbs_consumed_g ?? 0;
    const fCons = dailyIntake?.fat_consumed_g ?? 0;

    const mk = (target: number, consumed: number) => ({
      left: Math.max(target - consumed, 0),
      progress: target > 0 ? consumed / target : 0,
    });

    const cal = mk(calTarget, calCons);
    const prot = mk(pTarget, pCons);
    const carbs = mk(cTarget, cCons);
    const fat = mk(fTarget, fCons);

    return {
      caloriesTarget: calTarget,
      caloriesConsumed: calCons,
      caloriesLeft: cal.left,
      caloriesProgress: cal.progress,

      proteinTarget: pTarget,
      proteinConsumed: pCons,
      proteinLeft: prot.left,
      proteinProgress: prot.progress,

      carbsTarget: cTarget,
      carbsConsumed: cCons,
      carbsLeft: carbs.left,
      carbsProgress: carbs.progress,

      fatTarget: fTarget,
      fatConsumed: fCons,
      fatLeft: fat.left,
      fatProgress: fat.progress,
    };
  }, [targets, dailyIntake]);

  const green = '#22C55E';

  const isCaloriesComplete = totals.caloriesProgress >= 1;
  const isProteinComplete = totals.proteinProgress >= 1;
  const isCarbsComplete = totals.carbsProgress >= 1;
  const isFatComplete = totals.fatProgress >= 1;

  const caloriesColor = isCaloriesComplete ? green : '#F97316';
  const proteinColor = isProteinComplete ? green : '#EF4444';
  const carbsColor = isCarbsComplete ? green : '#F59E0B';
  const fatColor = isFatComplete ? green : '#3B82F6';

  const calorieRingProgress = Math.max(
    0,
    Math.min(totals.caloriesProgress || 0, 1)
  );

  const calorieRingColor = (() => {
    if (!targets || !totals.caloriesTarget) return '#E5E7EB';

    const p = totals.caloriesProgress || 0;

    if (p >= 1.1) return '#EF4444';
    if (p >= 0.9) return green;
    if (p >= 0.5) return '#F97316';
    return '#9CA3AF';
  })();

  const isCaloriesOnTrack =
    (totals.caloriesProgress || 0) >= 0.9 &&
    (totals.caloriesProgress || 0) <= 1.1;
  const isCaloriesOver = (totals.caloriesProgress || 0) > 1.1;

  useEffect(() => {
    if (!user) {
      const rootNav = navigation.getParent() || (navigation as any);
      (rootNav as any).reset({
        index: 0,
        routes: [{ name: 'Auth' as never }],
      });
    }
  }, [user, navigation]);

  const disableInteraction = processing;
  const isOverlayOpen = mealTagModalOpen || processing || confirmModalOpen;

  return (
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
  showsVerticalScrollIndicator={false}
  persistentScrollbar={false}
  indicatorStyle={Platform.OS === 'ios' ? 'black' : undefined}
  keyboardShouldPersistTaps="handled"
  scrollEventThrottle={16}
  pointerEvents={disableInteraction ? 'none' : 'auto'}
>
        {!user ? (
          signInGate
        ) : (
          <>
            {/* Date strip */}
            <View style={styles.dayStripWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.dayStripScroll} // ✅ added
                contentContainerStyle={styles.dayStripContent} // ✅ updated
              >
                {dayPills.map((pill) => {
                  const isToday = pill.isToday;

                  const pillDate = new Date(pill.key);
                  pillDate.setHours(0, 0, 0, 0);

                  const isPast = pillDate.getTime() < todayDate.getTime();
                  const isFuture = pillDate.getTime() > todayDate.getTime();

                  return (
                    <View key={pill.key} style={styles.dayPill}>
                      <Text
                        style={[
                          styles.dayWeekLabel,
                          isToday && styles.dayWeekLabelToday,
                        ]}
                      >
                        {pill.weekday}
                      </Text>

                      {isToday ? (
                        <View style={styles.todayPillWrapper}>
                          <ProgressCircle
                            size={40}
                            strokeWidth={3}
                            progress={calorieRingProgress}
                            color={calorieRingColor}
                          />
                          <View style={styles.todayPillInner}>
                            <Text
                              style={[
                                styles.dayNumberText,
                                styles.dayNumberTextToday,
                                isCaloriesOnTrack && { color: green },
                                isCaloriesOver && { color: '#EF4444' },
                              ]}
                            >
                              {pill.dayNum}
                            </Text>
                          </View>
                        </View>
                      ) : isPast ? (
                        (() => {
                          const intake = weeklyIntake[pill.key];
                          const hasRow = !!intake;
                          const consumedRaw = intake?.calories_consumed_kcal;
                          const consumed =
                            consumedRaw == null ? 0 : Number(consumedRaw);
                          const targetCalories = Number(
                            targets?.calories_target_kcal ?? 0
                          );

                          let outerStyles: any[] = [styles.dayNumberOuter];

                          if (!hasRow) {
                            outerStyles.push(styles.dayNumberOuterDotted);
                          } else if (targetCalories > 0) {
                            const progress = consumed / targetCalories;
                            if (progress >= 0.9 && progress <= 1.1) {
                              outerStyles.push(styles.dayNumberOuterHit);
                            } else {
                              outerStyles.push(styles.dayNumberOuterMiss);
                            }
                          } else {
                            outerStyles.push(styles.dayNumberOuterMiss);
                          }

                          return (
                            <View style={outerStyles}>
                              <Text style={styles.dayNumberText}>
                                {pill.dayNum}
                              </Text>
                            </View>
                          );
                        })()
                      ) : (
                        <View
                          style={[
                            styles.dayNumberOuter,
                            styles.dayNumberOuterFuture,
                          ]}
                        >
                          <Text style={styles.dayNumberText}>{pill.dayNum}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {/* Meal tag modal */}
            <Modal visible={mealTagModalOpen} animationType="fade" transparent>
              <View style={styles.sheetBackdrop}>
                <View style={styles.tagSheet}>
                  <Text style={styles.tagSheetTitle}>Label this meal</Text>

                  <View style={styles.tagInlineRow}>
                    {(['breakfast', 'snack', 'lunch', 'dinner'] as MealTag[]).map(
                      (t) => {
                        const active = pendingMealTag === t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => {
                              setPendingMealTag(t);
                              setMealTagModalOpen(false);
                              setConfirmModalOpen(true);
                            }}
                            style={[styles.tagChip, active && styles.tagChipActive]}
                          >
                            <Text
                              style={[
                                styles.tagChipText,
                                active && styles.tagChipTextActive,
                              ]}
                            >
                              {t.toUpperCase()}
                            </Text>
                          </Pressable>
                        );
                      }
                    )}
                  </View>
                </View>
              </View>
            </Modal>

            {/* Confirm popup after image + label */}
            <Modal visible={confirmModalOpen} animationType="fade" transparent>
              <View style={styles.sheetBackdrop}>
                <View style={styles.confirmSheet}>
                  {pendingMealTag && (
                    <Text style={styles.confirmLabel}>
                      {pendingMealTag.toUpperCase()}
                    </Text>
                  )}

                  {file && (
                    <Image
                      source={{ uri: file.uri }}
                      style={styles.confirmImage}
                      resizeMode="cover"
                    />
                  )}

                  <Pressable
                    onPress={analyzeFood}
                    style={styles.confirmPrimaryBtn}
                    disabled={!file || !pendingMealTag || processing}
                  >
                    <Text style={styles.confirmPrimaryText}>
                      {processing ? 'Calculating…' : 'Calculate Calories'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={resetPicked}
                    style={styles.confirmCancelBtn}
                    disabled={processing}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            </Modal>

            {/* modal while converting */}
            <Modal visible={processing} animationType="fade" transparent>
              <View style={styles.sheetBackdrop}>
                <View style={styles.sheet}>
                  <BrandedLoader size={52} />
                  <Text style={styles.sheetTitle}>Calculating Calories</Text>
                </View>
              </View>
            </Modal>

            {/* subscription popup */}
            <SubscribePopup
              visible={subPopupOpen}
              onClose={() => setSubPopupOpen(false)}
            />

            {/* Source picker bottom sheet */}
            <Modal visible={sourceSheetOpen} animationType="fade" transparent>
              <View style={styles.sourceSheetBackdrop}>
                <View style={styles.sourceSheet}>
                  <View style={styles.sourceSheetHandle} />
                  <Text style={styles.sheetTitle}>Choose image source</Text>

                  <Pressable
                    style={styles.sourceSheetBtn}
                    onPress={pickFromGallery}
                    disabled={!canPickFile}
                  >
                    <Ionicons name="images-outline" size={18} color="#111827" />
                    <Text style={styles.sourceSheetBtnText}>
                      Select from gallery
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.sourceSheetBtn}
                    onPress={takePhoto}
                    disabled={!canPickFile}
                  >
                    <Ionicons name="camera-outline" size={18} color="#111827" />
                    <Text style={styles.sourceSheetBtnText}>Take a picture</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setSourceSheetOpen(false)}
                    style={[
                      styles.secondaryBtn,
                      { marginTop: 6, alignSelf: 'stretch' },
                    ]}
                  >
                    <Ionicons name="close" size={16} color="#111827" />
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            </Modal>

            {/* Add meal row (no full card) */}
            <View style={{ opacity: processing ? 0.35 : 1 }}>
              <Pressable
                onPress={() => {
                  if (!isSubscribed) {
                    setSubPopupOpen(true);
                    return;
                  }
                  // If image + label already chosen, reopen confirm
                  if (ready && file && pendingMealTag) {
                    setConfirmModalOpen(true);
                  } else {
                    setSourceSheetOpen(true);
                  }
                }}
                style={styles.addMealRow}
                hitSlop={8}
                disabled={processing}
              >
                <View style={styles.addMealTextBlock}>
                  <Text
                    style={[
                      styles.addMealTitle,
                      Platform.OS === 'android'
                        ? { fontFamily: 'sans-serif-bold' }
                        : { fontWeight: '700' },
                    ]}
                    numberOfLines={2}
                  >
                    {!isSubscribed
                      ? 'Subscribe to upload meals'
                      : recentMeals.length === 0
                      ? 'Tap + to add your first meal of the day'
                      : 'Tap + to add another meal'}
                  </Text>

                  {ready && file && (
                    <Text style={styles.mealTagHint}>
                      {pendingMealTag
                        ? pendingMealTag.toUpperCase()
                        : 'Choose meal label'}
                    </Text>
                  )}
                </View>

                <View style={styles.addMealPlusWrapper}>
                  <View
                    style={[
                      styles.addMealPlusBubble,
                      !isSubscribed && { opacity: 0.6 },
                    ]}
                  >
                    <Ionicons name="add" size={26} color="#fff" />
                  </View>

                  {/* PRO pill sitting on top of round + button for unsubscribed */}
                  {!isSubscribed && (
                    <View pointerEvents="none" style={styles.addMealProBadge}>
                      <View style={styles.proBadge}>
                        <Text style={styles.proBadgeText}>PRO</Text>
                      </View>
                    </View>
                  )}
                </View>
              </Pressable>

              {/* status chips */}
              {!isOverlayOpen && ready && file ? (
                <View style={[styles.statusChip, styles.statusChipSuccess]}>
                  <Ionicons name="image-outline" size={18} color="#166534" />
                  <Text style={styles.statusChipTextSuccess} numberOfLines={1}>
                    {file.name || 'Selected image'}
                    {fmtMB(fileSize)}
                  </Text>
                  <Pressable onPress={resetPicked} style={{ paddingHorizontal: 6 }}>
                    <Ionicons name="close" size={16} color="#166534" />
                  </Pressable>
                </View>
              ) : !isOverlayOpen && errorMsg ? (
                <View style={[styles.statusChip, styles.statusChipError]}>
                  <Ionicons name="alert-circle" size={18} color="#991B1B" />
                  <Text style={styles.statusChipTextError} numberOfLines={1}>
                    {errorMsg}
                  </Text>
                  <Pressable
                    onPress={() => setErrorMsg(null)}
                    style={{ paddingHorizontal: 6 }}
                  >
                    <Ionicons name="close" size={16} color="#991B1B" />
                  </Pressable>
                </View>
              ) : null}

              {successMsg ? (
                <View style={[styles.statusChip, styles.statusChipSuccess]}>
                  <Ionicons name="checkmark-circle" size={18} color="#166534" />
                  <Text style={styles.statusChipTextSuccess} numberOfLines={2}>
                    {successMsg}
                  </Text>
                  <Pressable
                    onPress={() => setSuccessMsg(null)}
                    style={{ paddingHorizontal: 6 }}
                  >
                    <Ionicons name="close" size={16} color="#166534" />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Daily targets */}
            {targetsLoading && (
              <View style={styles.targetsLoadingWrap}>
                <ActivityIndicator size="small" color="#6B7280" />
                <Text style={styles.targetsLoadingText}>
                  Loading today&apos;s targets…
                </Text>
              </View>
            )}

            {!targetsLoading && targets && (
              <View style={styles.targetsWrapper}>
                {/* Big calories card */}
                <View style={styles.targetsMainCard}>
                  <View>
                    <Text style={styles.targetsNumber}>{fmtInt(totals.caloriesLeft)}</Text>
                    <Text style={styles.targetsLabel}>Calories left</Text>
                    {!dailyIntakeLoading && (
                      <Text style={styles.targetsSubLabel}>
                        Eaten {fmtInt(totals.caloriesConsumed)} /{' '}
                        {fmtInt(totals.caloriesTarget)}
                      </Text>
                    )}
                  </View>

                  <View style={styles.targetsCircleOuter}>
                    <ProgressCircle
                      size={80}
                      strokeWidth={7}
                      progress={totals.caloriesProgress}
                      color={caloriesColor}
                    />
                    <View style={styles.targetsCircleInner}>
                      <Ionicons name="flame" size={24} color={caloriesColor} />
                    </View>
                  </View>
                </View>

                {/* Macros row */}
                <View style={styles.targetsRow}>
                  {/* Protein */}
                  <View style={styles.macroCard}>
                    <View style={styles.macroTextBlock}>
                      <Text style={styles.macroNumber}>
                        {fmtInt(totals.proteinLeft)}g
                      </Text>
                      <Text style={styles.macroLabel}>Protein left</Text>
                    </View>
                    <View style={styles.macroCircleOuter}>
                      <ProgressCircle
                        size={38}
                        strokeWidth={4}
                        progress={totals.proteinProgress}
                        color={proteinColor}
                      />
                      <View style={styles.macroCircleInner}>
                        <MaterialCommunityIcons
                          name="food-drumstick"
                          size={18}
                          color={proteinColor}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Carbs */}
                  <View style={styles.macroCard}>
                    <View style={styles.macroTextBlock}>
                      <Text style={styles.macroNumber}>
                        {fmtInt(totals.carbsLeft)}g
                      </Text>
                      <Text style={styles.macroLabel}>Carbs left</Text>
                    </View>

                    <View style={styles.macroCircleOuter}>
                      <ProgressCircle
                        size={38}
                        strokeWidth={4}
                        progress={totals.carbsProgress}
                        color={carbsColor}
                      />
                      <View style={styles.macroCircleInner}>
                        <MaterialCommunityIcons
                          name="barley"
                          size={18}
                          color={carbsColor}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Fat */}
                  <View style={styles.macroCard}>
                    <View style={styles.macroTextBlock}>
                      <Text style={styles.macroNumber}>
                        {fmtInt(totals.fatLeft)}g
                      </Text>
                      <Text style={styles.macroLabel}>Fat left</Text>
                    </View>
                    <View style={styles.macroCircleOuter}>
                      <ProgressCircle
                        size={38}
                        strokeWidth={4}
                        progress={totals.fatProgress}
                        color={fatColor}
                      />
                      <View style={styles.macroCircleInner}>
                        <MaterialCommunityIcons
                          name="peanut"
                          size={18}
                          color={fatColor}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Today’s Meals (LOCKED for unsubscribed) */}
            <View style={styles.recentWrapper}>
              <View style={styles.proHeader}>
                <Text style={styles.proTitle}>Today&apos;s Meals</Text>

                {!isSubscribed && (
                  <Pressable
                    onPress={() => setSubPopupOpen(true)}
                    style={styles.proBadgeWrap}
                  >
                    <View style={styles.proBadge}>
                      <Text style={styles.proBadgeText}>PRO</Text>
                    </View>
                  </Pressable>
                )}
              </View>
              {!isSubscribed ? (
                <Pressable
                  onPress={() => setSubPopupOpen(true)}
                  style={styles.lockedCard}
                >
                  <Text style={styles.lockedTitle}>PRO Feature</Text>
                  <Text style={styles.lockedText}>
                    Subscribe to log meals and view your meal history.
                  </Text>
                </Pressable>
              ) : (
                <>
                  {recentMealsLoading && (
                    <Text style={styles.recentLoadingText}>Loading meals…</Text>
                  )}

                  {!recentMealsLoading && recentMeals.length === 0 && (
                    <Text style={styles.recentEmptyText}>
                      Upload a meal photo to see it here.
                    </Text>
                  )}

                  {!recentMealsLoading &&
                    recentMeals.map((meal) => (
                      <View key={meal.id} style={styles.recentCard}>
                        {meal.image_url ? (
                          <Image
                            source={{ uri: meal.image_url }}
                            style={styles.recentImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.recentImagePlaceholder}>
                            <Ionicons
                              name="image-outline"
                              size={20}
                              color="#9CA3AF"
                            />
                          </View>
                        )}

                        <View style={styles.recentContent}>
                          <View style={styles.recentHeaderRow}>
                            <Text style={styles.mealTagTitle}>
                              {(meal.meal_tag ?? 'meal').toUpperCase()}
                            </Text>

                            <Text style={styles.recentTimeText}>
                              {fmtTime(meal.created_at)}
                            </Text>
                          </View>

                          <View style={styles.recentCaloriesRow}>
                            <Ionicons name="flame" size={16} color="#F97316" />
                            <Text style={styles.recentCaloriesText}>
                              {fmtInt(meal.calories_kcal)} Calories
                            </Text>
                          </View>

                          <View style={styles.recentMacrosRow}>
                            <View style={styles.recentMacroItem}>
                              <MaterialCommunityIcons
                                name="food-drumstick"
                                size={14}
                                color="#EF4444"
                              />
                              <Text style={styles.recentMacroText}>
                                {fmtInt(meal.protein_g)}g
                              </Text>
                            </View>

                            <View style={styles.recentMacroItem}>
                              <MaterialCommunityIcons
                                name="barley"
                                size={14}
                                color="#F59E0B"
                              />
                              <Text style={styles.recentMacroText}>
                                {fmtInt(meal.carbs_g)}g
                              </Text>
                            </View>

                            <View style={styles.recentMacroItem}>
                              <MaterialCommunityIcons
                                name="peanut"
                                size={14}
                                color="#3B82F6"
                              />
                              <Text style={styles.recentMacroText}>
                                {fmtInt(meal.fat_g)}g
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    ))}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* -------------------------- styles --------------------------- */
const WEB_COMPACT = Platform.OS === 'web';

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#f6f7fb',
    position: 'relative',
  },

  fixedLogo: {
    position: 'absolute',
    zIndex: 9999,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 140,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: '700' },

  // date strip (✅ updated)
  dayStripWrapper: {
    marginTop: 12,
    marginBottom: 12,
  },
  dayStripScroll: {
    width: '100%',
  },
  dayStripContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: 16,
  },
  dayPill: {
    alignItems: 'center',
    marginHorizontal: 6,
  },
  dayWeekLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  dayWeekLabelToday: {
    color: '#111827',
    fontWeight: '600',
  },
  dayNumberOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  dayNumberOuterDotted: {
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
  },
  dayNumberOuterHit: {
    borderColor: '#22C55E',
    borderStyle: 'solid',
  },
  dayNumberOuterMiss: {
    borderColor: '#EF4444',
    borderStyle: 'solid',
  },
  dayNumberOuterFuture: {
    borderColor: '#E5E7EB',
    opacity: 0.7,
  },
  todayPillWrapper: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPillInner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  dayNumberTextToday: {
    fontWeight: '700',
    color: '#111827',
  },

  proBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  proBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
  },

  statusChip: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
  },
  statusChipSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusChipError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  statusChipTextSuccess: {
    color: '#166534',
    fontWeight: '700',
    maxWidth: '85%',
  },
  statusChipTextError: {
    color: '#991B1B',
    fontWeight: '700',
    maxWidth: '85%',
  },

  primaryBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  btnWide: { paddingHorizontal: 22 },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  secondaryBtnText: { color: '#111827', fontWeight: '700' },

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
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: '86%',
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'center',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },

  // confirm popup
  confirmSheet: {
    width: '88%',
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  confirmImage: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginTop: 8,
    backgroundColor: '#E5E7EB',
  },
  confirmLabel: {
    marginTop: 2,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: '#111827',
    alignSelf: 'flex-start',
  },

  // meal tag modal
  tagSheet: {
    width: '88%',
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  tagSheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },

  tagInlineRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  tagChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tagChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0.5,
  },
  tagChipTextActive: {
    color: '#FFFFFF',
  },

  // bottom sheet for image source
  sourceSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sourceSheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 10,
  },
  sourceSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 6,
  },
  sourceSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  sourceSheetBtnText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 15,
  },

  // daily targets
  targetsLoadingWrap: {
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  targetsLoadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  targetsWrapper: {
    marginTop: 22,
  },
  targetsMainCard: {
    borderRadius: 22,
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  targetsNumber: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111827',
  },
  targetsLabel: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B7280',
  },
  targetsSubLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#9CA3AF',
  },
  targetsCircleOuter: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetsCircleInner: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetsRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  macroCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  macroTextBlock: {},
  macroNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  macroLabel: {
    marginTop: 2,
    fontSize: 11,
    color: '#6B7280',
  },
  macroCircleOuter: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroCircleInner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Today’s Meals
  recentWrapper: {
    marginTop: 24,
  },
  recentLoadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  recentEmptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  lockedCard: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  lockedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  lockedText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  proHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  proTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  proBadgeWrap: {
    transform: [{ scale: 0.75 }],
  },
  recentCard: {
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
    overflow: 'hidden',
  },
  recentImage: {
    width: 96,
    height: 96,
  },
  recentImagePlaceholder: {
    width: 96,
    height: 96,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentContent: {
    flex: 1,
    paddingTop: 0,
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 12,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  mealTagTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.6,
  },
  recentTimeText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  recentCaloriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recentCaloriesText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  recentMacrosRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 10,
  },
  recentMacroItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  recentMacroText: {
    fontSize: 12,
    color: '#4B5563',
  },

  // Add meal row
  addMealRow: {
    marginTop: WEB_COMPACT ? 16 : 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 40,
  },
  addMealTextBlock: {
    flex: 1,
    paddingRight: 8,
  },
  addMealTitle: {
    fontSize: 15,
    color: '#000',
  },
  mealTagHint: {
    marginTop: 4,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '700',
  },
  addMealPlusWrapper: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMealPlusBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMealProBadge: {
    position: 'absolute',
    top: -8,
    right: -18,
    transform: [{ scale: 0.7 }],
  },

  // confirm buttons
  confirmPrimaryBtn: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: '#020617',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmCancelBtn: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 14,
  },
});
