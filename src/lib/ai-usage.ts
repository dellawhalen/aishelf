import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { aiAuditResultSchema, type AiAuditResult } from "@/lib/ai-audit-schema";
import { prisma } from "@/lib/prisma";
import {
  AI_APPLICATION_BUDGET_MICRO_USD,
  AI_CACHE_TTL_MS,
  AI_DEMO_RESERVE_MICRO_USD,
  AI_MAX_REQUEST_RESERVATION_MICRO_USD,
  AI_PENDING_LEASE_MS,
  AI_REQUESTS_PER_USER_PER_HOUR,
  AI_UNCERTAIN_RETRY_DELAY_MS,
  estimateAiCostMicroUsd,
  microUsdToUsd,
} from "@/lib/ai-usage-policy";

const PROJECT_BUDGET_ID = "workspace";
const HOUR_MS = 60 * 60 * 1_000;

type CacheRow = {
  status: string;
  result: Prisma.JsonValue | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicroUsd: number;
  activeUsageEventId: string | null;
  leaseExpiresAt: Date | null;
  expiresAt: Date;
};

export class AiUsageRateLimitError extends Error {}
export class AiUsageBudgetExceededError extends Error {}
export class AiUsageInProgressError extends Error {}
export class AiUsagePreviousFailureError extends Error {}
export class AiUsageUncertainError extends Error {}
export class AiUsageStorageError extends Error {
  constructor(readonly requestMayHaveBeenCharged = false) {
    super();
  }
}

export type AiPreparedAnalysis =
  | {
      kind: "cached";
      result: AiAuditResult;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      kind: "reserved";
      eventId: string;
      requestHash: string;
      reservedMicroUsd: number;
    };

