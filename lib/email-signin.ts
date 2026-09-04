import { createHash, randomBytes } from "node:crypto";
import { normalizeEmail } from "./oauth-authorization";

// Short-lived by design: a magic link is a bearer credential sitting in an
// inbox until clicked, so it should not stay valid for long.
export const SIGN_IN_TOKEN_TTL_MS = 15 * 60 * 1000;

// Blocks a second link request for the same email within this window,
// without touching (or invalidating) a still-valid link already sent.
export const SIGN_IN_TOKEN_MIN_INTERVAL_MS = 60 * 1000;

export function hashSignInToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSignInToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashSignInToken(token),
    expires: new Date(Date.now() + SIGN_IN_TOKEN_TTL_MS),
  };
}

export type IssueLinkDependencies = {
  findUserByEmail(email: string): Promise<{ status: string } | null>;
  findRecentToken(
    identifier: string,
    since: Date,
  ): Promise<{ createdAt: Date } | null>;
};

export type IssueLinkDecision = {
  identifier: string;
  issue: boolean;
};

// Decides whether a real token should be created and emailed, WITHOUT
// creating anything itself - the caller always shows the same generic
// response either way, so this never leaks account existence.
export async function shouldIssueSignInLink(
  email: string,
  dependencies: IssueLinkDependencies,
  bootstrapEmails: ReadonlySet<string>,
  now = new Date(),
): Promise<IssueLinkDecision> {
  const identifier = normalizeEmail(email);
  if (!identifier) return { identifier, issue: false };

  const recent = await dependencies.findRecentToken(
    identifier,
    new Date(now.getTime() - SIGN_IN_TOKEN_MIN_INTERVAL_MS),
  );
  if (recent) return { identifier, issue: false };

  const existing = await dependencies.findUserByEmail(identifier);
  const eligible =
    (existing !== null && existing.status === "ACTIVE") ||
    bootstrapEmails.has(identifier);
  return { identifier, issue: eligible };
}

export type ConsumeTokenResult = { expires: Date } | null;

export type VerifyTokenDependencies = {
  consumeToken(
    identifier: string,
    tokenHash: string,
  ): Promise<ConsumeTokenResult>;
};

export type TokenVerification =
  | { ok: true; identifier: string }
  | { ok: false; reason: "MALFORMED" | "INVALID" | "EXPIRED" };

// Consumes (deletes) the token as part of validating it, so a token can
// never be checked twice - reuse and replay both land on the same
// already-gone lookup and fail identically.
export async function verifySignInToken(
  email: string,
  token: string,
  dependencies: VerifyTokenDependencies,
  now = new Date(),
): Promise<TokenVerification> {
  const identifier = normalizeEmail(email);
  if (!identifier || !token) return { ok: false, reason: "MALFORMED" };

  const consumed = await dependencies.consumeToken(
    identifier,
    hashSignInToken(token),
  );
  if (!consumed) return { ok: false, reason: "INVALID" };
  if (consumed.expires.valueOf() < now.valueOf())
    return { ok: false, reason: "EXPIRED" };
  return { ok: true, identifier };
}
