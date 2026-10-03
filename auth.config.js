// The half of the Auth.js config that is safe to run in middleware.
//
// proxy.js runs on every matched request, and importing the full auth.js there
// pulls in the Prisma adapter and bcryptjs with it - and with them the AWS SDK
// that signs the database token, none of which the middleware bundle should
// carry on every request. So middleware gets this adapter-less config and
// auth.js keeps the database half.
//
// Safe because sessions are JWT: middleware only has to read and verify the
// cookie, which needs no database lookup at all.
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";

// Each social sign-in turns on when its credentials are set (Auth.js reads
// AUTH_<PROVIDER>_ID / _SECRET itself). docs/DEPLOY.md §1 has the setup.
export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);
export const appleEnabled = Boolean(
  process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET
);

// Apple returns to the callback with a cross-site POST (response_mode
// form_post), and browsers drop SameSite=Lax cookies on those, so the state,
// nonce and PKCE checks would fail with InvalidCheck. Those three short-lived
// cookies are sent SameSite=None instead. That needs Secure, i.e. HTTPS,
// which Apple requires anyway.
const crossSite = (name) => ({
  name: `__Secure-${name}`,
  options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
});
const appleCookies = appleEnabled
  ? {
      cookies: {
        state: crossSite("authjs.state"),
        nonce: crossSite("authjs.nonce"),
        pkceCodeVerifier: crossSite("authjs.pkce.code_verifier"),
      },
    }
  : {};

export const authConfig = {
  // Auth.js refuses to serve /api/auth/* unless it trusts the request host.
  // On Vercel it inferred this from VERCEL_URL, which does not exist on Lambda
  // - without this every sign-in fails with UntrustedHost. Safe here because
  // only CloudFront reaches the function, so the only hostnames that can arrive
  // are the distribution's own and whatever custom domain is attached to it.
  trustHost: true,
  session: { strategy: "jwt" },
  ...appleCookies,
  pages: {
    // No dedicated /login page - sign-in happens in AuthModal (a client
    // component), matching the rest of this single-page app.
    error: "/",
  },
  // Credentials lives in auth.js: its authorize() needs the database, and
  // middleware never runs a sign-in, only reads an existing session.
  providers: [...(googleEnabled ? [Google] : []), ...(appleEnabled ? [Apple] : [])],
  callbacks: {
    // Same shape as auth.js: the id rides on token.id (set by its jwt
    // callback), not token.sub, so a token minted there reads back correctly
    // when middleware verifies it here.
    async session({ session, token }) {
      if (session.user) session.user.id = token.id;
      return session;
    },
  },
};
