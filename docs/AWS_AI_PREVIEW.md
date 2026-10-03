# Financial AI preview

The top chat choices are AWS GPT-5.6 Sol (first and default) and AWS Claude
Opus 5. Every newly created chat resets to GPT-5.6 Sol, including a new chat
after selecting another hosted or local model. Other existing model choices
remain available.

Both models use Bedrock Converse and authenticate through the standard AWS SDK
credential chain. On Lambda this is the execution role, not a participant's
temporary credentials. GPT is an OpenAI model hosted by AWS, not a ChatGPT
subscription or a connection to a user's ChatGPT conversations.

On 2026-10-02, the workshop role explicitly denied Claude Opus 5.5 and Fable
5.1 and GPT-6 Astra cross-region inference. GPT-6 Astra Mantle is restricted
to Oregon, which the workshop region policy denies. Fable 5 required an
AWS-review data-retention opt-in that is not enabled. GPT-5.6 Sol and Opus 5
passed a live tool-and-answer test under the existing policy and retention
settings. These restrictions were not changed for the upgrade.

Every model shares the existing quote, historical price, market sentiment,
and site-navigation tools. A planning turn must request a tool before an
answer is generated. Conceptual questions have an explicit no-data tool.
Up to four tools execute per question, and every requested tool receives
a result, including limit and upstream failures. AWS failures are visible
errors rather than silently substituting a local answer.

## Testing

Open `/dashboard/chat`, select an AWS model, and try:

- What is market sentiment today, and where can I explore it?
- Compare NVDA and SPY over the last year.
- What is AAPL trading at? Give the retrieval date.
- Explain what a P/E ratio means.
- Where can I review Berkshire Hathaway's holdings?

Check the returned `data` events in `/api/ai-chat` against the prose. The model
must report unavailable feeds rather than supply remembered market numbers.
Both GPT and Claude stream answer tokens.

## Deployment

`sst.config.ts` creates a separate `luna-ai-preview` site with Lambda,
CloudFront, and SST's cache infrastructure. Deploy with `npx sst deploy
--stage agents` after configuring AWS credentials and setting the `AuthSecret`
SST secret. Do not package `.env.local`, workshop credentials, or local files.
An isolated source checkout avoids shipping unrelated worktree edits.

This preview does not provision a database, OAuth, paid upstream feed keys,
email alerts, or the direct Anthropic key. Anonymous AWS chat and public feeds
are the test scope; account creation and CRM persistence need a separately
configured PostgreSQL database. Hosting and inference incur AWS usage charges.
Workshop sessions and resources may expire under the workshop's lifecycle.

The existing question rate limiter is per process, not a shared Lambda-wide
quota. Before a public production launch, add a shared usage counter and
account-level spending limits. The preview is for controlled testing.

## AgentCore research implementation

The AgentCore runtime, private document search with S3 Vectors, Bedrock Data
Automation extraction, durable research worker, and S3 Tables research archive
are now defined in the project. See [AWS_AGENT_RESEARCH.md](AWS_AGENT_RESEARCH.md)
for deployment, limits, and verification. Their live status must be verified
against the actual deployment outputs.

## Further additions

1. Add read-only tools for ETF holdings, 13F filings, fundamentals, and supply
   chains using the existing library functions, with dates and source links.
2. Add automatic ingestion of public filings into the document pipeline and
   historical holdings into a separate S3 Table.
3. Use EventBridge for scheduled watchlist briefs, with model evaluations for
   factual grounding and CloudWatch measurements of latency and token cost.

These further additions are proposals, not resources provisioned by this preview.
