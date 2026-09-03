import nodemailer, { type Transporter } from "nodemailer";

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

export async function notifyNewStockRequest(
  email: string | null,
  requestor: string,
) {
  if (!email) return false;
  return sendNotification({
    to: email,
    subject: "New Starter Shack stock request",
    text: `${requestor} submitted a new Starter Shack stock request. Sign in to DCC Inventory to review it.`,
  });
}

export type StockRequestChangeStatus =
  "PARTIALLY_GIVEN" | "GIVEN" | "CANCELLED" | "CLOSED";

const changeMessages: Record<
  StockRequestChangeStatus,
  { subject: string; text(closureComment: string | null): string }
> = {
  PARTIALLY_GIVEN: {
    subject: "Starter Shack request partially fulfilled",
    text: () =>
      "The Bar has given part of the stock on your Starter Shack request. Sign in to DCC Inventory to view what's been given and what's still open.",
  },
  GIVEN: {
    subject: "Starter Shack stock request completed",
    text: () =>
      "The Bar has completed a Starter Shack stock request. Sign in to DCC Inventory to view the quantities given.",
  },
  CANCELLED: {
    subject: "Starter Shack request cancelled",
    text: (closureComment) =>
      `The Bar cancelled a Starter Shack stock request.${closureComment ? ` Reason: "${closureComment}"` : ""} Sign in to DCC Inventory for details.`,
  },
  CLOSED: {
    subject: "Starter Shack request closed",
    text: (closureComment) =>
      `The Bar closed a partially given Starter Shack stock request.${closureComment ? ` Reason: "${closureComment}"` : ""} Sign in to DCC Inventory for details.`,
  },
};

export async function notifyStockRequestChanged(
  email: string | null,
  status: StockRequestChangeStatus,
  closureComment: string | null = null,
) {
  if (!email) return false;
  const { subject, text } = changeMessages[status];
  return sendNotification({ to: email, subject, text: text(closureComment) });
}
