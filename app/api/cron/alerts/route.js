import { fetchFearGreed } from "@/lib/fearGreed";
import { prisma } from "@/lib/prisma";
import { shouldFire } from "@/lib/fearGreedAlerts";
import { sendEmail } from "@/lib/sendEmail";

// The EventBridge cron (lambda/alerts.ts) calls this route on weekdays. It reads today's index,
// emails every alert whose threshold the index just crossed, and records the
// reading on each row so the next run can tell a crossing from a level.
//
// Not cached: a cached response would mean the job runs once and then replays
// its own output forever.
export const dynamic = "force-dynamic";

// The scheduled Worker handler signs its request with CRON_SECRET. Without this check the
// route is a public URL that anyone can hit to make the app send mail.
function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function body(alert, value) {
  const dir = alert.direction === "above" ? "risen above" : "fallen below";
  return [
    `The market sentiment index has ${dir} ${alert.threshold}.`,
    ``,
    `It now reads ${value}.`,
    ``,
    `You asked to be told when this happened. To stop these emails, remove the`,
    `market sentiment alert from Luna Terminal.`,
  ].join("\n");
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await fetchFearGreed();
  const current = data?.values?.length ? Math.round(data.values[data.values.length - 1]) : null;
  if (current == null) {
    return Response.json({ error: "fear-greed upstream unavailable" }, { status: 502 });
  }

  const alerts = await prisma.fearGreedAlert.findMany();
  let sent = 0;
  let failed = 0;

  for (const alert of alerts) {
    const fire = shouldFire({ ...alert, previous: alert.lastValue, current });
    if (fire) {
      try {
        await sendEmail({
          to: alert.email,
          subject: `Market sentiment ${alert.direction} ${alert.threshold} - now ${current}`,
          text: body(alert, current),
        });
        sent += 1;
      } catch {
        // One bad address must not stop the rest of the run, and the reading
        // is deliberately still recorded below: retrying tomorrow would mean
        // re-sending on a day nothing crossed.
        failed += 1;
      }
    }
    await prisma.fearGreedAlert.update({
      where: { id: alert.id },
      data: { lastValue: current, ...(fire ? { lastSentAt: new Date() } : {}) },
    });
  }

  return Response.json({ current, checked: alerts.length, sent, failed });
}
