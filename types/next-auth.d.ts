import "next-auth";
import type { AppRole } from "@/lib/authorization";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT { role?: string }
}
