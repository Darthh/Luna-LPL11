# New Chat and account workspaces

New Chat's Account data control supplies the selected model with records from
the current signed-in account: watchlist, personal model portfolios, reports,
client portfolios, and Finance CRM clients and their portfolios. Account IDs
come from Auth.js on the server; browser-supplied owners are not used. Credential
and authentication tables are never included. Records and document contents are
treated as evidence, not instructions. Queries rank a bounded set of records;
unavailable sections and truncated results are explicitly labelled.

Hosted models receive account evidence and `find_account_data` /
`create_account_document` tools. Attached AWS research documents retain their
existing agent path and receive the same evidence and structured draft format.
Local Ollama/OpenAI-compatible models receive evidence and can produce a
`luna-document` JSON block. The application validates drafts and renders CSV/PDF
downloads. The selected model provider processes the supplied account records;
turn off Account data to omit those records. Web search sends the user's query,
not account evidence.

Drafts show preview, CSV/PDF downloads and a Save control. An explicit request to
save/add/create a record in Reports, Model Portfolios or Client Portfolios saves
the new draft there automatically. Storage failures leave the draft available
with a visible error. Existing records are never changed by model tools. PDFs
use the bundled OFL-licensed Noto Sans font, wrap long text and paginate.

Signed-in Advisor Tools use `AdvisorItem` records, scoped by user and kind.
Revision checks reject stale edits and deletes. Signed-out work remains in the
browser; older unscoped browser records are imported only with an explicit
"Import into my account" action. Account chat caches also use separate storage
keys, so signing out or changing accounts does not expose account conversations.

## Setup and verification

Generate the Prisma client with `npx prisma generate`. Apply
`migrations/0004_advisor_workspace.sql` using the existing migration runner:
`npm run db:migrate:dsql` with the configured PostgreSQL/DSQL environment. The
runner does not load `.env.local` itself; load the environment before running it.
No new AWS services or resources are required.

Run `node --test lib/accountWorkspace.test.mjs` for ownership, revision,
validation, retrieval, document protocol, CSV and PDF checks. A real account
requires reachable account storage and a configured hosted or local model.