export function createAiRequestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getHourStart(now: Date) {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

async function readCache(
  tx: Prisma.TransactionClient,
  requestHash: string,
) {
  const rows = await tx.$queryRaw<CacheRow[]>(Prisma.sql`
    SELECT
      "status",
      "result",
      "inputTokens",
      "outputTokens",
      "estimatedCostMicroUsd",
      "activeUsageEventId",
      "leaseExpiresAt",
      "expiresAt"
    FROM "AiAuditCache"
    WHERE "requestHash" = ${requestHash}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function recordCacheHit(
  tx: Prisma.TransactionClient,
  userId: string,
  requestHash: string,
  model: string,
  cache: CacheRow,
  result: AiAuditResult,
) {
  await tx.aiUsageEvent.create({
    data: {
      userId,
      requestHash,
      model,
      status: "CACHE_HIT",
      cached: true,
      inputTokens: cache.inputTokens,
      outputTokens: cache.outputTokens,
      estimatedCostMicroUsd: 0,
      completedAt: new Date(),
    },
  });
  return {
    kind: "cached" as const,
    result,
    inputTokens: cache.inputTokens,
    outputTokens: cache.outputTokens,
  };
}

export async function prepareAiAnalysis(input: {
  userId: string;
  requestHash: string;
  model: string;
}): Promise<AiPreparedAnalysis> {
  const now = new Date();
  const hourStart = getHourStart(now);
  const cacheExpiresAt = new Date(now.getTime() + AI_CACHE_TTL_MS);
  const leaseExpiresAt = new Date(now.getTime() + AI_PENDING_LEASE_MS);

  try {
    const requestWindows = await prisma.$queryRaw<Array<{ requestCount: number }>>(Prisma.sql`
      INSERT INTO "AiRequestWindow" ("userId", "windowStart", "requestCount", "createdAt", "updatedAt")
      VALUES (${input.userId}, ${hourStart}, 1, ${now}, ${now})
      ON CONFLICT ("userId", "windowStart")
      DO UPDATE SET
        "requestCount" = "AiRequestWindow"."requestCount" + 1,
        "updatedAt" = ${now}
      WHERE "AiRequestWindow"."requestCount" < ${AI_REQUESTS_PER_USER_PER_HOUR}
      RETURNING "requestCount"
    `);
    if (requestWindows.length === 0) throw new AiUsageRateLimitError();
    await prisma.aiRequestWindow.deleteMany({
      where: { windowStart: { lt: hourStart } },
    });

    return await prisma.$transaction(async (tx) => {
      await tx.aiAuditCache.deleteMany({
        where: {
          expiresAt: { lte: now },
          status: { not: "PENDING" },
        },
      });

      let cache = await readCache(tx, input.requestHash);
      if (!cache) {
        const inserted = await tx.$queryRaw<Array<{ requestHash: string }>>(Prisma.sql`
          INSERT INTO "AiAuditCache"
            ("requestHash", "model", "status", "expiresAt", "leaseExpiresAt", "createdAt", "updatedAt")
          VALUES
            (${input.requestHash}, ${input.model}, 'PENDING', ${cacheExpiresAt}, ${leaseExpiresAt}, ${now}, ${now})
          ON CONFLICT ("requestHash") DO NOTHING
          RETURNING "requestHash"
        `);
        if (inserted.length === 0) {
          cache = await readCache(tx, input.requestHash);
          if (!cache) throw new AiUsageStorageError();
        }
      }

      if (cache) {
        if (cache.status === "COMPLETED" && cache.expiresAt > now) {
          const cachedResult = aiAuditResultSchema.safeParse(cache.result);
          if (cachedResult.success) {
            return recordCacheHit(
              tx,
              input.userId,
              input.requestHash,
              input.model,
              cache,
              cachedResult.data,
            );
          }
        }
        if (cache.status === "PENDING" && cache.leaseExpiresAt && cache.leaseExpiresAt > now) {
          throw new AiUsageInProgressError();
        }
        if (cache.status === "FAILED" && cache.expiresAt > now) {
          throw new AiUsagePreviousFailureError();
        }
        if (cache.status === "UNCERTAIN" && cache.expiresAt > now) {
          throw new AiUsageUncertainError();
        }
        if (cache.status === "PENDING" && cache.activeUsageEventId) {
          await tx.aiUsageEvent.updateMany({
            where: { id: cache.activeUsageEventId, status: "RESERVED" },
            data: { status: "UNCERTAIN", completedAt: now },
          });
        }
        await tx.aiAuditCache.update({
          where: { requestHash: input.requestHash },
          data: {
            model: input.model,
            status: "PENDING",
            result: Prisma.DbNull,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostMicroUsd: 0,
            activeUsageEventId: null,
            leaseExpiresAt,
            expiresAt: cacheExpiresAt,
          },
        });
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AiProjectBudget" ("id", "spentMicroUsd", "reservedMicroUsd", "createdAt", "updatedAt")
        VALUES (${PROJECT_BUDGET_ID}, 0, 0, ${now}, ${now})
        ON CONFLICT ("id") DO NOTHING
      `);
      const budgetUpdates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "AiProjectBudget"
        SET
          "reservedMicroUsd" = "reservedMicroUsd" + ${AI_MAX_REQUEST_RESERVATION_MICRO_USD},
          "updatedAt" = ${now}
        WHERE "id" = ${PROJECT_BUDGET_ID}
          AND "spentMicroUsd" + "reservedMicroUsd" + ${AI_MAX_REQUEST_RESERVATION_MICRO_USD}
            <= ${AI_APPLICATION_BUDGET_MICRO_USD}
        RETURNING "id"
      `);
      if (budgetUpdates.length === 0) throw new AiUsageBudgetExceededError();

      const event = await tx.aiUsageEvent.create({
        data: {
          userId: input.userId,
          requestHash: input.requestHash,
          model: input.model,
          status: "RESERVED",
          reservedMicroUsd: AI_MAX_REQUEST_RESERVATION_MICRO_USD,
        },
      });
      await tx.aiAuditCache.update({
        where: { requestHash: input.requestHash },
        data: { activeUsageEventId: event.id },
      });

      return {
        kind: "reserved" as const,
        eventId: event.id,
        requestHash: input.requestHash,
        reservedMicroUsd: AI_MAX_REQUEST_RESERVATION_MICRO_USD,
      };
    });
  } catch (error) {
    if (
      error instanceof AiUsageRateLimitError ||
      error instanceof AiUsageBudgetExceededError ||
      error instanceof AiUsageInProgressError ||
      error instanceof AiUsagePreviousFailureError ||
      error instanceof AiUsageUncertainError ||
      error instanceof AiUsageStorageError
    ) {
      throw error;
    }
    throw new AiUsageStorageError();
  }
}

export async function completeAiAnalysis(input: {
  eventId: string;
  requestHash: string;
  reservedMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
  result: AiAuditResult | null;
}) {
  const now = new Date();
  const costMicroUsd = estimateAiCostMicroUsd(input.inputTokens, input.outputTokens);
  const status = input.result ? "COMPLETED" : "FAILED";

  try {
    await prisma.$transaction(async (tx) => {
      const updatedBudgets = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "AiProjectBudget"
        SET
          "reservedMicroUsd" = "reservedMicroUsd" - ${input.reservedMicroUsd},
          "spentMicroUsd" = "spentMicroUsd" + ${costMicroUsd},
          "updatedAt" = ${now}
        WHERE "id" = ${PROJECT_BUDGET_ID}
          AND "reservedMicroUsd" >= ${input.reservedMicroUsd}
        RETURNING "id"
      `);
      if (updatedBudgets.length === 0) throw new AiUsageStorageError();

      const eventUpdate = await tx.aiUsageEvent.updateMany({
        where: { id: input.eventId, status: "RESERVED" },
        data: {
          status,
          estimatedCostMicroUsd: costMicroUsd,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          completedAt: now,
        },
      });
      if (eventUpdate.count !== 1) throw new AiUsageStorageError();

      await tx.aiAuditCache.updateMany({
        where: {
          requestHash: input.requestHash,
          activeUsageEventId: input.eventId,
          status: "PENDING",
        },
        data: {
          status,
          result: input.result ? (input.result as Prisma.InputJsonValue) : Prisma.DbNull,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          estimatedCostMicroUsd: costMicroUsd,
          activeUsageEventId: null,
          leaseExpiresAt: null,
          expiresAt: input.result
            ? new Date(now.getTime() + AI_CACHE_TTL_MS)
            : new Date(now.getTime() + AI_UNCERTAIN_RETRY_DELAY_MS),
        },
      });
    });
  } catch {
    throw new AiUsageStorageError(true);
  }
}

