# Chat memory

Luna retrieves relevant original user messages from saved conversations before
each AI request. New chats reset the transcript, not the account's archive.
Recall covers all pages of the signed-in user's archive, including chats older
than the browser sidebar's 30-chat limit. Existing saved chats work immediately;
no migration or new infrastructure is required.

The authenticated `/api/chat-memory` endpoint always uses the session's user ID.
It never accepts an account ID from the browser. Account persistence uses the
existing chat repository: DynamoDB when `CHAT_TABLE` is configured. The local
development repository is in memory and is lost when its process restarts.
Production without configured chat storage reports memory unavailable instead
of claiming that memory has been saved. Signed-out users recall only chats still
saved in this browser; that history is limited to 30 conversations.

All user messages are saved before requesting an answer, including prompts whose
model response fails. Assistant responses and web-search evidence are not used
as personal memory. Deleting a saved conversation removes it from future recall.

Retrieval uses keyword overlap and personal-context cues, then recency. Long
messages are chunked so details near the end can be found. Only up to 16 relevant
excerpts, with a 6,000-character JSON budget, are sent with the current prompt.
Historical excerpts are labeled as untrusted context; current instructions and
newer corrections take precedence. Past quotes must not become live prices.
This is selective recall, not a promise that every archived fact fits in each
model request. Paraphrases without matching terms may not retrieve the right
excerpt. It works with hosted models, Ollama, and OpenAI-compatible local models.

Archive pages are read with at most four chat reads in flight. Retrieval uses
the existing account store on each request so deletion is effective immediately.
For very large archives, replace this scan with an account-scoped search index;
the browser gives recall an eight-second timeout and continues the conversation
with a visible unavailable status if recall fails.

Verification: `node --test lib/chatMemory.test.mjs lib/chatRepository.test.mjs
lib/chatSync.test.mjs lib/chatHistory.test.mjs`.
