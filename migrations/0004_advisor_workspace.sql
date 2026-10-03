CREATE TABLE IF NOT EXISTS "AdvisorItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdvisorItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdvisorItem_userId_kind_idx" ON "AdvisorItem"("userId", "kind");
