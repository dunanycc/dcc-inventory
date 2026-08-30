import { randomUUID } from "node:crypto";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { Yahoo } from "@/lib/yahoo-provider";
import { authorizeOAuthIdentity, normalizeEmail } from "@/lib/oauth-authorization";

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
      const email = normalizeEmail(String(profile?.email ?? user.email ?? ""));
      const provider = account?.provider ?? "unknown";
      const approved = await authorizeOAuthIdentity(
        { email, emailVerified: profile?.email_verified === true, name: profile?.name ?? user.name, provider },
        {
          findUserByEmail: (normalizedEmail) => prisma.user.findUnique({ where: { emailNormalized: normalizedEmail }, select: { id: true, name: true, email: true, role: true, status: true } }),
          async createBootstrapAdministrator(input) {
            try {
              return await prisma.$transaction(async (transaction) => {
                const created = await transaction.user.create({
                  data: { email: input.email, emailNormalized: input.email, name: input.name, role: "ADMINISTRATOR", status: "ACTIVE" },
                  select: { id: true, name: true, email: true, role: true, status: true },
                });
                await transaction.auditEvent.create({
                  data: { actorId: created.id, action: "BOOTSTRAP_ADMIN_CREATED", entityType: "User", entityId: created.id, after: { email: created.email, role: created.role, status: created.status, provider: input.provider }, reason: "Verified OAuth email matched BOOTSTRAP_ADMIN_EMAILS", correlationId: randomUUID() },
                });
                return created;
              });
            } catch (error) {
              if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
                const racedUser = await prisma.user.findUnique({ where: { emailNormalized: input.email }, select: { id: true, name: true, email: true, role: true, status: true } });
                if (racedUser) return racedUser;
              }
              throw error;
            }
          },
        },
      );

      if (!approved) {
        await prisma.auditEvent.create({
          data: { action: "LOGIN_REJECTED", entityType: "User", entityId: email || "unknown", after: { provider }, correlationId: randomUUID() },
        });
        return false;
      }

      user.id = approved.id;
      user.email = approved.email;
      user.name = approved.name;
      (user as typeof user & { role: string }).role = approved.role;
      await prisma.$transaction([
        prisma.user.update({ where: { id: approved.id }, data: { lastLoginAt: new Date() } }),
        prisma.auditEvent.create({ data: { actorId: approved.id, action: "LOGIN_SUCCEEDED", entityType: "User", entityId: approved.id, after: { provider }, correlationId: randomUUID() } }),
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
