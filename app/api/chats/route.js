import { chatRoute, json } from "@/lib/chatApi";

// The signed-in user's saved chats, newest first: ?cursor=&limit=&q=
export const GET = chatRoute(async ({ request, userId, repo }) => {
  const params = new URL(request.url).searchParams;
  const page = await repo.list(userId, {
    cursor: params.get("cursor") || undefined,
    limit: params.get("limit") || undefined,
    q: params.get("q") || undefined,
  });
  return json(page);
});
