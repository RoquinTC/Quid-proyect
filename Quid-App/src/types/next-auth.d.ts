import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      pinEnabled?: boolean;
      biometricEnabled?: boolean;
    };
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    pinEnabled?: boolean;
    biometricEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    pinEnabled?: boolean;
    biometricEnabled?: boolean;
  }
}
