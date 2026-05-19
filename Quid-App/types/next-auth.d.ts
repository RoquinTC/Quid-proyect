import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      currency?: string;
      onboardingCompleted?: boolean;
      onboardingStep?: number;
      pinEnabled?: boolean;
      biometricEnabled?: boolean;
    };
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    currency?: string;
    onboardingCompleted?: boolean;
    onboardingStep?: number;
    pinEnabled?: boolean;
    biometricEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    currency?: string;
    onboardingCompleted?: boolean;
    onboardingStep?: number;
    pinEnabled?: boolean;
    biometricEnabled?: boolean;
  }
}
