// src/screens/MealAnalysisScreen.tsx
import React, { useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = NativeStackScreenProps<RootStackParamList, 'MealAnalysis'>;

type MacroGroup = 'protein' | 'carb' | 'fat' | 'other';

export default function MealAnalysisScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();

  const params = route.params ?? ({} as any);
  const meal = params.meal ?? params ?? {};
  const breakdown = params.breakdown ?? null;
  const items: any[] = Array.isArray(breakdown?.items) ? breakdown.items : [];

  const fmt = (n?: number | null) =>
    n == null ? '—' : Math.round(Number(n)).toString();

  // Hide stack header completely (removes default header/back)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  if (!meal) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>No meal data to show.</Text>
      </View>
    );
  }

  // ---------- Helpers for grouping + tags ----------

  const classifyMacro = (item: any): MacroGroup => {
    const p = Number(item.estimated_protein_g) || 0;
    const c = Number(item.estimated_carbs_g) || 0;
    const f = Number(item.estimated_fat_g) || 0;

    if (p === 0 && c === 0 && f === 0) return 'other';

    if (p >= c && p >= f && p > 0) return 'protein';
    if (c >= p && c >= f && c > 0) return 'carb';
    if (f >= p && f >= c && f > 0) return 'fat';

    return 'other';
  };

  const buildTag = (
    item: any
  ): { label: string; type: 'protein' | 'carb' | 'fat' } | null => {
    const p = Number(item.estimated_protein_g) || 0;
    const c = Number(item.estimated_carbs_g) || 0;
    const f = Number(item.estimated_fat_g) || 0;

    if (p >= c && p >= f && p >= 10) {
      return { label: 'High protein', type: 'protein' };
    }
    if (c >= p && c >= f && c >= 15) {
      return { label: 'High carb', type: 'carb' };
    }
    if (f >= p && f >= c && f >= 7) {
      return { label: 'High fat', type: 'fat' };
    }
    return null;
  };

  const proteinItems: any[] = [];
  const carbItems: any[] = [];
  const fatItems: any[] = [];
  const otherItems: any[] = [];

  items.forEach((item) => {
    const group = classifyMacro(item);
    if (group === 'protein') proteinItems.push(item);
    else if (group === 'carb') carbItems.push(item);
    else if (group === 'fat') fatItems.push(item);
    else otherItems.push(item);
  });

  // ---------- Collapsible state per group ----------

  const [expanded, setExpanded] = useState<Record<MacroGroup, boolean>>({
    protein: true,
    carb: true,
    fat: true,
    other: false,
  });

  const toggleGroup = (group: MacroGroup) => {
    setExpanded((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // ---------- Render helpers ----------

  const renderIngredientRow = (
    item: any,
    idx: number,
    group: MacroGroup
  ) => {
    const hasMacros =
      item.estimated_protein_g != null ||
      item.estimated_carbs_g != null ||
      item.estimated_fat_g != null;

    const tag = buildTag(item);

    return (
      <View
        key={idx}
        style={[
          styles.itemRow,
          group === 'protein' && styles.itemRowProtein,
          group === 'carb' && styles.itemRowCarb,
          group === 'fat' && styles.itemRowFat,
          group === 'other' && styles.itemRowOther,
        ]}
      >
        {/* Top line: name + calories */}
        <View style={styles.itemTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.estimated_portion ? (
              <Text style={styles.itemSubtitle}>{item.estimated_portion}</Text>
            ) : null}
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.itemCals}>
              {fmt(item.estimated_calories_kcal)} cal
            </Text>
          </View>
        </View>

        {/* Bottom line: macros + optional chip */}
        {(hasMacros || tag) && (
          <View style={styles.itemBottomRow}>
            {hasMacros ? (
              <Text style={styles.itemMacroLine}>
                {fmt(item.estimated_protein_g)}g P ·{' '}
                {fmt(item.estimated_carbs_g)}g C ·{' '}
                {fmt(item.estimated_fat_g)}g F
              </Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {tag && (
              <View
                style={[
                  styles.chip,
                  tag.type === 'protein' && styles.chipProtein,
                  tag.type === 'carb' && styles.chipCarb,
                  tag.type === 'fat' && styles.chipFat,
                ]}
              >
                <Text style={styles.chipText}>{tag.label}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderGroup = (
    title: string,
    groupItems: any[],
    group: MacroGroup
  ) => {
    if (!groupItems.length) return null;

    const isOpen = expanded[group];

    const icon =
      group === 'protein'
        ? 'food-drumstick'
        : group === 'carb'
        ? 'barley'
        : group === 'fat'
        ? 'peanut'
        : 'leaf';

    return (
      <View style={styles.groupBlock}>
        <Pressable
          style={styles.groupHeaderRow}
          onPress={() => toggleGroup(group)}
        >
          <View style={styles.groupHeaderLeft}>
            <View
              style={[
                styles.groupIconBubble,
                group === 'protein' && styles.groupIconProtein,
                group === 'carb' && styles.groupIconCarb,
                group === 'fat' && styles.groupIconFat,
                group === 'other' && styles.groupIconOther,
              ]}
            >
              <MaterialCommunityIcons
                name={icon as any}
                size={16}
                color="#111827"
              />
            </View>
            <Text style={styles.groupHeaderText}>{title}</Text>
          </View>
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#6B7280"
          />
        </Pressable>

        {isOpen &&
          groupItems.map((item, idx) => renderIngredientRow(item, idx, group))}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.wrapper}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Full-bleed image */}
        {meal.image_url ? (
          <Image source={{ uri: meal.image_url }} style={styles.mealImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={40} color="#9CA3AF" />
          </View>
        )}

        {/* Calories pill */}
        <View style={styles.caloriesCard}>
          <View style={styles.caloriesIconBubble}>
            <Ionicons name="flame" size={22} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.caloriesNumber}>
              {fmt(meal.calories_kcal)}
            </Text>
            <Text style={styles.caloriesLabel}>Calories</Text>
          </View>
        </View>

        {/* Macro cards */}
        <View style={styles.macrosRow}>
          {/* Protein */}
          <View style={styles.macroBox}>
            <View style={styles.macroCircleOuter}>
              <View style={styles.macroCircleInner}>
                <MaterialCommunityIcons
                  name="food-drumstick"
                  size={18}
                  color="#EF4444"
                />
              </View>
            </View>
            <Text style={styles.macroNum}>{fmt(meal.protein_g)}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>

          {/* Carbs */}
          <View style={styles.macroBox}>
            <View style={styles.macroCircleOuter}>
              <View style={styles.macroCircleInner}>
                <MaterialCommunityIcons
                  name="barley"
                  size={18}
                  color="#F59E0B"
                />
              </View>
            </View>
            <Text style={styles.macroNum}>{fmt(meal.carbs_g)}g</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>

          {/* Fat */}
          <View style={styles.macroBox}>
            <View style={styles.macroCircleOuter}>
              <View style={styles.macroCircleInner}>
                <MaterialCommunityIcons
                  name="peanut"
                  size={18}
                  color="#3B82F6"
                />
              </View>
            </View>
            <Text style={styles.macroNum}>{fmt(meal.fat_g)}g</Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
        </View>

        {/* Ingredients – grouped */}
        <Text style={styles.sectionTitle}>Ingredients</Text>

        {items.length === 0 ? (
          <Text style={styles.emptyText}>
            Ingredient breakdown is not available for this meal.
          </Text>
        ) : (
          <>
            {renderGroup('Protein-heavy', proteinItems, 'protein')}
            {renderGroup('Carb-heavy', carbItems, 'carb')}
            {renderGroup('Fat-heavy', fatItems, 'fat')}
            {renderGroup('Other', otherItems, 'other')}
          </>
        )}

        {breakdown?.overall_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{breakdown.overall_notes}</Text>
          </View>
        ) : null}

        {/* Spacer so content isn't hidden behind bottom bar */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Bottom bar with Done aligned to the right */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: 10 + insets.bottom, paddingTop: 8 },
        ]}
      >
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.actionBtnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  wrapper: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 0,
  },

  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6f7fb',
  },
  fallbackText: {
    fontSize: 16,
    color: '#6B7280',
  },

  mealImage: {
    width: '100%',
    height: 280,
    resizeMode: 'cover',
    backgroundColor: '#000',
  },
  imagePlaceholder: {
    width: '100%',
    height: 280,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  caloriesCard: {
    marginTop: -24,
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  caloriesIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  caloriesNumber: { fontSize: 34, fontWeight: '700', color: '#111827' },
  caloriesLabel: { fontSize: 14, color: '#6B7280', marginTop: 2 },

  macrosRow: {
    marginTop: 16,
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  macroBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  macroCircleOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  macroCircleInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroNum: { fontSize: 16, fontWeight: '700', color: '#111827' },
  macroLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 22,
    marginHorizontal: 16,
    color: '#111827',
  },

  emptyText: {
    marginHorizontal: 16,
    marginBottom: 12,
    color: '#9CA3AF',
    fontSize: 14,
  },

  // Groups
  groupBlock: {
    marginBottom: 6,
  },
  groupHeaderRow: {
    marginHorizontal: 16,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupIconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  groupIconProtein: {
    backgroundColor: '#FED7AA',
  },
  groupIconCarb: {
    backgroundColor: '#FEF3C7',
  },
  groupIconFat: {
    backgroundColor: '#DBEAFE',
  },
  groupIconOther: {
    backgroundColor: '#E5E7EB',
  },
  groupHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Ingredient rows
  itemRow: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemRowProtein: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  itemRowCarb: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FACC15',
  },
  itemRowFat: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  itemRowOther: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  itemSubtitle: { color: '#6B7280', marginTop: 2, fontSize: 12 },
  itemCals: { fontSize: 15, fontWeight: '700', color: '#111827' },

  itemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  itemMacroLine: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
  },

  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginLeft: 8,
  },
  chipProtein: {
    borderColor: '#F97316',
    backgroundColor: '#FFEDD5',
  },
  chipCarb: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  chipFat: {
    borderColor: '#3B82F6',
    backgroundColor: '#DBEAFE',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },

  notesBox: {
    marginTop: 6,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    color: '#111827',
  },
  notesText: {
    fontSize: 13,
    color: '#4B5563',
  },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    backgroundColor: '#f6f7fb',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: '#111827',
  },
  actionBtnText: {
    fontWeight: '700',
    color: '#ffffff',
  },
});
