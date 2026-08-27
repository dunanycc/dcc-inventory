import { randomUUID } from "node:crypto";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { Yahoo } from "@/lib/yahoo-provider";

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    authorization: { params: { scope: "openid email profile" } },
  }));
}

if (process.env.AUTH_YAHOO_ID && process.env.AUTH_YAHOO_SECRET) {
  providers.push(Yahoo({
    clientId: process.env.AUTH_YAHOO_ID,
    clientSecret: process.env.AUTH_YAHOO_SECRET,
  }));
}

export const authProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  yahoo: Boolean(process.env.AUTH_YAHOO_ID && process.env.AUTH_YAHOO_SECRET),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers,
  pages: { signIn: "/sign-in", error: "/sign-in" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ user, profile, account }) {
      const email = String(profile?.email ?? user.email ?? "").trim().toLocaleLowerCase("en-CA");
      const verified = profile?.email_verified !== false;
      const approved = email
        ? await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, role: true, status: true } })
        : null;

      if (!verified || !approved || approved.status !== "ACTIVE") {
        await prisma.auditEvent.create({
          data: { action: "LOGIN_REJECTED", entityType: "User", entityId: email || "unknown", after: { provider: account?.provider ?? "unknown" }, correlationId: randomUUID() },
        });
        return false;
      }

      user.id = approved.id;
      user.email = approved.email;
      user.name = approved.name;
      (user as typeof user & { role: string }).role = approved.role;
      await prisma.$transaction([
        prisma.user.update({ where: { id: approved.id }, data: { lastLoginAt: new Date() } }),
        prisma.auditEvent.create({ data: { actorId: approved.id, action: "LOGIN_SUCCEEDED", entityType: "User", entityId: approved.id, after: { provider: account?.provider ?? "unknown" }, correlationId: randomUUID() } }),
      ]);
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.role = (user as typeof user & { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = String(token.role ?? "READ_ONLY") as typeof session.user.role;
      }
      return session;
    },
  },
});
