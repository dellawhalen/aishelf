import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = process.argv[2] ?? process.env.AISHELF_MAISON_ELLE_DATASET;
const organizationId = "local-org";
const brandId = "maison-elle-brand";
const methodologyVersion = "1.0";
const productForQuestion = {
  Q01: "prod_001",
  Q02: "prod_002",
  Q03: "prod_003",
  Q04: "prod_004",
  Q05: "prod_002",
  Q06: "prod_003",
};
const claimOutcomes = {
  accurate: "ACCURATE",
  inaccurate: "INACCURATE",
  missing: "MISSING",
  unverified: "UNVERIFIED",
};
const statuses = {
  open: { approvalStatus: "pending", completionStatus: "not_started" },
  in_progress: { approvalStatus: "pending", completionStatus: "in_progress" },
  completed: { approvalStatus: "approved", completionStatus: "implemented" },
  deferred: { approvalStatus: "pending", completionStatus: "not_started" },
};

if (!datasetPath) {
  throw new Error("Provide the fictional dataset directory as an argument or AISHELF_MAISON_ELLE_DATASET.");
}

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(datasetPath, fileName), "utf8"));
}

function mapStatus(status) {
  const mapped = statuses[status];
  assert.ok(mapped, `Unsupported recommendation status: ${status}`);
  return mapped;
}

