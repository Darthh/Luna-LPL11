# Presentation script and demo recording

For the current 7-slide deck (LPL Financial Hackathon 2026). It follows the
judging rubric:
- tell the story from problem to solution;
- show only what's built;
- explain the AWS "why";
- end with why LPL should want it.

Suggested categories: **Best Technical Execution** and **Biggest Business
Impact**. Every team is also judged on Best Use of AWS.

Before presenting, fix two things in the deck:
- **Slide 4:** "U.Ss" should be "U.S.".
- **Slide 6:** retitle "Features list" to **"Why it matters for LPL"** and
  delete "Optional subtitle goes here".

Target length: about 6 minutes. Adjust the demo segment to the time slot you're given.

## Talk track, slide by slide

Speakers are suggestions; swap freely. Say the **bold** lines word for word;
the rest are talking points.

### Slide 1: Title (Patrick, 15 s)
- **"We're Luna Terminal: an AI research agent that gets a financial advisor
  ready for a client meeting in minutes, built on AWS."**
- Names, then: "We're competing for Best Technical Execution and Biggest
  Business Impact."

### Slide 2: "Picture this" (Neal, 40 s)
- An advisor has a meeting tomorrow morning with a high-value client.
- Tonight they must read income statements, investment reports and cash-flow
  documents, find the trends and risks, and bring a recommendation.
- Today that means reading PDFs, opening a charting site, a screener and a
  news site, and copying numbers between them.
- **"Time is running out. That's the problem we solved: the Luna Terminal
  Agent."**

### Slide 3: Mission (Neal, 30 s)
- **Challenge:** the information is scattered across tools.
- **Opportunity:** connect it in one place.
- **Impact:** advisors spend their time advising, not searching.
- **"Luna connects what the advisor already has, the client's own documents,
  with live market data, and tells them what matters and why."**

### Slide 4: Key features (Carlos, 45 s)
Don't read the four columns. Group them:
- **"Everything here is built and working; you'll see it in the demo."**
- **Advisor tools:** client and model portfolios, reports, 13F filings of what
  hedge funds own.
- **Graphs:** live quotes, history, portfolio and company comparisons.
- **Research:** stock maps, supply-chain analysis, screeners, earnings,
  market sentiment.
- **Interactive:** global markets, country ETFs, currencies, sectors.
- **"And at the center, the AI agent: upload a client's statements, ask
  questions, and get answers with live, dated numbers and the page they came
  from."**

### Slide 5: Demo (Om, 3 min)
Play the recorded video (see below) and narrate over it, or present live
if the Wi-Fi is solid, with the video as backup. What to say at each moment
is in the shot list below.

While the AWS part plays, or right after it, say the AWS "why" (30 s):
- **"Every service is there because the advisor's workflow needs it."**
- **Upload:** Bedrock Data Automation and a background Lambda job read the
  PDF without freezing the chat.
- **Cited answers:** S3 Vectors finds the right page by meaning.
- **Live data:** Bedrock AgentCore runs the agent; it calls our market tools
  in parallel and can use any of 5 Bedrock models.
- **Accounts and history:** Aurora DSQL and DynamoDB, serverless and
  passwordless.
- **"No AI keys anywhere: the app's IAM role can call exactly five models. If
  a model fails, a backup answers, and CloudWatch tracks every call's speed
  and cost."**

### Slide 6: Why it matters for LPL (Patrick, 45 s)
- **Business value:**
  - less time reviewing documents;
  - recommendations backed by cited research and visuals;
  - one workspace instead of several tools.
- **Market:** "LPL supports over 32,000 advisors and 1,200 institutions."
- **Measured impact:** give the number you timed while recording, e.g.
  "Luna summarized a four-page client packet and found four issues in about
  N seconds." Then: "Across 32,000 advisors, even an hour saved per client
  review adds up fast." Use only numbers you measured, and call estimates
  estimates.
- **Different because:**
  - general AI chatbots answer from memory; Luna's numbers are live, dated
    and cited;
  - market terminals show data but don't read your client's documents; Luna
    does both;
  - it informs rather than advises, which suits a regulated firm.
- **Future enhancements:** say "next" clearly. Judges only score what's
  built.

### Slide 7: Closing (Carlos, 15 s)
- **"Luna turns a night of document review into a cited, compliant client
  brief in minutes. It's running on AWS today, and it's ready for LPL's
  32,000 advisors. Thank you, we'd love your questions."**

### Likely questions

Keep answers to two or three sentences, then stop. "We haven't built that
yet; here's how we would" is a fine answer. Never claim something the demo
didn't show.

**The question to agree on as a team first**