export async function markAiAnalysisUncertain(input: {
  eventId: string;
  requestHash: string;
}) {
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.aiUsageEvent.updateMany({
        where: { id: input.eventId, status: "RESERVED" },
        data: { status: "UNCERTAIN", completedAt: now },
      });
      await tx.aiAuditCache.updateMany({
        where: {
          requestHash: input.requestHash,
          activeUsageEventId: input.eventId,
          status: "PENDING",
        },
        data: {
          status: "UNCERTAIN",
          activeUsageEventId: null,
          leaseExpiresAt: null,
          expiresAt: new Date(now.getTime() + AI_UNCERTAIN_RETRY_DELAY_MS),
        },
      });
    });
  } catch {
    throw new AiUsageStorageError(true);
  }
}

export async function getAiUsageSummary(userId: string) {
  const now = new Date();
  const windowStart = getHourStart(now);

  try {
    const [budget, windows] = await Promise.all([
      prisma.aiProjectBudget.findUnique({ where: { id: PROJECT_BUDGET_ID } }),
      prisma.aiRequestWindow.findMany({
        where: { windowStart },
        orderBy: { userId: "asc" },
        select: { userId: true, requestCount: true },
      }),
    ]);

    const memberRequests = windows.map((window) => {
      const suffix = createHash("sha256").update(window.userId).digest("hex").slice(0, 6);
      return {
        label: window.userId === userId ? `You · ${suffix}` : `Member · ${suffix}`,
        isCurrentUser: window.userId === userId,
        requestCount: window.requestCount,
      };
    });
    if (!memberRequests.some((member) => member.isCurrentUser)) {
      const suffix = createHash("sha256").update(userId).digest("hex").slice(0, 6);
      memberRequests.push({ label: `You · ${suffix}`, isCurrentUser: true, requestCount: 0 });
    }

    const spentMicroUsd = budget?.spentMicroUsd ?? 0;
    const reservedMicroUsd = budget?.reservedMicroUsd ?? 0;

    return {
      applicationBudgetUsd: microUsdToUsd(AI_APPLICATION_BUDGET_MICRO_USD),
      demoReserveUsd: microUsdToUsd(AI_DEMO_RESERVE_MICRO_USD),
      estimatedSpendUsd: microUsdToUsd(spentMicroUsd),
      reservedSpendUsd: microUsdToUsd(reservedMicroUsd),
      remainingBudgetUsd: microUsdToUsd(
        Math.max(0, AI_APPLICATION_BUDGET_MICRO_USD - spentMicroUsd - reservedMicroUsd),
      ),
      requestsPerUserThisHour: memberRequests,
      requestLimitPerUserPerHour: AI_REQUESTS_PER_USER_PER_HOUR,
    };
  } catch {
    throw new AiUsageStorageError();
  }
}
