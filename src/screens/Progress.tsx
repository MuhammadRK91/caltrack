// src/screens/Progress.tsx
import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  Platform,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import Svg, {
  Polyline,
  Circle,
  Text as SvgText,
  Line,
  Rect,
} from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { requireEnv } from '../lib/env';

type GoalType = 'gain' | 'lose' | 'maintain' | null;

type GoalsRow = {
  weight_kg?: number | null;
  goal_weight_kg?: number | null;
  goal?: GoalType;
};

type ProfileRow = {
  login_streak?: number | null;
  longest_streak?: number | null;
  last_login_date?: string | null;
  time_zone?: string | null;
  full_name?: string | null;
  height_cm?: number | null; // BMI (kept as you had it)
};

type WeightLogRow = {
  logged_at: string;
  weight_kg: number | null;
};

type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'ALL';

type PhotoTag = 'pre' | 'post';

type ProgressPhotoRow = {
  id: string;
  image_url: string;
  created_at: string;
  photo_tag: PhotoTag | null;
};

const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const RANGE_LABELS: RangeKey[] = ['1M', '3M', '6M', '1Y', 'ALL'];

// header/logo (same feel as DietPlan)
const headerH = 56;
const LOGO_URL =
  'https://dunbmrbhucjzdkhtunew.supabase.co/storage/v1/object/public/logos/y-manual.png';

// chart geometry
const CHART_HEIGHT = 180;
const CHART_PADDING_TOP = 8;
const CHART_PADDING_BOTTOM = 20;

// tooltip geometry
const TOOLTIP_WIDTH = 80;
const TOOLTIP_HEIGHT = 30;
const TOOLTIP_MARGIN = 6;

