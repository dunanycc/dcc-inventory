import { randomUUID } from "node:crypto";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { verifySignInToken } from "@/lib/email-signin";
import { prisma } from "@/lib/prisma";
import { Yahoo } from "@/lib/yahoo-provider";
import {
  authorizeOAuthIdentity,
  normalizeEmail,
} from "@/lib/oauth-authorization";

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { scope: "openid email profile" } },
    }),
  );
}

if (process.env.AUTH_YAHOO_ID && process.env.AUTH_YAHOO_SECRET) {
  providers.push(
    Yahoo({
      clientId: process.env.AUTH_YAHOO_ID,
      clientSecret: process.env.AUTH_YAHOO_SECRET,
    }),
  );
}

const emailLinkConfigured = Boolean(
  process.env.SMTP_USER && process.env.SMTP_PASSWORD,
);

if (emailLinkConfigured) {
  providers.push(
    Credentials({
      id: "email-link",
      name: "Email link",
      credentials: { email: { label: "Email" }, token: { label: "Token" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const token = String(credentials?.token ?? "");
        const verification = await verifySignInToken(email, token, {
          async consumeToken(identifier, tokenHash) {
            try {
              const row = await prisma.verificationToken.delete({
                where: { tokenHash },
                select: { expires: true, identifier: true },
              });
              // A token hash is only ever valid for the identifier it was
              // issued to; a mismatch here is treated the same as "not
              // found" rather than trusting the caller's claimed email.
              return row.identifier === identifier ? row : null;
            } catch {
              return null;
            }
          },
        });
        if (!verification.ok) return null;
        // Only proves the requester owns this mailbox. Whether they are an
        // approved, active User is decided by the shared signIn callback
        // below, exactly like Google/Yahoo.
        return { email: verification.identifier };
      },
    }),
  );
}

export const authProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  yahoo: Boolean(process.env.AUTH_YAHOO_ID && process.env.AUTH_YAHOO_SECRET),
  emailLink: emailLinkConfigured,
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers,
  pages: { signIn: "/sign-in", error: "/sign-in" },
  // maxAge: session lifetime with no activity. updateAge: how often an
  // active session's expiry is pushed back out, so regular use keeps
  // someone signed in without a custom refresh-token scheme.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    async signIn({ user, profile, account }) {
      const email = normalizeEmail(String(profile?.email ?? user.email ?? ""));
      const provider = account?.provider ?? "unknown";
      // OAuth proves ownership via the provider's own verified-email flag;
      // email-link proves it by successfully consuming a one-time token in
      // this Credentials provider's authorize() above - reaching this
      // callback at all is itself the proof for that path.
      const emailVerified =
        provider === "email-link" ? true : profile?.email_verified === true;
      const approved = await authorizeOAuthIdentity(
        {
          email,
          emailVerified,
          name: profile?.name ?? user.name,
          provider,
        },
        {
          findUserByEmail: (normalizedEmail) =>
            prisma.user.findUnique({
              where: { emailNormalized: normalizedEmail },
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
              },
            }),
          async createBootstrapAdministrator(input) {
            try {
              return await prisma.$transaction(async (transaction) => {
                const created = await transaction.user.create({
                  data: {
                    email: input.email,
                    emailNormalized: input.email,
                    name: input.name,
                    role: "ADMINISTRATOR",
                    status: "ACTIVE",
                  },
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                  },
                });
                await transaction.auditEvent.create({
                  data: {
                    actorId: created.id,
                    action: "BOOTSTRAP_ADMIN_CREATED",
                    entityType: "User",
                    entityId: created.id,
                    after: {
                      email: created.email,
                      role: created.role,
                      status: created.status,
                      provider: input.provider,
                    },
                    reason: "Verified email matched BOOTSTRAP_ADMIN_EMAILS",
                    correlationId: randomUUID(),
                  },
                });
                return created;
              });
            } catch (error) {
              if (
                typeof error === "object" &&
                error &&
                "code" in error &&
                error.code === "P2002"
              ) {
                const racedUser = await prisma.user.findUnique({
                  where: { emailNormalized: input.email },
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                  },
                });
                if (racedUser) return racedUser;
              }
              throw error;
            }
          },
        },
      );

      if (!approved) {
        await prisma.auditEvent.create({
          data: {
            action: "LOGIN_REJECTED",
            entityType: "User",
            entityId: email || "unknown",
            after: { provider },
            correlationId: randomUUID(),
          },
        });
        return false;
      }

      user.id = approved.id;
      user.email = approved.email;
      user.name = approved.name;
      (user as typeof user & { role: string }).role = approved.role;
      await prisma.$transaction([
        prisma.user.update({
          where: { id: approved.id },
          data: { lastLoginAt: new Date() },
        }),
        prisma.auditEvent.create({
          data: {
            actorId: approved.id,
            action: "LOGIN_SUCCEEDED",
            entityType: "User",
            entityId: approved.id,
            after: { provider },
            correlationId: randomUUID(),
          },
        }),
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
        session.user.role = String(
          token.role ?? "READ_ONLY",
        ) as typeof session.user.role;
      }
      return session;
    },
  },
});