async function main() {
  const fixture = {
    brand: await readJson("brand.json"),
    products: await readJson("products.json"),
    questions: await readJson("questions.json"),
    observations: await readJson("audit_observations.json"),
    metrics: await readJson("audit_run_metrics.json"),
    claims: await readJson("claim_checks.json"),
    recommendations: await readJson("recommendations.json"),
    statusHistory: await readJson("recommendation_status_history.json"),
    followUps: await readJson("followups.json"),
  };
  assert.equal(fixture.brand.name, "MAISON ELLE");
  assert.equal(fixture.brand.fictional, true);
  assert.ok(fixture.observations.every((item) =>
    item.evidence_type === "simulated" && item.is_external_observation === false
  ), "Refusing to import observations not explicitly labeled simulated.");
  assert.ok(fixture.questions.length > 0 && fixture.products.length > 0);

  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "Set DATABASE_URL before importing the MAISON ELLE fixture.");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await prisma.organization.upsert({
      where: { id: organizationId },
      update: {},
      create: { id: organizationId, name: "AIShelf Local Workspace" },
    });
    await prisma.brand.upsert({
      where: { id: "local-brand" },
      update: {},
      create: { id: "local-brand", organizationId, name: "Your brand" },
    });
    const existingBrand = await prisma.brand.findFirst({
      where: { OR: [{ id: brandId }, { organizationId, name: fixture.brand.name }] },
      select: { id: true },
    });
    if (existingBrand) {
      throw new Error(`MAISON ELLE already exists as ${existingBrand.id}; import stopped without changing existing data.`);
    }

    const scoring = require(path.join(projectRoot, ".test-tmp-import/scoring.js"));
    const productsLib = require(path.join(projectRoot, ".test-tmp-import/products.js"));
    const runGroups = new Map();
    for (const observation of fixture.observations) {
      const group = runGroups.get(observation.audit_run_id) ?? [];
      group.push(observation);
      runGroups.set(observation.audit_run_id, group);
    }
    const metricsByRun = new Map(fixture.metrics.map((metric) => [metric.audit_run_id, metric]));
    for (const metric of fixture.metrics) {
      const run = runGroups.get(metric.audit_run_id) ?? [];
      const mentionCount = run.filter((item) => item.brand_mentioned).length;
      assert.equal(metric.question_count, run.length, `${metric.audit_run_id} sample count mismatch`);
      assert.equal(metric.brand_mentions, mentionCount, `${metric.audit_run_id} mention count mismatch`);
    }

    const observationById = new Map(fixture.observations.map((item) => [item.observation_id, item]));
    const productRows = fixture.products.map((item) => ({
      id: item.product_id,
      brandId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      imageUrl: item.image_url,
      specifications: JSON.stringify(item.specifications),
      requiredFields: JSON.stringify([
        "description",
        "price",
        "category",
        "imageUrl",
        ...item.known_missing_fields.filter((field) => field.startsWith("specifications.")),
      ]),
    }));
    const db = await prisma.$transaction(async (transaction) => {
      const brand = await transaction.brand.create({
        data: { id: brandId, organizationId, name: fixture.brand.name },
      });
      await transaction.product.createMany({ data: productRows });
      const storedProducts = await transaction.product.findMany({ where: { brandId } });
      const completeness = productsLib.getProductCompleteness(storedProducts);
      const auditIds = new Map();
      const claimsById = new Map();

      for (const [runId, run] of runGroups) {
        const sourceName = runId === "RUN-OTHER" ? "Manual synthetic fixture" : run[0].source;
        const questions = run.map((item) => item.question.toLocaleLowerCase().trim()).sort();
        const questionSetHash = createHash("sha256").update(questions.join("\n")).digest("hex");
        const runClaims = fixture.claims.filter((claim) =>
          run.some((observation) => observation.observation_id === claim.observation_id)
        );
        const responseIds = new Map(run.map((item) => [item.observation_id, `fixture-${item.observation_id}`]));
        const claimIds = new Map(runClaims.map((item) => [item.claim_id, `fixture-${item.claim_id}`]));
        const score = scoring.calculateScores({
          sourceType: "SIMULATED",
          responses: run.map((item) => ({ brandMentioned: item.brand_mentioned })),
          competitorMentionCount: run.reduce((count, item) => count + item.competitor_mentions.length, 0),
          accuracyChecks: runClaims.map((item) => ({ outcome: claimOutcomes[item.status] })),
          completedProductFields: completeness.completed,
          requiredProductFields: completeness.required,
        });
        const accuracyChecks = runClaims.map((claim) => {
          const observation = observationById.get(claim.observation_id);
          const product = fixture.products.find((item) => item.sku === claim.sku);
          assert.ok(observation && product, `Invalid linked fixture claim ${claim.claim_id}`);
          const id = claimIds.get(claim.claim_id);
          claimsById.set(claim.claim_id, { id, productId: product.product_id });
          return {
            id,
            responseId: responseIds.get(claim.observation_id),
            productId: product.product_id,
            claim: claim.field,
            observedValue: claim.observed_claim == null ? "" : String(claim.observed_claim),
            verifiedValue: String(claim.verified_business_value),
            outcome: claimOutcomes[claim.status],
            discrepancyType: claim.field,
            severity: claim.status === "inaccurate" ? "high" : "medium",
            suggestedCorrection: claim.explanation,
          };
        });
        const auditId = `fixture-${runId}`;
        auditIds.set(runId, auditId);
        const runDate = new Date(run[0].collected_at);
        if (runId === "RUN-OTHER") runDate.setMinutes(runDate.getMinutes() - 1);
        const responseData = run.map((item) => ({
          id: responseIds.get(item.observation_id),
          question: item.question,
          response: item.response_text,
          sourceName,
          collectionMethod: item.collection_method,
          observedAt: new Date(item.collected_at),
          brandMentioned: item.brand_mentioned,
          productId: productForQuestion[item.question_id],
          competitorMentions: {
            create: item.competitor_mentions.map((competitor) => ({ competitor, mentionCount: 1 })),
          },
        }));
        await transaction.audit.create({
          data: {
            id: auditId,
            organizationId,
            brandId,
            sourceType: "SIMULATED",
            sourceName,
            collectionMethod: run[0].collection_method,
            methodologyVersion,
            questionSetHash,
            sampleSize: run.length,
            createdAt: runDate,
            responses: { create: responseData },
            accuracyChecks: { create: accuracyChecks },
            categoryScores: {
              create: Object.entries(score.categories).map(([category, result]) => ({
                category,
                score: result.score,
                evidenceCount: result.evidenceCount,
                calculation: result.calculation,
              })),
            },
            productFieldSnapshots: {
              create: completeness.snapshots.map((snapshot) => ({
                productId: snapshot.productId,
                productName: snapshot.productName,
                fieldName: snapshot.fieldName,
                fieldValue: snapshot.fieldValue,
                completed: snapshot.completed,
              })),
            },
            scoreSnapshot: {
              create: {
                organizationId,
                brandId,
                overallScore: score.overall,
                classification: score.classification,
                methodologyVersion,
                sourceType: "SIMULATED",
                sampleSize: run.length,
                evidenceReferences: JSON.stringify({
                  responseIds: [...responseIds.values()],
                  accuracyCheckIds: [...claimIds.values()],
                  productIds: productRows.map((item) => item.id),
                }),
              },
            },
          },
        });
      }

      for (const recommendation of fixture.recommendations) {
        const linkedObservations = recommendation.linked_observation_ids.map((id) => observationById.get(id));
        assert.ok(linkedObservations.every(Boolean), `Unknown linked observation for ${recommendation.recommendation_id}`);
        const runId = linkedObservations[0].audit_run_id;
        const linkedClaim = fixture.claims.find((claim) =>
          recommendation.linked_observation_ids.includes(claim.observation_id)
        );
        const product = linkedClaim && fixture.products.find((item) => item.sku === linkedClaim.sku);
        const history = fixture.statusHistory
          .filter((entry) => entry.recommendation_id === recommendation.recommendation_id)
          .map((entry) => ({
            ...mapStatus(entry.to_status),
            changedAt: new Date(entry.changed_at),
          }));
        await transaction.recommendation.create({
          data: {
            id: recommendation.recommendation_id,
            organizationId,
            brandId,
            auditId: auditIds.get(runId),
            category: recommendation.category,
            productId: product?.product_id ?? null,
            evidenceRef: `maison-elle:${recommendation.recommendation_id}`,
            title: recommendation.title,
            issue: recommendation.title,
            supportingEvidence: JSON.stringify({
              observationIds: recommendation.linked_observation_ids,
              owner: recommendation.owner,
              dueDate: recommendation.due_date,
              fixtureStatus: recommendation.status,
              dataOrigin: recommendation.data_origin,
            }),
            recommendedAction: recommendation.title,
            whyItMatters: "Synthetic fixture recommendation; importing it does not execute the suggested action.",
            priority: recommendation.priority,
            effort: "unspecified",
            ...mapStatus(recommendation.status),
            statusChanges: { create: history },
          },
        });
      }

      for (const followUp of fixture.followUps) {
        await transaction.followUpAudit.create({
          data: {
            id: followUp.followup_id,
            organizationId,
            brandId,
            scheduledFor: new Date(followUp.scheduled_for),
            status: followUp.status,
            createdAt: new Date(),
          },
        });
      }
      return {
        brand,
        products: productRows.length,
        audits: auditIds.size,
        claims: claimsById.size,
        recommendations: fixture.recommendations.length,
        followUps: fixture.followUps.length,
        metrics: [...metricsByRun.values()].map(({ audit_run_id, question_count, brand_mentions }) => ({
          run: audit_run_id,
          questionCount: question_count,
          brandMentions: brand_mentions,
        })),
      };
    });
    console.log(JSON.stringify({
      imported: db,
      evidenceType: "SIMULATED",
      note: "The brand was added alongside existing workspace data. No external observations or live audits were created.",
      metricsNote: "Run scores are calculated from individual observation and claim records; metric summaries are validated only.",
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const { loadEnvConfig } = require("@next/env");
loadEnvConfig(projectRoot);
main().catch((error) => {
  console.error("MAISON ELLE import failed without deleting existing data.", error);
  process.exitCode = 1;
});
