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
    weekFocus: (planJson.weekFocus as string) || undefined,
    createdAt: row.created_at as string,
  };
}

export async function getCurrentWeekPlan(
  userId: string
): Promise<WeeklyPlan | null> {
  const today = new Date().toISOString().split("T")[0];

  // Find the most recent plan whose start date is <= today
  // and that still covers today (14-day plans: start + 13 days)
  const { data } = await getSupabaseAdmin()
    .from("weekly_plans")
    .select("*")
    .eq("user_id", userId)
    .lte("week_start", today)
    .order("week_start", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  const plan = mapRow(data);

  // Check if today falls within the plan's date range
  const lastDay = plan.days[plan.days.length - 1];
  if (lastDay && lastDay.date < today) {
    // Plan has expired — all days are in the past
    return null;
  }

  return plan;
}

export async function saveWeeklyPlan(
  userId: string,
  weekStart: string,
  plan: {
    days: WeeklyPlanDay[];
    totalVolumeKm: number;
    hardDayCount: number;
    rationale: string;
    weekFocus?: string;
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
