import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_ALERTS_PER_USER, validateAlert } from "@/lib/fearGreedAlerts";

const UNAUTHORIZED = { error: "Sign in required" };

const SELECT = { id: true, direction: true, threshold: true, email: true, lastSentAt: true };

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });
  const alerts = await prisma.fearGreedAlert.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: SELECT,
  });
  return Response.json({ alerts });
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  // Default to the address they signed in with; the form can override it.
  const email = (body?.email ?? session.user.email ?? "").trim();
  const direction = body?.direction;
  const threshold = Number(body?.threshold);

  const invalid = validateAlert({ direction, threshold, email });
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  // A cap per user, because each row is an email this app will send on their
  // behalf and an unbounded list is an unbounded send.
  const count = await prisma.fearGreedAlert.count({ where: { userId } });
  if (count >= MAX_ALERTS_PER_USER) {
    return Response.json(
      { error: `You can have up to ${MAX_ALERTS_PER_USER} alerts.` },
      { status: 400 }
    );
  }

  const alert = await prisma.fearGreedAlert.create({
    data: { userId, email, direction, threshold },
    select: SELECT,
  });
  return Response.json({ alert }, { status: 201 });
}

export async function DELETE(request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  // Scoped to the signed-in user, so an id belonging to someone else deletes
  // nothing rather than deleting theirs.
  const { count } = await prisma.fearGreedAlert.deleteMany({
    where: { id, userId: session.user.id },
  });
  if (!count) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
