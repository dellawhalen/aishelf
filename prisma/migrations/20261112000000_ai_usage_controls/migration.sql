CREATE TABLE "AiProjectBudget" (
    "id" TEXT NOT NULL,
    "spentMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "reservedMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProjectBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRequestWindow" (
    "userId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRequestWindow_pkey" PRIMARY KEY ("userId", "windowStart")
);

CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reservedMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiAuditCache" (
    "requestHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "activeUsageEventId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAuditCache_pkey" PRIMARY KEY ("requestHash")
);

CREATE INDEX "AiRequestWindow_windowStart_idx" ON "AiRequestWindow"("windowStart");
CREATE INDEX "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");
CREATE INDEX "AiAuditCache_expiresAt_idx" ON "AiAuditCache"("expiresAt");
