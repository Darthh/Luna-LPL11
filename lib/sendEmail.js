// Resend over plain fetch. Their SDK is a thin wrapper on this one POST, and a
// dependency that wraps one HTTP call is a dependency that can break the build
// for no reason.
//
// With no RESEND_API_KEY set the send is a no-op that reports itself as
// skipped, so the alert cron runs end to end in development (and on a deploy
// that has not been given a key yet) without failing.
const ENDPOINT = "https://api.resend.com/emails";

export function mailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}

export async function sendEmail({ to, subject, text }) {
  if (!mailerConfigured()) return { skipped: true };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
  return { sent: true };
}
