import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isOnboardingComplete } from "@/lib/db/user-profiles";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session?.stravaId) {
    redirect("/");
  }

  // If onboarding already done, go to main screen
  const completed = await isOnboardingComplete(session.stravaId);
  if (completed) {
    redirect("/today");
  }

  return <OnboardingClient />;
}
