import nodemailer, { type Transporter } from "nodemailer";
import { pluralizeUnit } from "./format";

type NotificationMessage = { to: string; subject: string; text: string };

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  if (!user || !pass) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user, pass },
  });
  return transporter;
}

async function sendNotification(message: NotificationMessage) {
  const client = getTransporter();
  if (!client) return false;
  const from = process.env.EMAIL_FROM?.trim() || process.env.SMTP_USER!.trim();
  await client.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  return true;
}

function buildLink(path: string) {
  const base = (process.env.APP_URL?.trim() || "http://localhost:3016").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

export type RequestEmailItem = { name: string; unit: string; quantity: string };

function formatItems(items: readonly RequestEmailItem[]) {
  return items
    .map(
      (item) =>
        `- ${item.name}: ${item.quantity} ${pluralizeUnit(item.quantity, item.unit)}`.trim(),
    )
    .join("\n");
}

// The link is built entirely server-side from a cryptographically random
// token - nothing here comes from user input, so there is no way for a raw
// HTML/MIME injection to reach this message.
export async function sendSignInLinkEmail(email: string, token: string) {
  const url = buildLink(
    `/sign-in/verify?${new URLSearchParams({ token, email }).toString()}`,
  );
  return sendNotification({
    to: email,
    subject: "Sign in to DCC Inventory",
    text: [
      "Use the link below to sign in to DCC Inventory.",
      "",
      url,
      "",
      "This link expires in 15 minutes and can only be used once.",
      "",
      "If you did not request this, you can safely ignore this email.",
    ].join("\n"),
  });
}

export async function notifyNewStockRequest(
  email: string | null,
  requestorName: string,
  requestId: string,
  items: readonly RequestEmailItem[],
  notes: string | null,
) {
  if (!email) return false;
  const parts = [
    `${requestorName} submitted a new Starter Shack stock request:`,
    "",
    formatItems(items),
  ];
  if (notes) parts.push("", `Notes: ${notes}`);
  parts.push(
    "",
    `Review and fulfill: ${buildLink(`/requests#request-${requestId}`)}`,
  );
  return sendNotification({
    to: email,
    subject: "New Starter Shack stock request",
    text: parts.join("\n"),
  });
}

export type StockRequestChangeStatus =
  "PARTIALLY_GIVEN" | "GIVEN" | "CANCELLED" | "CLOSED";

export async function notifyStockRequestChanged(
  email: string | null,
  status: StockRequestChangeStatus,
  requestId: string,
  details: {
    givenItems?: readonly RequestEmailItem[];
    closureComment?: string | null;
  } = {},
) {
  if (!email) return false;
  const link = buildLink(`/starter-shack?tab=status#request-${requestId}`);
  const parts: string[] = [];
  if (status === "PARTIALLY_GIVEN" || status === "GIVEN") {
    parts.push(
      status === "GIVEN"
        ? "The Bar has completed your Starter Shack stock request:"
        : "The Bar has given part of the stock on your Starter Shack request:",
      "",
      formatItems(details.givenItems ?? []),
    );
  } else {
    parts.push(
      status === "CANCELLED"
        ? "The Bar cancelled your Starter Shack stock request."
        : "The Bar closed your partially given Starter Shack stock request.",
    );
    if (details.closureComment)
      parts.push(`Reason: "${details.closureComment}"`);
  }
  parts.push("", `View the request: ${link}`);
  const subjects: Record<StockRequestChangeStatus, string> = {
    PARTIALLY_GIVEN: "Starter Shack request partially fulfilled",
    GIVEN: "Starter Shack stock request completed",
    CANCELLED: "Starter Shack request cancelled",
    CLOSED: "Starter Shack request closed",
  };
  return sendNotification({
    to: email,
    subject: subjects[status],
    text: parts.join("\n"),
  });
}
