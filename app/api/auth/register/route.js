import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Auth.js only handles sign-IN; account creation for the credentials
// provider is entirely our own responsibility. This creates the user row
// with a hashed password; the client then calls signIn("credentials", ...)
// to establish the session.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.toString().trim().toLowerCase();
  const password = body?.password?.toString();
  const name = body?.name?.toString().trim() || null;
  const turnstileToken = body?.turnstileToken?.toString();

  // Bot check. Needs both halves: the secret here and the public site key the
  // signup form renders the widget with. With either missing it is skipped, so
  // a form that shows no widget is never rejected for lacking a token.
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    if (!turnstileToken) {
      return Response.json({ error: "Bot verification failed. Please try again." }, { status: 403 });
    }
    // Fails closed: a siteverify outage rejects signups rather than letting
    // every bot through.
    let verified = false;
    try {
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({
          secret,
          response: turnstileToken,
          // Turnstile is a standalone API and still works with the site off
          // Cloudflare; only the client IP has to come from somewhere else.
          // CloudFront puts the real client first in X-Forwarded-For, then
          // appends each proxy hop after it.
          remoteip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
        }),
      });
      verified = res.ok && (await res.json())?.success === true;
    } catch {
      verified = false;
    }
    if (!verified) {
      return Response.json({ error: "Bot verification failed. Please try again." }, { status: 403 });
    }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, name, passwordHash } });

  return Response.json({ ok: true });
}
