This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

## Local Ollama chat

Start Ollama on the same computer as your browser, with at least one chat model
installed (`ollama pull llama3.2` if needed). Run `npm run dev`, open
`http://localhost:3000/dashboard`, and choose **Ollama** in the empty dashboard's
chat workspace. Installed models load automatically; select one beside the send
button. **Connection → Refresh models** picks up newly installed models.
The floating **Lilo AI** chat also discovers Ollama models when opened locally.

This connection needs no Luna sign-in or API key. Messages go
directly from your browser to `http://127.0.0.1:11434`, not to Luna's servers.
Local models have no live market feeds. Luna hosted chat and the manual
OpenAI-compatible connection remain available separately.

Use a localhost URL, not the LAN address printed by Next.js. Ollama normally
allows localhost origins. If your browser reports a connection/origin error,
set `OLLAMA_ORIGINS` to your exact local origin (for example,
`http://localhost:3000`) in Ollama's environment and restart Ollama. See the
[Ollama FAQ](https://docs.ollama.com/faq) for platform-specific instructions.
The automatic browser connection is shown only on localhost; the desktop app
continues to use its existing native Ollama bridge.

## Accounts

User accounts are powered by [Auth.js](https://authjs.dev) (formerly
NextAuth), Prisma, and PostgreSQL (see `prisma/schema.prisma`).

1. Set `DATABASE_URL` to a PostgreSQL database and run `npm run db:migrate`.
2. Set `AUTH_SECRET` (generate one with `npx auth secret`, or any
   random 32-byte base64 string).
3. Start the dev server - Sign in / Sign up work right away with
   email + password.

### Adding Google sign-in (optional)

The Google button only appears once these two are set, since Auth.js
checks for them at startup:

1. Go to the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials),
   create a project if you don't have one.
2. **Configure the OAuth consent screen** (if prompted): choose *External*,
   fill in an app name and your email, and save - no verification needed
   for testing with your own Google account.
3. **Create Credentials → OAuth client ID**, application type **Web
   application**. Add an authorized redirect URI:
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
   - `https://yourdomain.com/api/auth/callback/google` (once deployed)
4. Copy the **Client ID** and **Client secret** into `.env.local`:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
5. Restart the dev server.

Being signed in raises the hourly quota on `/api/prices` from 60 requests
(per IP) to 600 (per account) - see `lib/rateLimit.js`.

## AI Bot

`/ai-bot` is a market answer engine: ask a question, get a short answer with
the live numbers it used shown above it.

It runs on Claude. Put an `ANTHROPIC_API_KEY` from
[console.anthropic.com](https://console.anthropic.com) in `.env.local` and
start the site. Without the key the tab still loads and uses local market-data
answers.

Tokens are billed per question. `AI_BOT_MODEL` and `AI_BOT_EFFORT` (see
`.env.local.example`) are the two dials: `claude-haiku-4-5` costs about a
fifth of the default, and effort `low` - the default - is what keeps answers
arriving in a couple of seconds rather than ten.

**The model never states a price from memory.** A question is answered in two
turns: one that fetches, and one that writes the answer with those results in
front of it. The first turn is sent with `tool_choice: {type: "any"}`, so the
API will not let it answer at all - it can only call a tool, and
`no_data_needed` is the escape hatch for "what is a P/E ratio". The guarantee
is in the request, not in the prompt: an earlier local-model version asked
nicely instead, and answered "SPY is at $482.36" against a live $773.26.

## News and relationship research

Stock pages include a **Recent News** timeline. It identifies the largest daily
move in the selected chart range (or the latest move on an intraday chart),
loads company reporting published around that session, and marks the date on
the price chart. Supply-chain relationship rows search bounded monthly windows
for articles that mention both companies and relevant product terms. Upcoming
Events ranks the latest general and forex reporting for each release type.

Add `FINNHUB_API_KEY` to `.env.local` to enable these features. The key is
server-only and is shared by the existing earnings fallback. Company-news
requests are cached for six hours, market news for 30 minutes, and the public
endpoints have separate hourly limits. Without a key, the rest of each page
continues to work and the news surfaces explain what needs configuring.
