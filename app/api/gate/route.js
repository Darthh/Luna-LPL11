import { cookies } from "next/headers";
import { COOKIE, PASSWORD, unlocked } from "@/lib/gate";

// GET: are we already through? The cookie is httpOnly, so the gate component
// cannot read it and has to ask.
export async function GET() {
  return Response.json({ ok: await unlocked() });
}

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  if (password !== PASSWORD) return Response.json({ ok: false }, { status: 401 });
  // Session cookie - no maxAge, so closing the browser locks it again.
  // Not `secure` in dev, or localhost over plain http never gets the cookie.
  (await cookies()).set(COOKIE, PASSWORD, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return Response.json({ ok: true });
}
