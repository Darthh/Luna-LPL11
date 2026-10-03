-- Aurora DSQL has no foreign keys, so Prisma enforces relations itself
-- (relationMode = "prisma") and finds a parent's children by these columns
-- when it cascades a delete. Without an index each lookup is a full scan.
-- On DSQL, scripts/dsql-migrate.mjs runs these as CREATE INDEX ASYNC.

CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "ForumThread_authorId_idx" ON "ForumThread"("authorId");
CREATE INDEX IF NOT EXISTS "ForumReply_authorId_idx" ON "ForumReply"("authorId");
CREATE INDEX IF NOT EXISTS "ForumLike_threadId_idx" ON "ForumLike"("threadId");
CREATE INDEX IF NOT EXISTS "ForumLike_replyId_idx" ON "ForumLike"("replyId");
