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
| Question | Answer |
|---|---|
| Is this real client data? | No. The Harper family is fictional (it says so on every page); prices are public market quotes. |
| How do you stop it giving advice? | The agent is instructed to inform, not advise: it gives the case each way. A Bedrock Guardrail that blocks personal buy/sell advice is built in behind a switch. |
| What if a model is down or wrong? | It retries, then a backup model answers and says so. Every number comes from a tool call with a date, and an answer with no data behind it is withheld. |
| Why 5 models? | Different speed, cost and quality trade-offs. The same tools work with any of them, so the firm can choose per task, or switch if one is unavailable. |
| How much does it cost to run? | It's serverless and scales to zero, so you pay per request. CloudWatch shows tokens per model call, which is the main cost. |
| Could LPL deploy it? | It's infrastructure as code (SST): one command deploys it into an AWS account, with IAM roles and no stored keys. |

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