| Question | Answer |
|---|---|
| What did you build during the hackathon? | Be exact and honest. The rubric scores only what you built during the event. The market terminal (charts, screener, maps, 13F pages) came into the repo on day 1. The hackathon work is the AWS agent layer: Bedrock models, the AgentCore agent, document upload and search, background reports, accounts and chat history on DSQL/DynamoDB, failover and metrics, the deploy, and the MCP endpoint. **Confirm the split with Patrick before presenting.** |

**AWS judges ("right service, right reason", security, reliability, cost)**

| Question | Answer |
|---|---|
| Why AgentCore instead of running the agent in Lambda? | The agent makes several model and tool calls per question. AgentCore is a managed runtime built for that: isolated sessions per user, long-running calls, and its own IAM role. The web Lambda only streams the result. |
| Why S3 Vectors, not OpenSearch or a Knowledge Base? | Each advisor's documents are a small, private collection. S3 Vectors has no cluster to run and costs almost nothing at rest, and every query filters by owner. A Knowledge Base would also work; we wanted direct control of owner filtering and citations. |
| Why Aurora DSQL, not RDS? | Serverless with nothing to manage, IAM authentication (no password anywhere), no VPC. The trade-off: DSQL has no foreign keys, so the app enforces relations itself and we wrote a migration runner that follows DSQL's rules. |
| Why DynamoDB as well? | Chat history and rate limits are simple key lookups with high write volume. DynamoDB gives atomic counters, so every Lambda shares one rate limit, and TTL deletes old data automatically. |
| Why 5 models? Isn't that "filling a list"? | One default (GPT-5.6 Sol). The others are a backup if a model fails, and let the firm choose speed vs. cost vs. quality per task with the same tools. Honest limit: it doesn't yet pick the cheapest model automatically. |
| How is it secured? | No API keys for AI or the database: the IAM role can call exactly five models. Buckets are private. Every document query is checked against its owner. Passwords are hashed with bcrypt. Rate limits sit on the paid routes. |
| What happens when something fails? | The model call is retried once, then a backup model answers and says so. Errors are classified (credentials, access, throttling) and logged. An answer that didn't fetch data first is withheld. |
| What does it cost? | It's serverless, so idle costs almost nothing; you pay per request, mostly model tokens. CloudWatch records tokens per call, so cost per question can be measured. Give a figure only if you've calculated one. |
| How does it scale? | Lambda and DynamoDB scale automatically. The limit is Bedrock quota: about 1 call per second in this workshop account, much higher in production. Rate limits and failover protect it. |
| How did you deploy it? | Infrastructure as code with SST: one command builds the whole stack. GitHub Actions can deploy after CI passes, using OIDC (no stored AWS keys). |

**LPL judges: business, compliance, risk**

| Question | Answer |
|---|---|
| How do you stop hallucinated numbers? | Every price comes from a tool call and carries its date. Document answers cite the page and chunk. The model is told never to use numbers from memory, and an answer with no data behind it isn't shown. |
| Isn't this giving investment advice? | It's research support for the advisor, not the client. It informs, it doesn't advise: on "should they sell" it gives both sides. A Bedrock Guardrail that blocks personal buy/sell advice is built in behind a switch. The advisor stays responsible for the recommendation. |
| What about FINRA and recordkeeping? | Chats are saved per user, which is a start for supervision. A production version would add archiving to the firm's books-and-records system and compliance review. Don't claim compliance; say what you'd integrate. |
| Is client data safe? Did you use real data? | The demo uses only a fictional family. Documents go to a private S3 bucket, and search is limited to their owner. In production it would run in LPL's own AWS account, and data wouldn't be used to train models: Bedrock doesn't train on customer data. |
| Where does market data come from? Is it licensed? | Public market quotes for the prototype. The app already supports licensed providers (Finnhub, Polygon, Twelve Data, Tradier) through keys; production would use LPL's licensed feeds. |
| How much time does it save? | The number you measured: "the four-page packet was summarized in N seconds." Anything per-advisor or firm-wide is an estimate, so call it one. |
| How is this different from ChatGPT, or the tools LPL already has? | ChatGPT answers from memory and doesn't know today's prices or the client's file. Market terminals show data but don't read client documents. Luna combines both, cites everything and stays within the line on advice. |
| Who pays, and how? | As an internal LPL tool: a per-advisor seat, or part of the advisor platform. As a startup: a per-advisor subscription for independent advisors and firms. |
| How would advisors learn to use it? | It's a chat: they ask in plain English. Pages they need are linked from the answers. |

**Technical-execution judges**

