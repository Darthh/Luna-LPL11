import { chatRoute, json, readJson } from "@/lib/chatApi";
import { parseAppend } from "@/lib/chats.mjs";

// Save a conversation: `{ title?, from?, messages }`. Creates the chat on the
// first call. Sending the whole history every time is fine - only messages at
// indexes the store doesn't have yet are written, so retries are harmless.
// 409 with `messageCount` means `from` skipped ahead; resend from there.
export const POST = chatRoute(async ({ request, userId, repo, chatId }) => {
  const input = parseAppend(await readJson(request));
  const result = await repo.append(userId, chatId, input);
  return json({ ok: true, ...result }, result.created ? 201 : 200);
});
