// src/lib/getTodayMealPlan.ts
import supabase from './supabase'; // ✅ use the existing client

export type MealPlanRow = {
  id: string;
  user_id: string;
  plan_date: string;
  day_name: string;
  day_index: number;
  meal_plan: any;
  created_at: string;
  constraints_applied: string | null;
};

export async function getTodayMealPlan(): Promise<MealPlanRow | null> {
  // 1) Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('No logged-in user');

  // 2) Today in "YYYY-MM-DD"
  const today = new Date().toISOString().slice(0, 10);

  // 3) Fetch today’s meal plan for this user
  const { data, error } = await supabase
    .from('caltrack_meal_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('plan_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data;
}
