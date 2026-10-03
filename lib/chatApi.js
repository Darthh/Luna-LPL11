// The shared front half of every /api/chats route: a session (chats belong to
// an account), a rate limit, a configured store, and one place that turns
// validation and store errors into HTTP answers.
import { auth } from "@/auth";
import { checkRateLimit, SIGNED_IN_LIMIT } from "@/lib/rateLimit";
import { ChatInputError, isChatId } from "@/lib/chats.mjs";
import { ChatGapError, getChatRepository } from "@/lib/chatRepository.mjs";

const json = (body, status = 200, headers) => Response.json(body, { status, headers });

// Wraps a handler as `(ctx) => Response` where ctx carries the user id, the
// store, and (for /api/chats/[id]/...) a validated chat id.
export function chatRoute(handler) {
  return async (request, context) => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return json({ error: "Sign in required" }, 401);

    const rate = await checkRateLimit(`chats:${userId}`, SIGNED_IN_LIMIT);
    if (!rate.ok) {
      return json({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
    }

    // Not configured: the client keeps chats in the browser, as it does for
    // signed-out users, rather than saving into a store that loses them.
    const repo = await getChatRepository();
    if (!repo) return json({ error: "Chat sync is not configured" }, 503);

    const params = (await context?.params) ?? {};
    const chatId = params.id;
    if ("id" in params && !isChatId(chatId)) return json({ error: "Not found" }, 404);

    try {
      return await handler({ request, userId, repo, chatId });
    } catch (error) {
      if (error instanceof ChatInputError) return json({ error: error.message }, 400);
      if (error instanceof ChatGapError) return json({ error: error.message, messageCount: error.messageCount }, 409);
      console.error("chats route failed", error);
      return json({ error: "Could not reach chat storage" }, 500);
    }
  };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ChatInputError("Expected a JSON body");
  }
}

export { json };
