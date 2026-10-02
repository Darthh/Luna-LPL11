import { validateClient } from "./financeCrm.mjs";

// Dependencies are injected so account isolation and stale writes can be tested
// without a live database or an authentication session.
export function crmHandlers({ auth, prisma }) {
  const json = (data, status = 200) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  const decode = (row) => ({
    ...JSON.parse(row.data),
    id: row.id,
    revision: row.revision,
  });
  const handle = (method) => async (request) => {
    try {
      const session = await auth();
      if (!session?.user?.id)
        return json({ error: "Sign in to save and manage clients." }, 401);
      const userId = session.user.id;
      const db = prisma.advisorClient;
      if (method === "GET")
        return json({
          clients: (
            await db.findMany({
              where: { userId },
              orderBy: { createdAt: "desc" },
            })
          ).map(decode),
        });
      const raw = await request.text();
      if (raw.length > 200000)
        return json({ error: "Client record is too large." }, 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: "Invalid client record." }, 400);
      }
      if (
        method !== "POST" &&
        (typeof body?.id !== "string" ||
          !body.id ||
          body.id.length > 100 ||
          !Number.isInteger(body.revision) ||
          body.revision < 1)
      )
        return json({ error: "Invalid client identifier or revision." }, 400);
      const where = { id: body?.id, userId, revision: body?.revision };
      if (method === "DELETE") {
        const result = await db.deleteMany({ where });
        return result.count
          ? json({ deleted: body.id })
          : json(
              {
                error:
                  "This client changed or is no longer available. Close the editor and refresh.",
              },
              409,
            );
      }
      let client;
      try {
        client = validateClient(body);
      } catch (error) {
        return json({ error: error.message }, 400);
      }
      const data = JSON.stringify(client);
      if (method === "POST") {
        const row = await db.create({ data: { userId, data } });
        return json({ client: decode(row) }, 201);
      }
      const result = await db.updateMany({
        where,
        data: { data, revision: { increment: 1 } },
      });
      return result.count
        ? json({
            client: { ...client, id: body.id, revision: body.revision + 1 },
          })
        : json(
            {
              error:
                "This client changed or is no longer available. Close the editor and refresh.",
            },
            409,
          );
    } catch {
      return json(
        { error: "Client storage is unavailable. Please try again." },
        503,
      );
    }
  };
  return {
    GET: handle("GET"),
    POST: handle("POST"),
    PUT: handle("PUT"),
    DELETE: handle("DELETE"),
  };
}
