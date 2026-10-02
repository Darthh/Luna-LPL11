// Relay for Market Share's "play a friend" mode. The game is turn-based and
// each client owns the engine, so the room only has to hold the last state one
// player pushed and hand it to the other. No rules run here.
//
// ponytail: rooms live in process memory, so they die with the server and do
// not survive more than one instance. Move to Redis or the DB if this ever
// needs to outlive a restart or run behind more than one node.
export const dynamic = "force-dynamic";

const ROOM_TTL = 6 * 60 * 60 * 1000;
const rooms = (globalThis.__marketShareRooms ??= new Map());

function sweep() {
  const cutoff = Date.now() - ROOM_TTL;
  for (const [id, room] of rooms) if (room.at < cutoff) rooms.delete(id);
}

// Room ids are generated client-side and only ever used as a map key, so they
// are clamped here rather than trusted: no path, no length blowup, no unicode.
const cleanId = (v) =>
  typeof v === "string" && /^[a-z0-9]{4,24}$/i.test(v) ? v : null;

export async function GET(req) {
  const id = cleanId(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "bad id" }, { status: 400 });
  sweep();
  return Response.json(rooms.get(id) || { v: 0 });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  const id = cleanId(body?.id);
  if (!id) return Response.json({ error: "bad id" }, { status: 400 });
  if (!body.patch || typeof body.patch !== "object")
    return Response.json({ error: "bad patch" }, { status: 400 });
  // A whole board state is a few tens of KB; anything far past that is not us.
  if (JSON.stringify(body.patch).length > 400_000)
    return Response.json({ error: "too big" }, { status: 413 });

  sweep();
  const room = rooms.get(id) || { v: 0 };
  const next = { ...room, ...body.patch, v: room.v + 1, at: Date.now() };
  rooms.set(id, next);
  return Response.json({ v: next.v });
}
