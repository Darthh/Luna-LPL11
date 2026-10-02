import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Avatars are stored as data: URIs directly on User.image - there's no
// object storage (S3/Blob) wired up in this project, and a small resized
// JPEG comfortably fits in the text column.
const MAX_IMAGE_LENGTH = 200_000;

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const data = {};

  if (body?.name !== undefined) {
    const name = body.name?.toString().trim();
    if (!name) {
      return Response.json({ error: "Name can't be empty" }, { status: 400 });
    }
    if (name.length > 60) {
      return Response.json({ error: "Name must be 60 characters or fewer" }, { status: 400 });
    }
    data.name = name;
  }

  if (body?.image !== undefined) {
    const image = body.image?.toString() || null;
    if (image && !image.startsWith("data:image/")) {
      return Response.json({ error: "Invalid image" }, { status: 400 });
    }
    if (image && image.length > MAX_IMAGE_LENGTH) {
      return Response.json({ error: "Image is too large" }, { status: 400 });
    }
    data.image = image;
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { name: true, image: true },
  });
  return Response.json({ user });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { createdAt: true },
  });
  return Response.json({ user });
}
