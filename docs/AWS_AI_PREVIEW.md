# Financial AI preview

The chat model picker offers Luna Finance, AWS Claude Haiku 4.5, and AWS GPT-5.4.
Claude uses Bedrock Converse; GPT-5.4 uses Bedrock Mantle's OpenAI-compatible
Chat Completions endpoint. Both authenticate through the standard AWS SDK
credential chain. On Lambda this is the execution role, not a participant's
temporary credentials. GPT-5.4 is an OpenAI model hosted by AWS, not a ChatGPT
subscription or a connection to a user's ChatGPT conversations.

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
GPT currently returns its final answer together; Claude streams tokens.

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

## Useful next additions

1. Add read-only tools for ETF holdings, 13F filings, fundamentals, and supply
   chains using the existing library functions, with dates and source links.
2. Index filings and research documents in S3 with a Bedrock Knowledge Base;
   return document citations alongside live market data.
3. Use EventBridge for scheduled watchlist briefs, with model evaluations for
   factual grounding and CloudWatch measurements of latency and token cost.

These additions are proposals, not resources provisioned by this preview.
