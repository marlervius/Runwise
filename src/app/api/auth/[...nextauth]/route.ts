import NextAuth, { NextAuthOptions } from "next-auth";
import { JWT } from "next-auth/jwt";
import StravaProvider from "next-auth/providers/strava";

type StravaProfile = {
  id?: number | string;
};

type RefreshedStravaTokenResponse = {
  access_token?: string;
  expires_at?: number;
  refresh_token?: string;
};

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    console.log("[Auth] Refreshing access token...");

    if (typeof token.refreshToken !== "string" || token.refreshToken.length === 0) {
      throw new Error("Missing refresh token");
    }
    
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID!,
        client_secret: process.env.STRAVA_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshedTokens = (await response.json()) as RefreshedStravaTokenResponse;

    if (!response.ok) {
      console.error("[Auth] Failed to refresh token:", refreshedTokens);
      throw refreshedTokens;
    }

    console.log("[Auth] Token refreshed successfully!");

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: refreshedTokens.expires_at,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("[Auth] Error refreshing access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    StravaProvider({
      clientId: process.env.STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read,activity:read_all",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign in - save tokens
      if (account) {
        console.log("[Auth] Initial sign in, saving tokens");
        const profileId = (profile as StravaProfile | undefined)?.id;
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          stravaId:
            typeof profileId === "number"
              ? profileId
              : Number(profileId ?? account.providerAccountId),
        };
      }

      // Return token if not expired (with 5 min buffer)
      const expiresAt = token.expiresAt as number;
      if (Date.now() < expiresAt * 1000 - 5 * 60 * 1000) {
        return token;
      }

      // Token expired, refresh it
      console.log("[Auth] Token expired, refreshing...");
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.stravaId = token.stravaId as number | undefined;
      session.error = token.error as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
