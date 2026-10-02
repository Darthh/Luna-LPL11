import { estimateTokens, homeMarkdown } from "@/lib/homeMarkdown";

// The markdown representation of "/". Reached two ways: directly at
// /index.md, and by asking for "/" with Accept: text/markdown, which proxy.js
// rewrites here. The URL the agent asked for stays "/" in that case, which is
// what content negotiation means - same resource, different representation.
export const revalidate = 3600;

export async function GET() {
  const body = homeMarkdown();
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // Advisory, for agents budgeting a context window.
      "x-markdown-tokens": String(estimateTokens(body)),
      // The same URL now answers with HTML or markdown depending on Accept, so
      // a cache must key on it or it will serve one to a client asking for the
      // other.
      Vary: "Accept",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
