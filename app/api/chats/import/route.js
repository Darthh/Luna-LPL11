import { chatRoute, json, readJson } from "@/lib/chatApi";
import { parseImport } from "@/lib/chats.mjs";

// One-time move of the chats a browser kept before sign-in: `{ chats }` in the
// shape lib/chatHistory.js stores. Re-running it is safe - a chat that is
// already saved only gains messages it didn't have.
export const POST = chatRoute(async ({ request, userId, repo }) => {
  const { chats, skipped } = parseImport(await readJson(request));
  let imported = 0;
  for (const chat of chats) {
    const result = await repo.append(userId, chat.id, { from: 0, title: chat.title, messages: chat.messages });
    if (result.created) imported += 1;
  }
  return json({ imported, unchanged: chats.length - imported, skipped });
});
