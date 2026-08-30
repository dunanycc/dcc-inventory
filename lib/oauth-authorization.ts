export type InventoryAuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
};

export type OAuthAuthorizationDependencies = {
  findUserByEmail(email: string): Promise<InventoryAuthUser | null>;
  createBootstrapAdministrator(input: { email: string; name: string | null; provider: string }): Promise<InventoryAuthUser>;
};

export type OAuthIdentity = {
  email: string | null | undefined;
  emailVerified: boolean;
  name: string | null | undefined;
  provider: string;
};

export function normalizeEmail(email: string | null | undefined) {
  return String(email ?? "").replace(/^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g, "").toLowerCase();
}

export function bootstrapAdminEmails(value = process.env.BOOTSTRAP_ADMIN_EMAILS) {
  return new Set(String(value ?? "").split(",").map(normalizeEmail).filter(Boolean));
}

export async function authorizeOAuthIdentity(
  identity: OAuthIdentity,
  dependencies: OAuthAuthorizationDependencies,
  configuredBootstrapEmails = bootstrapAdminEmails(),
) {
  const email = normalizeEmail(identity.email);
  if (!email || !identity.emailVerified) return null;

  const existing = await dependencies.findUserByEmail(email);
  if (existing) return existing.status === "ACTIVE" ? existing : null;
  if (!configuredBootstrapEmails.has(email)) return null;

  const created = await dependencies.createBootstrapAdministrator({
    email,
    name: identity.name?.trim() || null,
    provider: identity.provider,
  });
  return created.status === "ACTIVE" ? created : null;
}
