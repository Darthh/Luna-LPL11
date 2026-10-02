CREATE TABLE IF NOT EXISTS "AdvisorClient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdvisorClient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdvisorClient_userId_idx" ON "AdvisorClient"("userId");
