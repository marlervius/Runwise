import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    stravaId?: number;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    stravaId?: number;
    error?: string;
  }
}
