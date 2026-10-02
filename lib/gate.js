import { cookies } from "next/headers";

// One shared password in front of the private RSI backtester section
// (/ai-bot) and the routes that feed it. Not accounts - there is one
// door and one key, so the cookie holds the key itself: forging it is exactly
// as hard as knowing the password.
export const PASSWORD = process.env.PRIVATE_PASSWORD || "Darth360";
export const COOKIE = "private_gate";

export async function unlocked() {
  return (await cookies()).get(COOKIE)?.value === PASSWORD;
}
