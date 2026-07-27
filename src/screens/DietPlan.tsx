// src/screens/DietPlan.tsx
import React, {
  useEffect,
  useState,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { getTodayMealPlan, type MealPlanRow } from '../lib/getTodayMealPlan';
import supabase from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import type { RootTabScreenProps } from '../types/navigation';
import BrandedLoader from '../components/BrandedLoader';

type Props = RootTabScreenProps<'DietPlan'>;

type NormalizedMeal = {
  key: string;
  label: string;
  time?: string;
  calories?: number;
  items?: string[];
  notes?: string;
};

const headerH = 56; // same as Home

const LOGO_URL =
  'https://dunbmrbhucjzdkhtunew.supabase.co/storage/v1/object/public/logos/y-manual.png';

// Turn a raw item (string or object) into a nice single line of text
function formatItem(raw: any): string {
  if (typeof raw === 'string') return raw;

  if (raw && typeof raw === 'object') {
    const food = raw.food ?? '';
    const portion = raw.portion ?? '';
    const notes = raw.notes ?? '';

    const bits = [food, portion, notes].filter(Boolean);
    if (bits.length === 0) return '[item]';

    return bits.join(' – ');
  }

  return String(raw);
}

function normalizeMealPlan(meal_plan: any): NormalizedMeal[] {
  if (!meal_plan) return [];

  // Case 1: { meals: [ { name, time, calories, items, notes } ] }
  if (Array.isArray(meal_plan.meals)) {
    return meal_plan.meals.map((m: any, index: number) => ({
      key: m.name || `meal-${index}`,
      label: m.name || `Meal ${index + 1}`,
      time: m.time,
      calories: m.calories,
      items: Array.isArray(m.items) ? m.items.map(formatItem) : undefined,
      notes: m.notes,
    }));
  }

  // Case 2: top-level keys represent meals
  return Object.entries(meal_plan).map(([key, value]: [string, any], index) => {
    const v = value || {};
    const rawItems = v.items || v.dishes || v.foods || v.list || undefined;
    const items = Array.isArray(rawItems) ? rawItems.map(formatItem) : undefined;

    return {
      key: key || `meal-${index}`,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      time: v.time,
      calories: v.calories,
      items,
      notes: v.notes || v.description || undefined,
    };
  });
}

// "YYYY-MM-DD" -> "DD-MM-YYYY"
function formatPlanDate(d?: string | null) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const [yyyy, mm, dd] = parts;
  return `${dd}-${mm}-${yyyy}`;
}

