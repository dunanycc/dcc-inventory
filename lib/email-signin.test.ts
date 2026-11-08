import { describe, expect, it, vi } from "vitest";
import {
  generateSignInToken,
  hashSignInToken,
  shouldIssueSignInLink,
  SIGN_IN_TOKEN_TTL_MS,
  verifySignInToken,
} from "./email-signin";

describe("generateSignInToken", () => {
  it("generates a random token whose stored hash matches hashSignInToken", () => {
    const { token, tokenHash, expires } = generateSignInToken();
    expect(token.length).toBeGreaterThan(20);
    expect(tokenHash).toBe(hashSignInToken(token));
    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("never generates the same token twice", () => {
    const a = generateSignInToken();
    const b = generateSignInToken();
    expect(a.token).not.toBe(b.token);
  });

  it("expires roughly 15 minutes from now", () => {
    const before = Date.now();
    const { expires } = generateSignInToken();
    expect(expires.getTime() - before).toBeCloseTo(SIGN_IN_TOKEN_TTL_MS, -3);
  });
});

describe("shouldIssueSignInLink", () => {
  function dependencies({
    user = null,
    recentToken = null,
  }: {
    user?: { status: string } | null;
    recentToken?: { createdAt: Date } | null;
  } = {}) {
    return {
      findUserByEmail: vi.fn().mockResolvedValue(user),
      findRecentToken: vi.fn().mockResolvedValue(recentToken),
    };
  }

  it("issues a link for an existing active approved user", async () => {
    const deps = dependencies({ user: { status: "ACTIVE" } });
    const result = await shouldIssueSignInLink(
      " Bill@Example.com ",
      deps,
      new Set(),
    );
    expect(result).toEqual({ identifier: "bill@example.com", issue: true });
    expect(deps.findUserByEmail).toHaveBeenCalledWith("bill@example.com");
  });

  it("does not issue a link for an unknown email", async () => {
    const deps = dependencies({ user: null });
    const result = await shouldIssueSignInLink(
      "unknown@example.com",
      deps,
      new Set(),
    );
    expect(result.issue).toBe(false);
  });

  it("does not issue a link for a disabled user", async () => {
    const deps = dependencies({ user: { status: "DISABLED" } });
    const result = await shouldIssueSignInLink(
      "disabled@example.com",
      deps,
      new Set(),
    );
    expect(result.issue).toBe(false);
  });

  it("issues a link for an unknown email on the bootstrap admin list", async () => {
    const deps = dependencies({ user: null });
    const result = await shouldIssueSignInLink(
      "bootstrap@example.com",
      deps,
      new Set(["bootstrap@example.com"]),
    );
    expect(result.issue).toBe(true);
  });

  it("normalizes email case/whitespace before every check", async () => {
    const deps = dependencies({ user: { status: "ACTIVE" } });
    await shouldIssueSignInLink("  Bill@EXAMPLE.com  ", deps, new Set());
    expect(deps.findUserByEmail).toHaveBeenCalledWith("bill@example.com");
    expect(deps.findRecentToken).toHaveBeenCalledWith(
      "bill@example.com",
      expect.any(Date),
    );
  });

  it("does not issue a link (rate limited) when a recent token already exists", async () => {
    const deps = dependencies({
      user: { status: "ACTIVE" },
      recentToken: { createdAt: new Date() },
    });
    const result = await shouldIssueSignInLink(
      "bill@example.com",
      deps,
      new Set(),
    );
    expect(result.issue).toBe(false);
  });

  it("treats an empty email as ineligible without querying anything", async () => {
    const deps = dependencies();
    const result = await shouldIssueSignInLink("   ", deps, new Set());
    expect(result.issue).toBe(false);
    expect(deps.findRecentToken).not.toHaveBeenCalled();
    expect(deps.findUserByEmail).not.toHaveBeenCalled();
  });
});

describe("verifySignInToken", () => {
  it("accepts a valid, unexpired token exactly once (consumption happens via consumeToken)", async () => {
    const consumeToken = vi
      .fn()
      .mockResolvedValue({ expires: new Date(Date.now() + 60_000) });
    const result = await verifySignInToken("bill@example.com", "abc123", {
      consumeToken,
    });
    expect(result).toEqual({ ok: true, identifier: "bill@example.com" });
    expect(consumeToken).toHaveBeenCalledWith(
      "bill@example.com",
      hashSignInToken("abc123"),
    );
  });

  it("rejects when consumeToken finds nothing (invalid, or already used/replayed)", async () => {
    const consumeToken = vi.fn().mockResolvedValue(null);
    const result = await verifySignInToken("bill@example.com", "abc123", {
      consumeToken,
    });
    expect(result).toEqual({ ok: false, reason: "INVALID" });
  });

  it("rejects an expired token even though it was found and consumed", async () => {
    const consumeToken = vi
      .fn()
      .mockResolvedValue({ expires: new Date(Date.now() - 1000) });
    const result = await verifySignInToken("bill@example.com", "abc123", {
      consumeToken,
    });
    expect(result).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("rejects a malformed request with no token", async () => {
    const consumeToken = vi.fn();
    const result = await verifySignInToken("bill@example.com", "", {
      consumeToken,
    });
    expect(result).toEqual({ ok: false, reason: "MALFORMED" });
    expect(consumeToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed request with no email", async () => {
    const consumeToken = vi.fn();
    const result = await verifySignInToken("", "abc123", { consumeToken });
    expect(result).toEqual({ ok: false, reason: "MALFORMED" });
    expect(consumeToken).not.toHaveBeenCalled();
  });

  it("normalizes email before consuming", async () => {
    const consumeToken = vi
      .fn()
      .mockResolvedValue({ expires: new Date(Date.now() + 60_000) });
    await verifySignInToken("  Bill@Example.COM ", "abc123", {
      consumeToken,
    });
    expect(consumeToken).toHaveBeenCalledWith(
      "bill@example.com",
      hashSignInToken("abc123"),
    );
  });
});
