import { TOOLS, TOOL_SCHEMA, systemPrompt } from "@/lib/financialAgentTools.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { answerLocally, renderAnswer } from "@/lib/liloLocal";
import { DEFAULT_HOSTED_MODEL, hostedModel } from "@/lib/hostedModels.mjs";
import { planAws, answerAws } from "@/lib/awsChat.mjs";
import { invokeAgent } from "@/lib/agentCoreClient.mjs";
import { researchIdentity, sessionId } from "@/lib/agentIdentity.mjs";
import { objectKey, readJson } from "@/lib/agentResearch.mjs";

// The AI Bot's harness: Claude, wired to the same live feeds the rest of the
// site draws on. The grounding is the point - a language model asked "what's
// NVDA at" will happily invent a number, so it is given tools instead and the
// fetch is forced rather than suggested (see FETCH_FIRST below).
// A workspace-scoped key carries its workspace already; an org-level key does
// not, and the API rejects the request outright telling you to name one. The
// header is only sent when the variable is set, so a scoped key needs no config.
const anthropic = new Anthropic({
  defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

// Chat latency matters more than frontier-model depth here. Haiku is the
// fastest current Claude model and the deterministic tools still own every
// market number. An environment override can opt a deployment back into a
// larger model without changing the client.
const PLAN_MAX_TOKENS = 2048;
const ANSWER_MAX_TOKENS = 1200;

// Questions per hour. Well under the site's generic API caps because each one
// of these costs real money rather than a cached fetch.
const ANON_LIMIT = 15;
const USER_LIMIT = 100;

// A symbol goes straight into a Yahoo URL, and it was written by a language
// model rather than by a user - so it is filtered, not merely encoded.
// The fetch is enforced by the API, not asked for in prose. tool_choice "any"
// means the first turn cannot answer - it can only call a tool - so there is
// no path where a price gets written from memory. no_data_needed is what makes
// that safe for "what is a P/E ratio", which needs no feed at all.
const FETCH_FIRST = { type: "any" };

// The browser gets one JSON object per line: {"t":"text"|"data"|"error", v}.
// Newline-delimited JSON rather than SSE because nothing here needs event
// names, retries or reconnection - it is one response, read once.
function line(t, v) {
  return new TextEncoder().encode(JSON.stringify({ t, v }) + "\n");
}

export async function POST(request) {
  // Every question here spends tokens that are billed to us, and the widget is
  // on every page for anyone - so the cap is the thing standing between a bored
  // visitor with a loop and the API bill. Signing in raises it, same as the
  // research routes.
  const session = await auth();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identity = session?.user?.id ?? `ip:${ip}`;
  const rate = checkRateLimit(`lilo:${identity}`, session?.user?.id ? USER_LIMIT : ANON_LIMIT);
  if (!rate.ok) {
    return Response.json(
      { error: "You have reached the hourly question limit. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  // Only the two roles the client is allowed to author, and only a recent
  // slice of them - an unbounded history is the easy way to make every
  // answer slow and expensive.
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 16000) }));

  if (!messages.length) {
    return Response.json({ error: "No message." }, { status: 400 });
  }

  const requestedModel = typeof body?.model === "string" ? body.model : DEFAULT_HOSTED_MODEL;
  const config = hostedModel(requestedModel);
  if (!config) {
    return Response.json({ error: "That hosted model is not available." }, { status: 400 });
  }
  if (config.provider === "google" && !process.env.GEMINI_API_KEY) {
    return Response.json({ error: "Gemini requires GEMINI_API_KEY to be configured on the server." }, { status: 503 });
  }

  const system = systemPrompt();
  const question = messages[messages.length - 1].content;
  const useAgent = Boolean(process.env.AGENTCORE_RUNTIME_ARN) && ["bedrock", "mantle"].includes(config.provider);
  const identityInfo = useAgent ? researchIdentity(request, session?.user?.id) : null;
  const documentIds = Array.isArray(body.documentIds) ? body.documentIds.slice(0, 8) : [];
  if (documentIds.length) {
    if (!useAgent) return Response.json({ error: "Document chat requires a deployed AWS agent and an AWS model." }, { status: 503 });
    for (const id of documentIds) {
      const job = await Promise.resolve().then(() => readJson(objectKey(identityInfo.owner, id))).catch(() => null);
      if (job?.status !== "ready" || job.kind !== "document") return Response.json({ error: "An attached document is unavailable or still processing." }, { status: 409 });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (t, v) => controller.enqueue(line(t, v));

      if (config.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
        const local = await answerLocally(question).catch(() => null);
        const rendered = renderAnswer(local);

        // Not an error - the visitor asked something reasonable that this
        // site's own data cannot answer. Saying so plainly, in the same style
        // as any other answer, beats a red failure message.
        send(
          "text",
          rendered ||
            "I can look up live quotes, today's market sentiment reading, and point you to any page on this site. Try naming a ticker or asking where to find a research tool."
        );
        controller.close();
        return;
      }

      // Once the model has written a word to the browser, the local answer can
      // no longer replace it - it would be spliced onto a half-finished
      // sentence. A failure after that point has to surface as an error.
      let streamed = false;

      try {
        if (useAgent) {
          await invokeAgent({ model: requestedModel, messages, owner: identityInfo.owner, documentIds },
            sessionId(identityInfo.owner, typeof body.conversationId === "string" ? body.conversationId.slice(0, 100) : crypto.randomUUID()),
            event => { if (["text", "data", "error"].includes(event.t)) { if (event.t === "text") streamed = true; send(event.t, event.v); } });
          return;
        }
        // Turn one: which feeds does this question need? Not streamed - it
        // produces tool calls, not prose.
        const planned = config.provider !== "anthropic" ? { content: await planAws(config, system, messages, TOOL_SCHEMA) } : await anthropic.messages.create({
          model: config.model,
          max_tokens: PLAN_MAX_TOKENS,
          system,
          messages,
          tools: TOOL_SCHEMA,
          tool_choice: FETCH_FIRST,
        });

        const calls = planned.content.filter((b) => b.type === "tool_use");
        if (!calls.length) throw new Error("The model did not retrieve data before answering.");
        // The whole turn goes back, tool_use blocks and all - the tool results
        // below are only valid as replies to it.
        messages.push({ role: "assistant", content: planned.content });

        const results = [];
        for (const [index, call] of calls.entries()) {
          const run = TOOLS[call.name];
          const result = index >= 4 ? { error: "Tool limit reached; ask a narrower question." } : run
            ? await run(call.input).catch((e) => ({ error: String(e.message || e) }))
            : { error: `No such tool: ${call.name}` };
          if (call.name !== "no_data_needed") {
            send("data", { tool: call.name, args: call.input, result });
          }
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify(result),
            is_error: Boolean(result.error),
          });
        }
        // All results go back in one user message - splitting them teaches the
        // model to stop asking for several tools at once.
        messages.push({ role: "user", content: results });

        // Turn two: the answer, streamed. Tools are withheld so it writes
        // from what it just got rather than looping for more.
        if (config.provider !== "anthropic") {
          await answerAws(config, system, messages, TOOL_SCHEMA, delta => {
            streamed = true;
            send("text", delta);
          });
          return;
        }
        const answer = anthropic.messages.stream({
          model: config.model,
          max_tokens: ANSWER_MAX_TOKENS,
          system,
          messages,
          tools: TOOL_SCHEMA,
          tool_choice: { type: "none" },
        });
        answer.on("text", (delta) => {
          streamed = true;
          send("text", delta);
        });
        await answer.finalMessage();
      } catch (err) {
        if (config.provider !== "anthropic") {
          console.error("Hosted chat failed:", err?.name);
          send("error", streamed ? "The hosted answer was cut off. Try again." : config.provider === "google"
            ? "Gemini could not answer. Check the server's Google API key, model access, and quota."
            : "This AWS model could not answer. Check AWS credentials, region, model access, and inference permissions.");
          return;
        }
        // The model failed - a bad key, no credit, an outage. None of those are
        // the visitor's problem, and the local answer is still correct, so it
        // is sent instead of an error. The reason is logged for whoever runs
        // the site rather than shown to the person who asked a question.
        console.error("Lilo: model call failed, served local answer instead:", err?.error?.error?.message || err?.message || err);
        const local = streamed ? null : await answerLocally(question).catch(() => null);
        const fallback = renderAnswer(local);
        if (fallback) {
          send("text", fallback);
        } else {
          // A mid-stream failure is a genuine error; anything else is just a
          // question outside what local data covers.
          if (streamed) {
            send("error", "The answer was cut off.");
          } else {
            send(
              "text",
              "I can look up live quotes, today's market sentiment reading, and point you to any page on this site. Try naming a ticker or asking where to find a research tool."
            );
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Nginx and friends buffer a response by default, which would hold
      // every token back until the answer finished.
      "X-Accel-Buffering": "no",
      ...(identityInfo?.cookie ? { "Set-Cookie": identityInfo.cookie } : {}),
    },
  });
}
