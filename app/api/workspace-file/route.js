import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decodeItem, validateItem, WorkspaceInputError } from "@/lib/advisorItems.mjs";
import { documentCsv, documentPdf } from "@/lib/workspaceFiles.mjs";
import { checkRateLimit, SIGNED_IN_LIMIT } from "@/lib/rateLimit";

export async function POST(request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ error: "Sign in to download account documents." }, { status: 401 });
  if (!(await checkRateLimit(`workspace-file:${userId}`, SIGNED_IN_LIMIT)).ok) return Response.json({ error: "Too many downloads." }, { status: 429 });
  try {
    const raw = await request.text();
    if (raw.length > 120000) return Response.json({ error: "Document is too large." }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!["csv", "pdf"].includes(body.format)) return Response.json({ error: "Choose CSV or PDF." }, { status: 400 });
    let item;
    if (body.id) {
      const row = await prisma.advisorItem.findFirst({ where: { id: body.id, userId } });
      if (!row) return Response.json({ error: "Document not found." }, { status: 404 });
      item = decodeItem(row);
    } else item = validateItem(body.item, body.item?.destination || "reports");
    const filename = item.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "luna-document";
    return new Response(body.format === "pdf" ? await documentPdf(item) : documentCsv(item), {
      headers: { "Content-Type": body.format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.${body.format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof WorkspaceInputError ? error.message : "Could not create the file. Try again." }, { status: error instanceof WorkspaceInputError ? 400 : 503 });
  }
}
