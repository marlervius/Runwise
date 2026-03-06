import { getSupabaseAdmin } from "@/lib/supabase";
import { WeeklyPlan, WeeklyPlanDay } from "@/types/runwise";

function mapRow(row: Record<string, unknown>): WeeklyPlan {
  const planJson = row.plan_json as Record<string, unknown>;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    weekStart: row.week_start as string,
    days: (planJson.days as WeeklyPlanDay[]) || [],
    totalVolumeKm: (planJson.totalVolumeKm as number) || 0,
    hardDayCount: (planJson.hardDayCount as number) || 0,
    rationale: (planJson.rationale as string) || "",
    createdAt: row.created_at as string,
  };
}

export async function getCurrentWeekPlan(
  userId: string
): Promise<WeeklyPlan | null> {
  // Get current Monday
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const weekStart = monday.toISOString().split("T")[0];

  const { data } = await getSupabaseAdmin()
    .from("weekly_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .single();

  return data ? mapRow(data) : null;
}

export async function saveWeeklyPlan(
  userId: string,
  weekStart: string,
  plan: {
    days: WeeklyPlanDay[];
    totalVolumeKm: number;
    hardDayCount: number;
    rationale: string;
  }
): Promise<WeeklyPlan> {
  const { data, error } = await getSupabaseAdmin()
    .from("weekly_plans")
    .upsert(
      {
        user_id: userId,
        week_start: weekStart,
        plan_json: plan,
      },
      { onConflict: "user_id,week_start" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save weekly plan: ${error.message}`);
  return mapRow(data!);
}

export async function getLatestWeeklyPlan(
  userId: string
): Promise<WeeklyPlan | null> {
  const { data } = await getSupabaseAdmin()
    .from("weekly_plans")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(1)
    .single();

  return data ? mapRow(data) : null;
}