| Question | Answer |
|---|---|
| How does the agent work? | It plans which tools to call (quotes, history, sentiment, document search, site pages), runs them in parallel, then writes the answer from the results, streaming to the screen. |
| How do you know the answers are right? | Automated tests on every pull request. A smoke test asks all five models a live question and checks they fetched data. Honest gap: no formal accuracy evaluation set yet; that's next. |
| What was hardest? | Pick a real story: workshop credentials expiring every ~15 minutes looked like a model bug until we classified the errors; DSQL's no-foreign-keys and one-DDL-per-transaction rules; making a fresh checkout deploy on Windows. |
| What would you do with more time? | Turn the Guardrail on by default, fire alerts on a schedule (EventBridge), add an accuracy evaluation set, use licensed data feeds, and put AgentCore Gateway with sign-in in front of the MCP tools. |
| What's the MCP endpoint? (if you show it) | The same read-only market tools, published in the Model Context Protocol so other AI agents, such as Claude Desktop, can use them. No user data is exposed. |

## Recording the demo

The rubric strongly recommends a recorded demo, and the workshop AWS account
is deleted after the event. Record it once the redeployed site passes
`npm run smoke:site`.

### Setup (10 minutes)
- **Recorder:**
  - **OBS Studio** (free; record the browser window at 1920×1080, 30 fps);
  - or **Windows Snipping Tool → Record**;
  - or **Xbox Game Bar** (Win+Alt+R; records one window).
- **Editing:** **Clipchamp** (built into Windows) to trim and speed up waits.
- **Browser:**
  - a clean Chrome profile with no bookmarks bar, extensions hidden and
    notifications off;
  - zoom 125%;
  - window maximized, dark theme;
  - signed in to the demo account.
- **Before you hit record:**
  - upload `docs/demo/harper-family-q3-2026-review.pdf` and wait for
    **ready**;
  - run every question once to warm up the site, then start a **new chat**
    for the recording.
- **Don't** run smoke tests or other chats during recording: the workshop
  limit is about 1 Bedrock call per second.

### Shot list (target 2.5-3 minutes after editing)

Record each shot as its own clip so a bad take is cheap to redo. Use the
default model (GPT-5.6 Sol) unless the shot says otherwise.

| # | Clip | On screen | Narration (record separately, or say live) |
|---|---|---|---|
| 1 | 10 s | Dashboard: sentiment gauge, movers | "This is Luna. Everything you'll see is live data." |
| 2 | 30 s | Chat → **Documents & research** → the Harper packet (already ready) → select it → *"Summarize this client packet: the key trends and what I should raise in the meeting."* | "The advisor drops in tomorrow's client packet and asks what matters. Luna reads all four pages and cites where each point came from." |
| 3 | 25 s | *"How have NVDA and TSM moved over the last year, and what are they at today?"* (charts appear) | "The client's two largest stock positions, with live, dated prices and charts, without leaving the chat." |
| 4 | 15 s | `/supply-chain` → NVDA → hover TSM | "And here's the risk: TSMC manufactures NVIDIA's chips. 28% of the portfolio rides on one supply chain." |
| 5 | 25 s | *"Can the Harpers cover the renovation and tuition if the studio's draw falls by a third?"* | "Luna works through the cash flow and finds the family about $12,000 short. That's the planning conversation for tomorrow." |
| 6 | 15 s | *"Should they sell their NVIDIA?"* | "Luna informs, it doesn't advise: it lays out both sides and leaves the decision to the advisor." |
| 7 | 15 s | Model picker → **Claude Opus 5 · AWS** → re-ask shot 3's question | "Five models on Amazon Bedrock share the same tools. Pick one per task." |
| 8 | 15 s | **Research in background** → *"Prepare a one-page meeting brief for the Harpers"* → show it running, then the finished report | "The meeting brief builds in the background on AWS." |
| 9 | 10 s | CloudWatch → Metrics → **LunaTerminal/AI**: latency and tokens by model | "And every model call is measured: speed, tokens and errors." |

### Editing
- **Cut or speed up waits:** speed up (2-4×) any wait over 3 seconds. Keep
  the moment the answer starts streaming at normal speed, because that's the
  "it's live" proof.
- **Captions:** add a short caption per clip ("1. Upload the client packet")
  in case the room audio is bad.
- **Timing:** note how long shot 2 took before the edit. That's the measured
  number for slide 6.
- **Export:**
  - 1080p MP4;
  - put it on a USB stick and on a cloud drive;
  - embed it in slide 5;
  - play it once on the presentation laptop to check it works.

### If something goes wrong while recording
- **"Could not answer" or a slow answer:** wait 30 seconds and retake that
  clip. Throttling clears quickly.
- **The answer misses a planted finding:** rephrase more specifically, e.g.
  *"What share of the portfolio is in NVDA, AAPL, MSFT and TSM?"*
- **Upload stuck:** use the already-ready copy from your warm-up and say
  "uploaded earlier".
