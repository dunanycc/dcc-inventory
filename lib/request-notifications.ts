type NotificationMessage = { to: string; subject: string; text: string };

async function sendNotification(message: NotificationMessage) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok) throw new Error(`EMAIL_DELIVERY_FAILED_${response.status}`);
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

export async function notifyStockRequestCompleted(email: string | null) {
  if (!email) return false;
  return sendNotification({
    to: email,
    subject: "Starter Shack stock request completed",
    text: "The Bar has completed a Starter Shack stock request. Sign in to DCC Inventory to view the quantities given.",
  });
}
