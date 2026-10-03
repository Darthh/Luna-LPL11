import { chatRoute, json, readJson } from "@/lib/chatApi";
import { ChatInputError } from "@/lib/chats.mjs";
import { accountChatMemory } from "@/lib/accountChatMemory.mjs";

export const POST = chatRoute(async ({ request, userId, repo }) => {
  const body = await readJson(request);
  if (typeof body?.question !== "string" || !body.question.trim() || body.question.length > 8000) {
    throw new ChatInputError("A question of up to 8000 characters is required");
  }
  const excluded = Array.isArray(body.excluded)
    ? body.excluded.filter((text) => typeof text === "string").slice(-12).map((text) => text.slice(0, 32000))
    : [];
  const memories = await accountChatMemory(repo, userId, body.question, excluded);
  return json({ memories, scope: "account" }, 200, { "Cache-Control": "private, no-store" });
});