export default function DietPlan({ navigation }: Props) {
  const { user, isSubscribed, refreshSubscription } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  // --- Floating logo geometry (same as Home) ---
  const logoAspect = 140 / 320;
  const logoW = Math.min(340, Math.max(200, Math.round(screenW * 0.58)));
  const logoH = Math.round(logoW * logoAspect);
  const isWeb = Platform.OS === 'web';
  const logoTop = isWeb ? -35 : Math.max(0, insets.top - 35);
  const logoLeft = isWeb ? -40 : 0;
  const logoShift = isWeb ? -80 : -80;
  const logoTopAdj = logoTop + 15;
  const logoLeftAdj = logoLeft + 10;

  // give body content a bit more offset
  const topPad = headerH + (Platform.OS === 'web' ? 40 : 90);

  // --- login streak (same logic as Home) ---
  const [loginStreak, setLoginStreak] = useState<number | null>(null);
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
      const current =
        row?.v_streak ?? row?.login_streak ?? row?.current_streak ?? 0;
      setLoginStreak(current);
    } catch (e) {
      console.log('[DietPlan] syncLoginStreak error', e);
    } finally {
      setStreakLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) syncLoginStreak();
  }, [user, syncLoginStreak]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        refreshSubscription();
        syncLoginStreak();
      }
      return () => {};
    }, [user, refreshSubscription, syncLoginStreak])
  );

  // --- header options (streak pill top-right, same as Home) ---
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

  // --- fetch user's full name for summary intro ---
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('caltrack_profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (!error && data?.full_name) setFullName(data.full_name);
        else setFullName(null);
      } catch (e) {
        console.log('[DietPlan] profile load error', e);
      }
    })();
  }, [user]);

  const displayName = fullName || (user as any)?.email || 'you';

  // --- diet plan data (LOCKED: do not fetch if unsubscribed) ---
  const [plan, setPlan] = useState<MealPlanRow | null>(null);
  const [meals, setMeals] = useState<NormalizedMeal[]>([]);
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTodayPlan = useCallback(async () => {
    if (!user) {
      setPlan(null);
      setMeals([]);
      setExpandedMeals({});
      setLoading(false);
      return;
    }

    // IMPORTANT: lock for unsubscribed users
    if (!isSubscribed) {
      setPlan(null);
      setMeals([]);
      setExpandedMeals({});
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await getTodayMealPlan();

      if (data) {
        setPlan(data);
        const normalized = normalizeMealPlan(data.meal_plan);
        setMeals(normalized);

        if (normalized.length > 0)
          setExpandedMeals({ [normalized[0].key]: true });
        else setExpandedMeals({});
      } else {
        setPlan(null);
        setMeals([]);
        setExpandedMeals({});
      }
    } catch (err: any) {
      console.log('[DietPlan] Error fetching meal plan', err);
      setError(err?.message || 'Error fetching meal plan');
    } finally {
      setLoading(false);
    }
  }, [user, isSubscribed]);

  useFocusEffect(
    useCallback(() => {
      loadTodayPlan();
      return () => {};
    }, [loadTodayPlan])
  );

  const dayAndDate = useMemo(() => {
    const day = plan?.day_name ? String(plan.day_name).trim() : '';
    const date = formatPlanDate((plan as any)?.plan_date ?? '');
    if (day && date) return `${day} ${date}`;
    return day || date || '';
  }, [plan?.day_name, (plan as any)?.plan_date]);

  const LockedView = useMemo(() => {
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

        <View style={[styles.centerPage, { paddingTop: topPad }]}>
          <View style={styles.lockedCard}>
            <Text style={styles.lockedTitle}>PRO Feature</Text>
            <Text style={styles.lockedText}>
              Subscribe to unlock Diet Plan and get your personalized meals.
            </Text>

            <Pressable
              onPress={() => navigation.navigate('Plans' as never)}
              style={styles.lockedBtn}
            >
              <Text style={styles.lockedBtnText}>View Plans</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }, [logoTopAdj, logoLeftAdj, logoW, logoH, logoShift, topPad, navigation]);

  if (!user) {
    return (
      <View style={styles.centerPage}>
        <Text style={styles.subtle}>Please sign in.</Text>
      </View>
    );
  }

  if (!isSubscribed) {
    return LockedView;
  }

  if (loading) {
    return (
      <View style={styles.centerPage}>
        <BrandedLoader visible />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerPage}>
        <Text style={[styles.subtle, { color: '#dc2626' }]}>{error}</Text>
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.centerPage}>
        <Text style={styles.subtle}>No meal plan found for today.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenWrapper}>
      {/* Floating logo (same as Home) */}
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
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Diet Plan header (title + badge) */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Diet Plan</Text>
            {/* removed date line from here */}
          </View>

          {plan.constraints_applied ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Personalized</Text>
            </View>
          ) : null}
        </View>

        {/* Summary card with user's name + day/date */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryIntro}>
            <Text style={styles.summaryName}>{displayName}</Text>, here is your
            diet plan{dayAndDate ? ` for ${dayAndDate}` : ''}.
          </Text>

          {plan.constraints_applied ? (
            <Text style={styles.constraints}>
              <Text style={{ fontWeight: '700', color: '#374151' }}>
                Constraints applied:
              </Text>{' '}
              {plan.constraints_applied}
            </Text>
          ) : null}
        </View>

        {/* Meals */}
        <View style={styles.mealGrid}>
          {meals.map((meal) => {
            const isExpanded = !!expandedMeals[meal.key];

            return (
              <View key={meal.key} style={styles.mealCard}>
                <Pressable
                  onPress={() =>
                    setExpandedMeals((prev) => ({
                      ...prev,
                      [meal.key]: !prev[meal.key],
                    }))
                  }
                  style={styles.mealHeaderRow}
                >
                  <View>
                    <Text style={styles.mealTitle}>{meal.label}</Text>
                    {meal.time || meal.calories ? (
                      <Text style={styles.mealSubtitle}>
                        {meal.time ? `${meal.time}` : ''}
                        {meal.time && meal.calories ? ' • ' : ''}
                        {meal.calories ? `${meal.calories} kcal` : ''}
                      </Text>
                    ) : null}
                  </View>

                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#6b7280"
                  />
                </Pressable>

                {isExpanded && (
                  <>
                    {meal.items && meal.items.length > 0 && (
                      <View style={styles.itemsList}>
                        {meal.items.map((item, idx) => {
                          const asString = String(item);
                          const [title, ...rest] = asString.split(' – ');
                          const details = rest.join(' – ').trim();

                          return (
                            <View key={idx} style={styles.itemRow}>
                              <Text style={styles.bullet}>•</Text>
                              <View style={styles.itemBody}>
                                <Text style={styles.itemTitle}>{title}</Text>
                                {!!details && (
                                  <Text style={styles.itemDetails}>
                                    {details}
                                  </Text>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {meal.notes ? (
                      <Text style={styles.mealNotes}>{meal.notes}</Text>
                    ) : null}
                  </>
                )}
              </View>
            );
          })}

          {meals.length === 0 && (
            <View style={styles.mealCard}>
              <Text style={styles.summaryText}>
                Your meal plan is saved but in a different structure. Adjust the
                mapping inside normalizeMealPlan() to match your JSON.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

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
  scroll: {
    flex: 1,
  },

  centerPage: {
    flex: 1,
    backgroundColor: '#f6f7fb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // lock card
  lockedCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  lockedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  lockedText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  lockedBtn: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedBtnText: {
    color: '#fff',
    fontWeight: '800',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },

  badge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },

  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  summaryIntro: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  summaryName: {
    fontWeight: '700',
    color: '#111827',
  },
  summaryText: {
    fontSize: 14,
    color: '#4b5563',
  },
  constraints: {
    marginTop: 10,
    fontSize: 12,
    color: '#6b7280',
  },
  subtle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  mealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  mealCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  mealHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  mealSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  itemsList: {
    marginTop: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    marginRight: 8,
    color: '#9ca3af',
    marginTop: 4,
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  itemDetails: {
    marginTop: 2,
    fontSize: 13,
    color: '#4b5563',
  },
  mealNotes: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
  },

  // streak pill (same as Home)
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
});
