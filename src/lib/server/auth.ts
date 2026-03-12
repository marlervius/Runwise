import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { unauthorized } from "./api";

type RequireRunwiseSessionOptions = {
  requireAccessToken?: boolean;
};

export type RunwiseSession = {
  stravaId: number;
  accessToken?: string;
};

export async function requireRunwiseSession(
  options: RequireRunwiseSessionOptions = {}
): Promise<RunwiseSession> {
  const session = await getServerSession(authOptions);

  if (!session?.stravaId) {
    throw unauthorized();
  }

  if (session.error) {
    throw unauthorized("Session expired. Please sign in again.");
  }

  if (options.requireAccessToken && !session.accessToken) {
    throw unauthorized();
  }

  return {
    stravaId: session.stravaId,
    accessToken: session.accessToken,
  };
}