// photo upload
const PHOTO_WEBHOOK = requireEnv(
  'EXPO_PUBLIC_PROGRESS_PHOTO_WEBHOOK_URL',
  process.env.EXPO_PUBLIC_PROGRESS_PHOTO_WEBHOOK_URL
);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export default function Progress() {
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // --- Floating logo geometry (same as DietPlan/Home) ---
  const logoAspect = 140 / 320;
  const logoW = Math.min(340, Math.max(200, Math.round(screenWidth * 0.58)));
  const logoH = Math.round(logoW * logoAspect);
  const isWeb = Platform.OS === 'web';
  const logoTop = isWeb ? -35 : Math.max(0, insets.top - 35);
  const logoLeft = isWeb ? -40 : 0;
  const logoShift = isWeb ? -80 : -80;
  const logoTopAdj = logoTop + 15;
  const logoLeftAdj = logoLeft + 10;

  // push content below the floating logo
  const topPad = headerH + (Platform.OS === 'web' ? 40 : 90);

  const [goals, setGoals] = useState<GoalsRow | null>(null);
  const [loadingGoals, setLoadingGoals] = useState(true);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [loggingWeight, setLoggingWeight] = useState(false);
  const [hasLoggedToday, setHasLoggedToday] = useState<boolean | null>(null);

  const [weightLogs, setWeightLogs] = useState<WeightLogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [range, setRange] = useState<RangeKey>('1M');
  const [chartWidth, setChartWidth] = useState(0);

  // "start fresh" button state
  const [clearHistoryEnabled, setClearHistoryEnabled] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const prevGoalsRef = useRef<GoalsRow | null>(null);

  // progress photos
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhotoRow[]>([]);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingPhotoTag, setPendingPhotoTag] = useState<PhotoTag | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // BMI (fetched from caltrack_nutrition_targets)
  const [bmiValue, setBmiValue] = useState<number | null>(null);
  const [loadingBmi, setLoadingBmi] = useState(true);
  const [bmiInfoOpen, setBmiInfoOpen] = useState(false);

  const loginStreak = profile?.login_streak ?? 0;
  const longestStreak = profile?.longest_streak ?? 0;

  // -------- Load goals --------
  const loadGoals = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('caltrack_profile_goals')
        .select('weight_kg, goal_weight_kg, goal')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setGoals((data as GoalsRow) ?? null);
    } catch (err) {
      console.log('[Progress] loadGoals error', err);
      setGoals(null);
    } finally {
      setLoadingGoals(false);
    }
  }, [user]);

  // detect goal changes
  useEffect(() => {
    if (!goals) return;

    const prev = prevGoalsRef.current;
    if (!prev) {
      prevGoalsRef.current = goals;
      return;
    }

    const changed =
      (prev.goal ?? null) !== (goals.goal ?? null) ||
      (prev.goal_weight_kg ?? null) !== (goals.goal_weight_kg ?? null);

    if (changed) setClearHistoryEnabled(true);
    prevGoalsRef.current = goals;
  }, [goals]);

  // -------- Load profile --------
  const loadProfile = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('caltrack_profiles')
        .select('login_streak, longest_streak, last_login_date, time_zone, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile((data as ProfileRow) ?? null);
    } catch (err) {
      console.log('[Progress] loadProfile error', err);
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }, [user]);

  // -------- Load BMI from nutrition targets --------
  const loadBmi = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('caltrack_nutrition_targets')
        .select('bmi')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setBmiValue(data?.bmi ?? null);
    } catch (err) {
      console.log('[Progress] loadBmi error', err);
      setBmiValue(null);
    } finally {
      setLoadingBmi(false);
    }
  }, [user]);

  // -------- Load today's weight log --------
  const loadTodayLog = useCallback(async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('caltrack_weight_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('logged_at', today)
        .maybeSingle();

      if (error && (error as any).code !== 'PGRST116') throw error;
      setHasLoggedToday(!!data);
    } catch (err) {
      console.log('[Progress] loadTodayLog error', err);
      setHasLoggedToday(false);
    }
  }, [user]);

  // -------- Load all weight logs --------
  const loadWeightLogs = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('caltrack_weight_logs')
        .select('logged_at, weight_kg')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: true });

      if (error) throw error;
      setWeightLogs((data as WeightLogRow[]) ?? []);
    } catch (err) {
      console.log('[Progress] loadWeightLogs error', err);
      setWeightLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, [user]);

  // -------- Load progress photos --------
  const loadProgressPhotos = useCallback(async () => {
    if (!user) return;

    try {
      setLoadingPhotos(true);
      const { data, error } = await supabase
        .from('caltrack_progress_photos')
        .select('id, image_url, created_at, photo_tag')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setProgressPhotos((data as ProgressPhotoRow[]) ?? []);
    } catch (err) {
      console.log('[Progress] loadProgressPhotos error', err);
      setProgressPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  }, [user]);

  // -------- Delete a progress photo row --------
  const handleDeleteProgressPhoto = useCallback(
    async (photo: ProgressPhotoRow) => {
      if (!user) return;
      if (deletingPhotoId) return;

      Alert.alert(
        'Delete photo?',
        'This will remove this photo from your progress photos.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setDeletingPhotoId(photo.id);

                const { error } = await supabase
                  .from('caltrack_progress_photos')
                  .delete()
                  .eq('id', photo.id)
                  .eq('user_id', user.id);

                if (error) throw error;

                setProgressPhotos((prev) => prev.filter((p) => p.id !== photo.id));
              } catch (err) {
                console.log('[Progress] handleDeleteProgressPhoto error', err);
                Alert.alert('Error', 'Could not delete photo. Please try again.');
              } finally {
                setDeletingPhotoId(null);
              }
            },
          },
        ]
      );
    },
    [user, deletingPhotoId]
  );

  // -------- Refetch on focus --------
  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      setLoadingGoals(true);
      setLoadingProfile(true);
      setLoadingLogs(true);
      setHasLoggedToday(null);
      setLoadingPhotos(true);

      setLoadingBmi(true);

      loadGoals();
      loadProfile();
      loadTodayLog();
      loadWeightLogs();
      loadProgressPhotos();
      loadBmi();
    }, [
      user,
      loadGoals,
      loadProfile,
      loadTodayLog,
      loadWeightLogs,
      loadProgressPhotos,
      loadBmi,
    ])
  );

  // -------- Active days for last 7 days --------
  const streakDates = useMemo(() => {
    if (!profile?.last_login_date || !loginStreak) return [];
    const base = new Date(profile.last_login_date);
    const count = Math.min(loginStreak, 7);
    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      dates.push(d);
    }
    return dates;
  }, [profile?.last_login_date, loginStreak]);

  const currentWeight = goals?.weight_kg ?? null;
  const goalWeight = goals?.goal_weight_kg ?? null;
  const goalType: GoalType = goals?.goal ?? null;

  // -------- BMI (from DB) --------
  const bmiStatus = useMemo(() => {
    if (bmiValue == null) return null;
    if (bmiValue < 18.5) return 'Underweight';
    if (bmiValue < 25) return 'Healthy';
    if (bmiValue < 30) return 'Overweight';
    return 'Obese';
  }, [bmiValue]);

  const bmiMarkerPct = useMemo(() => {
    if (bmiValue == null) return 0;
    const min = 15;
    const max = 35;
    const clamped = Math.max(min, Math.min(max, bmiValue));
    return ((clamped - min) / (max - min)) * 100;
  }, [bmiValue]);

  // -------- Log Weight --------
  const handleLogWeight = useCallback(async () => {
    if (!user) return;

    if (currentWeight == null) {
      Alert.alert('No weight set', 'Please set your current weight in Personal Details first.');
      return;
    }

    if (hasLoggedToday) return;

    try {
      setLoggingWeight(true);
      const today = new Date().toISOString().slice(0, 10);

      const { error } = await supabase
        .from('caltrack_weight_logs')
        .upsert(
          { user_id: user.id, logged_at: today, weight_kg: currentWeight, source: 'manual' },
          { onConflict: 'user_id,logged_at' }
        );

      if (error) throw error;

      setHasLoggedToday(true);
      await loadWeightLogs();
      Alert.alert('Weight logged', 'Today’s weight has been saved.');
    } catch (err) {
      console.log('[Progress] handleLogWeight error', err);
      Alert.alert('Error', 'Could not log your weight. Please try again.');
    } finally {
      setLoggingWeight(false);
    }
  }, [user, currentWeight, hasLoggedToday, loadWeightLogs]);

  // -------- Pick photo --------
  const handlePickProgressPhoto = useCallback(async () => {
    if (!user) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to upload.');
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (res.canceled || !res.assets?.[0]?.uri) return;

      setPendingPhotoUri(res.assets[0].uri);
      setPendingPhotoTag(null);
    } catch (err) {
      console.log('[Progress] handlePickProgressPhoto error', err);
      Alert.alert('Error', 'Could not open gallery.');
    }
  }, [user]);

  // -------- Upload selected photo --------
  const handleUploadSelectedPhoto = useCallback(async () => {
    if (!user) return;
    if (!pendingPhotoUri) return;
    if (uploadingPhoto) return;

    try {
      setUploadingPhoto(true);

      const uri =
        Platform.OS === 'android' && !pendingPhotoUri.startsWith('file://')
          ? `file://${pendingPhotoUri}`
          : pendingPhotoUri;

      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && typeof info.size === 'number' && info.size > MAX_PHOTO_BYTES) {
        Alert.alert('File too large', 'Please choose an image under 10MB.');
        return;
      }

      const filename = uri.split('/').pop() || 'progress.jpg';
      const extMatch = /\.(\w+)$/.exec(filename);
      const ext = extMatch?.[1]?.toLowerCase();

      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'heic'
          ? 'image/heic'
          : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

      const tagForWebhook = pendingPhotoTag ? pendingPhotoTag : 'no_tag_selected';

      const uploadRes = await FileSystem.uploadAsync(PHOTO_WEBHOOK, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: mime,
        parameters: {
          user_id: user.id,
          user_full_name: String(
            profile?.full_name ??
              user.user_metadata?.full_name ??
              user.user_metadata?.name ??
              ''
          ),
          time_zone: profile?.time_zone ?? '',
          login_streak: String(loginStreak ?? 0),
          longest_streak: String(longestStreak ?? 0),
          current_weight_kg: currentWeight != null ? String(currentWeight) : '',
          goal_weight_kg: goalWeight != null ? String(goalWeight) : '',
          goal_type: goalType ?? '',
          file_name: filename,
          photo_tag: tagForWebhook,
        },
      });

      if (uploadRes.status < 200 || uploadRes.status >= 300) {
        throw new Error(`Webhook failed: ${uploadRes.status} ${uploadRes.body}`);
      }

      setPendingPhotoUri(null);
      setPendingPhotoTag(null);
      setTagModalOpen(false);

      await loadProgressPhotos();
      Alert.alert('Saved', 'Your photo has been added to your progress.');
    } catch (err) {
      console.log('[Progress] handleUploadSelectedPhoto error', err);
      Alert.alert('Error', 'Could not upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [
    user,
    pendingPhotoUri,
    uploadingPhoto,
    pendingPhotoTag,
    profile?.full_name,
    profile?.time_zone,
    loginStreak,
    longestStreak,
    currentWeight,
    goalWeight,
    goalType,
    loadProgressPhotos,
  ]);

  // -------- Clear weight history --------
  const handleClearHistory = useCallback(() => {
    if (!user) return;
    if (!clearHistoryEnabled || weightLogs.length === 0) return;

    Alert.alert(
      'Start fresh?',
      'This will delete your previous weight history so you can start with your new goal. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete history',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearingHistory(true);
              const { error } = await supabase
                .from('caltrack_weight_logs')
                .delete()
                .eq('user_id', user.id);

              if (error) throw error;

              setWeightLogs([]);
              setHasLoggedToday(false);
              setClearHistoryEnabled(false);

              Alert.alert('History cleared', 'Your old weight logs have been deleted.');
            } catch (err) {
              console.log('[Progress] handleClearHistory error', err);
              Alert.alert('Error', 'Could not clear your history. Please try again.');
            } finally {
              setClearingHistory(false);
            }
          },
        },
      ]
    );
  }, [user, clearHistoryEnabled, weightLogs]);

  // -------- Goal progress logic --------
  let goalDeltaText = 'Set your goal to see progress';
  let journeyLabel = '';
  let weightProgress: number | null = null;

  if (currentWeight != null && goalWeight != null) {
    const deltaRaw = goalWeight - currentWeight;
    const deltaAbs = Math.abs(deltaRaw);
    const deltaStr = deltaAbs.toFixed(1);

    if (deltaRaw > 0) goalDeltaText = `${deltaStr} kg to gain`;
    else if (deltaRaw < 0) goalDeltaText = `${deltaStr} kg to lose`;
    else goalDeltaText = 'Goal reached 🎉';

    const maxVal = Math.max(currentWeight, goalWeight);
    if (maxVal > 0) {
      const closeness = 1 - Math.abs(currentWeight - goalWeight) / maxVal;
      weightProgress = Math.min(Math.max(closeness, 0), 1);
    }

    journeyLabel = `${currentWeight} kg → ${goalWeight} kg`;
  }

  // -------- Filter logs by range --------
  const filteredLogs = useMemo(() => {
    if (weightLogs.length === 0) return [];
    if (range === 'ALL') return weightLogs;

    const now = new Date();
    const cutoff = new Date(now);

    if (range === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
    else if (range === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
    else if (range === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
    else if (range === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);

    return weightLogs.filter((l) => new Date(l.logged_at) >= cutoff);
  }, [weightLogs, range]);

  const logsWithWeight = useMemo(
    () =>
      filteredLogs.filter((l) => l.weight_kg != null) as {
        logged_at: string;
        weight_kg: number;
      }[],
    [filteredLogs]
  );

  const latestLog =
    logsWithWeight.length > 0 ? logsWithWeight[logsWithWeight.length - 1] : null;

  // -------- Y-axis config --------
  const { yMin, yMax, yTicks } = useMemo(() => {
    if (logsWithWeight.length === 0) {
      return { yMin: 0, yMax: 0, yTicks: [] as number[] };
    }

    let minVal = Math.min(...logsWithWeight.map((l) => l.weight_kg));
    let maxVal = Math.max(...logsWithWeight.map((l) => l.weight_kg));

    if (goalWeight != null) {
      minVal = Math.min(minVal, goalWeight);
      maxVal = Math.max(maxVal, goalWeight);
    }

    const paddingKg = 2;
    minVal -= paddingKg;
    maxVal += paddingKg;

    const snappedMin = Math.floor(minVal / 5) * 5;
    const snappedMax = Math.ceil(maxVal / 5) * 5;

    const ticks: number[] = [];
    for (let v = snappedMin; v <= snappedMax; v += 5) ticks.push(v);

    return { yMin: snappedMin, yMax: snappedMax, yTicks: ticks };
  }, [logsWithWeight, goalWeight]);

  const yAxisLabels = useMemo(
    () => [...yTicks].sort((a, b) => b - a).map((v) => v.toString()),
    [yTicks]
  );

  const mapY = useCallback(
    (value: number) => {
      if (yMax === yMin) {
        return (
          CHART_PADDING_TOP +
          (CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM) / 2
        );
      }
      const ratio = (value - yMin) / (yMax - yMin);
      return (
        CHART_PADDING_TOP +
        (1 - ratio) * (CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM)
      );
    },
    [yMin, yMax]
  );

  // -------- Prepare line chart points --------
  const chartPoints = useMemo(() => {
    if (logsWithWeight.length === 0 || chartWidth === 0) {
      return {
        polylinePoints: '',
        dots: [] as { x: number; y: number }[],
        lastPoint: null as null | { x: number; y: number },
      };
    }

    const paddingX = 8;
    const usableWidth = chartWidth - paddingX * 2;

    const firstLogDate = new Date(logsWithWeight[0].logged_at);
    const dayMs = 24 * 60 * 60 * 1000;
    let spanDays = 30;

    if (range === '1M') spanDays = 30;
    else if (range === '3M') spanDays = 90;
    else if (range === '6M') spanDays = 180;
    else if (range === '1Y') spanDays = 365;
    else if (range === 'ALL') {
      const lastLogDate = new Date(logsWithWeight[logsWithWeight.length - 1].logged_at);
      const diff = (lastLogDate.getTime() - firstLogDate.getTime()) / dayMs;
      spanDays = Math.max(diff, 30);
    }

    const domainStart = firstLogDate;
    const domainEnd = new Date(domainStart.getTime() + spanDays * dayMs);
    const domainMs = domainEnd.getTime() - domainStart.getTime();

    const dots: { x: number; y: number }[] = [];
    const polyArr: string[] = [];
    let lastPoint: { x: number; y: number } | null = null;

    logsWithWeight.forEach((log) => {
      const d = new Date(log.logged_at);
      const t = Math.max(0, Math.min(1, (d.getTime() - domainStart.getTime()) / domainMs));
      const x = paddingX + t * usableWidth;
      const y = mapY(log.weight_kg);

      dots.push({ x, y });
      polyArr.push(`${x},${y}`);
      lastPoint = { x, y };
    });

    return { polylinePoints: polyArr.join(' '), dots, lastPoint };
  }, [logsWithWeight, chartWidth, mapY, range]);

  // -------- Tooltip position --------
  const tooltipX = useMemo(() => {
    if (!chartPoints.lastPoint || chartWidth === 0) return 0;
    const centerX = chartPoints.lastPoint.x;
    let left = centerX - TOOLTIP_WIDTH / 2;
    const minX = 4;
    const maxX = Math.max(chartWidth - TOOLTIP_WIDTH - 4, minX);
    if (left < minX) left = minX;
    if (left > maxX) left = maxX;
    return left;
  }, [chartPoints, chartWidth]);

  const tooltipY = useMemo(() => {
    if (!chartPoints.lastPoint) return 0;
    let top = chartPoints.lastPoint.y - TOOLTIP_HEIGHT - TOOLTIP_MARGIN;
    const minY = CHART_PADDING_TOP + 2;
    if (top < minY) top = minY;
    return top;
  }, [chartPoints]);

  const streakProgress =
    longestStreak > 0 ? Math.min((loginStreak / longestStreak) * 100, 100) : 0;

  const isLogButtonDisabled = loggingWeight || hasLoggedToday || loadingGoals;
  const clearDisabled = !clearHistoryEnabled || clearingHistory || weightLogs.length === 0;

  // full images (big)
  const fullImageHeight = Math.max(360, Math.round((screenWidth - 32) * 1.15));

  return (
    <View style={styles.screenWrapper}>
      {/* Floating logo (like DietPlan) */}
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
        contentContainerStyle={{
          paddingTop: topPad,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 28,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topRow}>
          <View style={[styles.card, styles.cardHalf]}>
            <Text style={styles.cardTitle}>Goal Progress</Text>

            {loadingGoals ? (
              <ActivityIndicator size="small" color="#6B7280" />
            ) : (
              <>
                <Text style={styles.weightValue}>{currentWeight ?? '—'} kg</Text>
                <Text style={styles.goalDeltaText}>{goalDeltaText}</Text>

                <View style={styles.weightBarTrack}>
                  {weightProgress !== null && (
                    <View
                      style={[
                        styles.weightBarFill,
                        { width: `${weightProgress * 100}%` },
                      ]}
                    />
                  )}
                </View>

                <Text style={styles.journeyLabel}>
                  {journeyLabel || 'Set current and goal weight'}
                </Text>

                {currentWeight != null && (
                  <View style={styles.logButtonWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.logButton,
                        isLogButtonDisabled && styles.logButtonDisabled,
                      ]}
                      onPress={handleLogWeight}
                      disabled={isLogButtonDisabled}
                    >
                      <Text style={styles.logButtonText}>
                        {hasLoggedToday
                          ? 'Logged for today'
                          : loggingWeight
                          ? 'Saving...'
                          : 'Log Weight'}
                      </Text>
                      {!hasLoggedToday && !loggingWeight && (
                        <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>

          <View style={[styles.card, styles.cardHalf, styles.streakCard]}>
            <Text style={styles.streakTitle}>Consistency</Text>

            {loadingProfile ? (
              <ActivityIndicator size="small" color="#6B7280" />
            ) : (
              <>
                <View style={styles.streakMainRow}>
                  <View style={styles.streakIconCircle}>
                    <Ionicons name="flame" size={18} color="#FFFFFF" />
                  </View>

                  <View>
                    <Text style={styles.streakNumber}>
                      {loginStreak} day{loginStreak === 1 ? '' : 's'}
                    </Text>
                    <Text style={styles.streakSubtitle}>
                      Best: {longestStreak} day{longestStreak === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                {longestStreak > 0 && (
                  <View style={styles.streakBarTrack}>
                    <LinearGradient
                      colors={['#FDBA74', '#F97316']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.streakBarFill,
                        { width: `${streakProgress}%` },
                      ]}
                    />
                  </View>
                )}

                <View style={styles.weekRow}>
                  {days.map((d, idx) => {
                    const active = streakDates.some((date) => date.getDay() === idx);
                    return (
                      <View key={`${d}-${idx}`} style={styles.dayDotWrapper}>
                        <View style={[styles.dayDot, active && styles.dayDotActive]}>
                          <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>
                            {d}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </View>

        <View style={[styles.card, styles.chartCard]}>
          <View style={styles.chartHeaderRow}>
            <Text style={styles.cardTitle}>Weight Progress</Text>
          </View>

          <View style={styles.chartContainer}>
            <View style={styles.chartMainRow}>
              <View style={styles.yAxis}>
                {yAxisLabels.map((label, idx) => (
                  <Text key={idx} style={styles.yAxisLabel}>
                    {label}
                  </Text>
                ))}
              </View>

              <View
                style={styles.chartSvgWrapper}
                onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
              >
                {loadingLogs ? (
                  <ActivityIndicator size="small" color="#6B7280" />
                ) : logsWithWeight.length === 0 ? (
                  <Text style={styles.chartEmptyText}>
                    Log your weight to see your progress over time.
                  </Text>
                ) : (
                  <Svg width={chartWidth} height={CHART_HEIGHT}>
                    {yTicks.map((tick) => {
                      const y = mapY(tick);
                      return (
                        <Line
                          key={`grid-${tick}`}
                          x1={0}
                          x2={chartWidth}
                          y1={y}
                          y2={y}
                          stroke="#E5E7EB"
                          strokeWidth={1}
                        />
                      );
                    })}

                    {chartPoints.polylinePoints !== '' && (
                      <Polyline
                        points={chartPoints.polylinePoints}
                        fill="none"
                        stroke="#22C55E"
                        strokeWidth={2}
                      />
                    )}

                    {chartPoints.dots.map((p, idx) => (
                      <Circle
                        key={`dot-${idx}`}
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill="#22C55E"
                      />
                    ))}

                    {chartPoints.lastPoint && latestLog?.weight_kg != null && (
                      <>
                        <Rect
                          x={tooltipX}
                          y={tooltipY}
                          rx={8}
                          ry={8}
                          width={TOOLTIP_WIDTH}
                          height={TOOLTIP_HEIGHT}
                          fill="#111827"
                        />
                        <SvgText
                          x={tooltipX + TOOLTIP_WIDTH / 2}
                          y={tooltipY + 14}
                          fontSize={10}
                          fill="#FFFFFF"
                          textAnchor="middle"
                        >
                          {`${latestLog.weight_kg.toFixed(1)} kg`}
                        </SvgText>
                        <SvgText
                          x={tooltipX + TOOLTIP_WIDTH / 2}
                          y={tooltipY + 26}
                          fontSize={9}
                          fill="#D1D5DB"
                          textAnchor="middle"
                        >
                          {new Date(latestLog.logged_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </SvgText>
                      </>
                    )}
                  </Svg>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.rangeRowBelowChart}>
          {RANGE_LABELS.map((k) => {
            const active = range === k;
            return (
              <TouchableOpacity
                key={k}
                style={[styles.rangeChip, active && styles.rangeChipActive]}
                onPress={() => setRange(k)}
                activeOpacity={0.8}
              >
                <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
                  {k}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.clearRow}>
          <Text style={styles.clearNote}>Only enabled when you change your goal plan.</Text>

          <TouchableOpacity
            style={[styles.clearBtn, clearDisabled && styles.clearBtnDisabled]}
            disabled={clearDisabled}
            onPress={handleClearHistory}
          >
            <Text style={[styles.clearBtnText, clearDisabled && styles.clearBtnTextDisabled]}>
              {clearingHistory ? 'Clearing...' : 'Start fresh'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* BMI Card (added) */}
        <View style={[styles.card, styles.bmiCard]}>
          <View style={styles.bmiTopRow}>
            <Text style={styles.bmiTitle}>Your BMI</Text>
            <TouchableOpacity
  style={styles.bmiHelpCircle}
  activeOpacity={0.7}
  onPress={() => setBmiInfoOpen(true)}
>
  <Text style={styles.bmiHelpText}>?</Text>
</TouchableOpacity>

          </View>

          {loadingBmi ? (
            <View style={{ marginTop: 10 }}>
              <ActivityIndicator size="small" color="#6B7280" />
            </View>
          ) : bmiValue == null ? (
            <Text style={styles.bmiMissing}>BMI not available.</Text>
          ) : (
            <>
              <View style={styles.bmiValueRow}>
                <Text style={styles.bmiNumber}>{bmiValue.toFixed(1)}</Text>

                <View style={styles.bmiStatusRow}>
                  <Text style={styles.bmiStatusText}>Your weight is</Text>
                  <View
                    style={[
                      styles.bmiPill,
                      bmiStatus === 'Healthy' && styles.bmiPillHealthy,
                      bmiStatus === 'Underweight' && styles.bmiPillUnder,
                      bmiStatus === 'Overweight' && styles.bmiPillOver,
                      bmiStatus === 'Obese' && styles.bmiPillObese,
                    ]}
                  >
                    <Text style={styles.bmiPillText}>{bmiStatus}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.bmiBarWrap}>
                <LinearGradient
                  colors={['#3B82F6', '#22C55E', '#F59E0B', '#EF4444']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.bmiBar}
                />
                <View style={[styles.bmiMarker, { left: `${bmiMarkerPct}%` }]} />
              </View>

              <View style={styles.bmiLegendRow}>
                <View style={styles.bmiLegendItem}>
                  <View style={[styles.bmiLegendDot, { backgroundColor: '#3B82F6' }]} />
                  <Text style={styles.bmiLegendText}>Underweight</Text>
                </View>

                <View style={styles.bmiLegendItem}>
                  <View style={[styles.bmiLegendDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={styles.bmiLegendText}>Healthy</Text>
                </View>

                <View style={styles.bmiLegendItem}>
                  <View style={[styles.bmiLegendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.bmiLegendText}>Overweight</Text>
                </View>

                <View style={styles.bmiLegendItem}>
                  <View style={[styles.bmiLegendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.bmiLegendText}>Obese</Text>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={[styles.card, styles.photoCard]}>
          <View style={styles.photoTopRow}>
            <View style={styles.photoSticker}>
              <Ionicons name="camera-outline" size={18} color="#111827" />
            </View>
            <Text style={styles.photoTitle}>Progress photos</Text>
          </View>

          <Text style={styles.photoOneLine}>
            Add a photo anytime to track your progress visually.
          </Text>

          <TouchableOpacity
            style={[styles.photoCenterBtn, uploadingPhoto && styles.photoCenterBtnDisabled]}
            activeOpacity={0.85}
            onPress={handlePickProgressPhoto}
            disabled={uploadingPhoto}
          >
            <Ionicons name="add" size={16} color="#111827" />
            <Text style={styles.photoCenterBtnText}>
              {uploadingPhoto ? 'Uploading...' : 'Upload'}
            </Text>
          </TouchableOpacity>

          {!!pendingPhotoUri && (
            <View style={styles.selectedBlock}>
              <View style={styles.selectedHeaderRow}>
                <Text style={styles.selectedLabel}>Selected</Text>

                <TouchableOpacity
                  style={[styles.tagChip, !pendingPhotoTag && styles.tagChipOutline]}
                  onPress={() => setTagModalOpen(true)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.tagChipText,
                      !pendingPhotoTag && styles.tagChipTextOutline,
                    ]}
                  >
                    {pendingPhotoTag ? pendingPhotoTag.toUpperCase() : 'Add tag'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Image
                source={{ uri: pendingPhotoUri }}
                style={[styles.photoFull, { height: fullImageHeight }]}
                resizeMode="cover"
              />

              <View style={styles.selectedActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.selectedActionBtn,
                    uploadingPhoto && styles.selectedActionBtnDisabled,
                  ]}
                  onPress={handleUploadSelectedPhoto}
                  disabled={uploadingPhoto}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.selectedActionBtnText}>
                    {uploadingPhoto ? 'Uploading...' : 'Upload this photo'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.selectedCancelBtn}
                  onPress={() => {
                    setPendingPhotoUri(null);
                    setPendingPhotoTag(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.selectedCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.savedPhotosSection}>
          {loadingPhotos ? (
            <View style={{ marginTop: 12 }}>
              <ActivityIndicator size="small" color="#6B7280" />
            </View>
          ) : progressPhotos.length === 0 ? (
            <Text style={styles.photoHint}>Your uploaded photos will appear here.</Text>
          ) : (
            <View style={{ marginTop: 12 }}>
              {progressPhotos.map((p) => (
                <View key={p.id} style={styles.photoFullWrap}>
                  <Image
                    source={{ uri: p.image_url }}
                    style={[styles.photoFull, { height: fullImageHeight }]}
                    resizeMode="cover"
                  />

                  {p.photo_tag ? (
                    <View style={styles.photoTagBadge}>
                      <Text style={styles.photoTagText}>{p.photo_tag.toUpperCase()}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.photoDeleteBtn,
                      deletingPhotoId === p.id && styles.photoDeleteBtnDisabled,
                    ]}
                    onPress={() => handleDeleteProgressPhoto(p)}
                    disabled={!!deletingPhotoId}
                    activeOpacity={0.85}
                  >
                    {deletingPhotoId === p.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="close" size={16} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />

        <Modal
          visible={tagModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setTagModalOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setTagModalOpen(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Tag this photo?</Text>
              <Text style={styles.modalSub}>
                Optional. Choose Pre or Post, or close to leave blank.
              </Text>

              <View style={styles.modalRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  activeOpacity={0.9}
                  onPress={() => {
                    setPendingPhotoTag('pre');
                    setTagModalOpen(false);
                  }}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Pre</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  activeOpacity={0.9}
                  onPress={() => {
                    setPendingPhotoTag('post');
                    setTagModalOpen(false);
                  }}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
                    Post
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.modalCancel}
                activeOpacity={0.85}
                onPress={() => setTagModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Close (no tag)</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal
  visible={bmiInfoOpen}
  transparent
  animationType="fade"
  onRequestClose={() => setBmiInfoOpen(false)}
>
  <Pressable style={styles.modalBackdrop} onPress={() => setBmiInfoOpen(false)}>
    <Pressable style={styles.modalCard} onPress={() => {}}>
      <Text style={styles.modalTitle}>BMI categories</Text>

      <View style={{ marginTop: 12 }}>
        <Text style={styles.bmiInfoLine}>
          <Text style={styles.bmiInfoLine}>
  🔵 Underweight: &lt; 18.5
</Text>
        </Text>
        <Text style={styles.bmiInfoLine}>
          🟢 Healthy: 18.5 – 24.9
        </Text>
        <Text style={styles.bmiInfoLine}>
          🟠 Overweight: 25 – 29.9
        </Text>
        <Text style={styles.bmiInfoLine}>
          🔴 Obese: 30+
        </Text>
      </View>

      <TouchableOpacity
        style={styles.modalCancel}
        activeOpacity={0.8}
        onPress={() => setBmiInfoOpen(false)}
      >
        <Text style={styles.modalCancelText}>Close</Text>
      </TouchableOpacity>
    </Pressable>
  </Pressable>
</Modal>

      </ScrollView>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  // wrapper to support floating logo
  screenWrapper: {
    flex: 1,
    backgroundColor: '#f6f7fb',
    position: 'relative',
  },
  fixedLogo: {
    position: 'absolute',
    zIndex: 9999,
  },
  scroll: {
    flex: 1,
  },

  topRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHalf: { flex: 1 },

  cardTitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  weightValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  goalDeltaText: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  weightBarTrack: {
    marginTop: 8,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  weightBarFill: {
    height: '100%',
    backgroundColor: '#111827',
    borderRadius: 999,
  },
  journeyLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#9CA3AF',
  },

  logButtonWrapper: {
    marginTop: 12,
    marginHorizontal: -14,
    marginBottom: -16,
  },
  logButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  logButtonDisabled: { backgroundColor: '#D1D5DB' },
  logButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  streakCard: {
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  streakTitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  streakMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#F97316',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  streakNumber: { fontSize: 18, fontWeight: '700', color: '#111827' },
  streakSubtitle: { fontSize: 12, color: '#6B7280' },
  streakBarTrack: {
    marginTop: 8,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  streakBarFill: { height: '100%', borderRadius: 999 },

  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  dayDotWrapper: { flex: 1, alignItems: 'center' },
  dayDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayDotActive: { backgroundColor: '#F97316' },
  dayLabel: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  dayLabelActive: { color: '#FFFFFF' },

  chartCard: { marginTop: 16 },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartContainer: { marginTop: 4, marginBottom: 8 },
  chartMainRow: { flexDirection: 'row' },
  yAxis: {
    width: 40,
    justifyContent: 'space-between',
    marginRight: 4,
    paddingTop: CHART_PADDING_TOP,
    paddingBottom: CHART_PADDING_BOTTOM,
  },
  yAxisLabel: { fontSize: 10, color: '#9CA3AF' },
  chartSvgWrapper: { flex: 1, height: CHART_HEIGHT },
  chartEmptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 32,
  },

  rangeChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  rangeChipActive: { backgroundColor: '#111827' },
  rangeChipText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  rangeChipTextActive: { color: '#FFFFFF' },
  rangeRowBelowChart: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },

  clearRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearNote: { flex: 1, fontSize: 10, color: '#9CA3AF' },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  clearBtnDisabled: { borderColor: '#E5E7EB', backgroundColor: '#F3F4F6' },
  clearBtnText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  clearBtnTextDisabled: { color: '#9CA3AF' },

  // BMI styles (added)
  bmiCard: {
    marginTop: 12,
  },
  bmiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bmiTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  bmiHelpCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bmiHelpText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '800',
  },
  bmiMissing: {
    marginTop: 10,
    fontSize: 12,
    color: '#9CA3AF',
  },
  bmiValueRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bmiNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#111827',
  },
  bmiStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bmiStatusText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  bmiPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  bmiPillHealthy: { backgroundColor: '#22C55E' },
  bmiPillUnder: { backgroundColor: '#3B82F6' },
  bmiPillOver: { backgroundColor: '#F59E0B' },
  bmiPillObese: { backgroundColor: '#EF4444' },
  bmiPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bmiBarWrap: {
    marginTop: 12,
    position: 'relative',
  },
  bmiBar: {
    height: 10,
    borderRadius: 999,
  },
  bmiMarker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 16,
    backgroundColor: '#111827',
    borderRadius: 2,
    transform: [{ translateX: -1 }],
  },
  bmiLegendRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  bmiLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bmiLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bmiLegendText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },

  photoCard: { marginTop: 14 },
  photoTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoSticker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  photoOneLine: { marginTop: 8, fontSize: 12, color: '#9CA3AF' },
  photoCenterBtn: {
    marginTop: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  photoCenterBtnDisabled: { opacity: 0.6 },
  photoCenterBtnText: { fontSize: 13, fontWeight: '600', color: '#111827' },

  photoHint: { marginTop: 12, fontSize: 12, color: '#9CA3AF' },

  savedPhotosSection: {
    marginTop: 10,
  },

  photoFullWrap: {
    position: 'relative',
    width: '100%',
    marginBottom: 12,
  },
  photoFull: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },

  photoDeleteBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(17,24,39,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoDeleteBtnDisabled: { opacity: 0.6 },

  photoTagBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.72)',
  },
  photoTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  selectedBlock: { marginTop: 12 },
  selectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },

  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tagChipOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#111827',
  },
  tagChipTextOutline: {
    color: '#111827',
  },

  selectedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  selectedActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  selectedActionBtnDisabled: {
    opacity: 0.7,
  },
  selectedActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  selectedCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  selectedCancelText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  modalSub: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: '#111827',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  modalBtnTextPrimary: {
    color: '#FFFFFF',
  },
  modalCancel: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  bmiInfoLine: {
  fontSize: 13,
  color: '#111827',
  fontWeight: '600',
  marginBottom: 6,
},

});
