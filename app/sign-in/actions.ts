"use server";

import { redirect } from "next/navigation";
import { generateSignInToken, shouldIssueSignInLink } from "@/lib/email-signin";
import { bootstrapAdminEmails } from "@/lib/oauth-authorization";
import { prisma } from "@/lib/prisma";
import { sendSignInLinkEmail } from "@/lib/request-notifications";

export async function requestSignInLinkAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const { identifier, issue } = await shouldIssueSignInLink(
    email,
    {
      findUserByEmail: (normalizedEmail) =>
        prisma.user.findUnique({
          where: { emailNormalized: normalizedEmail },
          select: { status: true },
        }),
      findRecentToken: (normalizedIdentifier, since) =>
        prisma.verificationToken.findFirst({
          where: {
            identifier: normalizedIdentifier,
            createdAt: { gte: since },
          },
          select: { createdAt: true },
        }),
    },
    bootstrapAdminEmails(),
  );

  if (issue && identifier) {
    const { token, tokenHash, expires } = generateSignInToken();
    try {
      // Only one valid link per email at a time - a fresh request
      // invalidates any earlier unclicked one instead of piling up.
      await prisma.$transaction([
        prisma.verificationToken.deleteMany({ where: { identifier } }),
        prisma.verificationToken.create({
          data: { identifier, tokenHash, expires },
        }),
      ]);
      await sendSignInLinkEmail(identifier, token);
    } catch (error) {
      console.error("Sign-in link email failed", error);
    }
  }

  // Identical outcome regardless of whether `issue` was true - never
  // reveal whether an email is approved.
  redirect("/sign-in?linkSent=1");
}
