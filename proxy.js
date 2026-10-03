// Middleware. Uses the adapter-less auth.config.js rather than auth.js: this
// runs on nearly every request, and pulling the Prisma adapter in here would
// drag the database client into the middleware bundle, which cannot work on
// Lambda. Sessions are JWT, so verifying one needs no database.
import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// An agent asking for markdown gets markdown at the same URL (RFC 9110 content
// negotiation), rather than being sent to a different address for it. Only "/"
// has a markdown representation today; every other path falls through to HTML.
//
// Checked before auth runs: this is a public document either way, and the
// rewrite target is a plain route handler with no session to verify.
function wantsMarkdown(request) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/markdown")) return false;
  // A browser sends a long Accept list that leads with text/html. Only treat
  // markdown as wanted when it is asked for ahead of HTML, so a browser that
  // happens to list it does not get a .md file it cannot render.
  const md = accept.indexOf("text/markdown");
  const html = accept.indexOf("text/html");
  return html === -1 || md < html;
}

export default auth((request) => {
  if (request.nextUrl.pathname === "/" && wantsMarkdown(request)) {
    return NextResponse.rewrite(new URL("/index.md", request.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Auth handlers manage their own cookies. Refreshing the session here
    // would restore the cookie that /api/auth/signout is trying to clear.
    // xml and txt are in this exclusion list for the crawler-facing files:
    // /sitemap.xml, /robots.txt and the IndexNow key file. Running the auth
    // middleware over them made Auth.js stamp two Set-Cookie headers onto
    // every fetch and forced a cache MISS, so each crawl paid a function
    // invocation for a static document.
    "/((?!api/auth(?:/|$)|_next|[^?]*\\.(?:html?|css|js(?!on)|xml|txt|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/api/((?!auth(?:/|$)).*)",
    "/trpc(.*)",
  ],
};
