import { chatRoute, json, readJson } from "@/lib/chatApi";
import { ChatInputError, cleanTitle } from "@/lib/chats.mjs";

export const GET = chatRoute(async ({ userId, repo, chatId }) => {
  const chat = await repo.get(userId, chatId);
  return chat ? json(chat) : json({ error: "Not found" }, 404);
});

// Rename or pin: `{ title?, pinned? }`.
export const PATCH = chatRoute(async ({ request, userId, repo, chatId }) => {
  const body = await readJson(request);
  const changes = {};
  if (body?.title !== undefined) changes.title = cleanTitle(body.title);
  if (body?.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") throw new ChatInputError("pinned must be true or false");
    changes.pinned = body.pinned;
  }
  if (!Object.keys(changes).length) throw new ChatInputError("Nothing to change");
  return (await repo.update(userId, chatId, changes)) ? json({ ok: true }) : json({ error: "Not found" }, 404);
});

export const DELETE = chatRoute(async ({ userId, repo, chatId }) => {
  return (await repo.remove(userId, chatId)) ? new Response(null, { status: 204 }) : json({ error: "Not found" }, 404);
});
