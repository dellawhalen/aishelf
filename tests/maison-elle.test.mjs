import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = process.env.AISHELF_MAISON_ELLE_DATASET;
const maisonElleBrandId = "maison-elle-brand";
const distDir = `.next-maison-elle-${process.pid}`;
const distPath = path.join(projectRoot, distDir);
const tsconfigFile = `.tsconfig-maison-elle-${process.pid}.json`;
const tsconfigPath = path.join(projectRoot, tsconfigFile);
const statusMapping = {
  open: { approvalStatus: "pending", completionStatus: "not_started" },
  in_progress: { approvalStatus: "pending", completionStatus: "in_progress" },
  completed: { approvalStatus: "approved", completionStatus: "implemented" },
  deferred: { approvalStatus: "pending", completionStatus: "not_started" },
};

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(datasetPath, fileName), "utf8"));
}

async function findAvailablePort() {
  const listener = net.createServer();
  listener.listen(0, "localhost");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitForServer(server, baseUrl, getOutput) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Functional test server exited early.\n${getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/dashboard`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Functional test server did not become ready.\n${getOutput()}`);
}

function mapStatus(status) {
  const mapped = statusMapping[status];
  assert.ok(mapped, `Unsupported fixture recommendation status: ${status}`);
  return mapped;
}

function mapClaimOutcome(status) {
  const outcomes = {
    accurate: "ACCURATE",
    inaccurate: "INACCURATE",
    missing: "MISSING",
    unverified: "UNVERIFIED",
  };
  assert.ok(outcomes[status], `Unsupported fixture claim status: ${status}`);
  return outcomes[status];
}

function questionProductId(questionId) {
  return {
    Q01: "prod_001",
    Q02: "prod_002",
    Q03: "prod_003",
    Q04: "prod_004",
    Q05: "prod_002",
    Q06: "prod_003",
  }[questionId];
}

async function loadFixture({ prisma, fixture, scoring, products }) {
  const { brand, products: productFixtures, questions, audit_observations: observations,
    audit_run_metrics: metrics, claim_checks: claims, recommendations, recommendation_status_history: statusHistory,
    followups } = fixture;
  assert.equal(brand.name, "MAISON ELLE");
  assert.equal(brand.fictional, true);
  assert.ok(observations.every((item) => item.evidence_type === "simulated" && item.is_external_observation === false));
  const questionTextById = new Map(questions.map((item) => [item.question_id, item.question]));
  assert.ok(observations.every((item) => questionTextById.get(item.question_id) === item.question));

  await prisma.organization.create({
    data: {
      id: "local-org",
      name: "MAISON ELLE Fictional Test Workspace",
      brands: { create: { id: maisonElleBrandId, name: brand.name } },
    },
  });
  await prisma.brand.create({
    data: { id: "local-brand", organizationId: "local-org", name: "Your brand" },
  });

  const productRows = productFixtures.map((item) => {
    const requiredFields = ["description", "price", "category", "imageUrl"];
    const nestedRequiredFields = item.known_missing_fields.filter((field) =>
      field.startsWith("specifications.") &&
      field !== "specifications." &&
      !field.slice("specifications.".length).split(".").some((part) => !part),
    );
    return {
      id: item.product_id,
      brandId: maisonElleBrandId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      imageUrl: item.image_url,
      specifications: JSON.stringify(item.specifications),
      requiredFields: JSON.stringify([...requiredFields, ...nestedRequiredFields]),
    };
  });
  await prisma.product.createMany({ data: productRows });
  const storedProducts = await prisma.product.findMany({ where: { brandId: maisonElleBrandId } });
  const completeness = products.getProductCompleteness(storedProducts);

  const observationById = new Map(observations.map((observation) => [observation.observation_id, observation]));
  const claimsByObservation = new Map();
  for (const claim of claims) {
    const attached = claimsByObservation.get(claim.observation_id) ?? [];
    attached.push(claim);
    claimsByObservation.set(claim.observation_id, attached);
  }
  const runs = new Map();
  for (const observation of observations) {
    const run = runs.get(observation.audit_run_id) ?? [];
    run.push(observation);
    runs.set(observation.audit_run_id, run);
  }

  for (const metric of metrics) {
    const run = runs.get(metric.audit_run_id) ?? [];
    const mentionCount = run.filter((item) => item.brand_mentioned).length;
    assert.equal(metric.question_count, run.length, `${metric.audit_run_id} sample count matches observations`);
    assert.equal(metric.brand_mentions, mentionCount, `${metric.audit_run_id} mention count matches observations`);
    assert.ok(
      Math.abs(metric.brand_mention_rate - mentionCount / run.length) < 0.0001,
      `${metric.audit_run_id} mention rate matches observations`,
    );
  }

  const auditIds = new Map();
  const claimsById = new Map();
  for (const [runId, runObservations] of runs) {
    const first = runObservations[0];
    const sourceType = first.evidence_type === "simulated" ? "SIMULATED" : "EXTERNAL";
    assert.equal(sourceType, "SIMULATED", "This dataset must never be imported as external observations");
    const sourceName = first.audit_run_id === "RUN-OTHER"
      ? "Manual synthetic fixture"
      : first.source;
    const questionsForRun = runObservations
      .map((item) => item.question.toLocaleLowerCase().trim())
      .sort();
    const questionSetHash = createHash("sha256").update(questionsForRun.join("\n")).digest("hex");
    const runClaims = claims.filter((claim) =>
      runObservations.some((observation) => observation.observation_id === claim.observation_id),
    );
    const responseIds = new Map(runObservations.map((item) => [item.observation_id, `fixture-${item.observation_id}`]));
    const claimIds = new Map(runClaims.map((item) => [item.claim_id, `fixture-${item.claim_id}`]));
    const scoreResult = scoring.calculateScores({
      sourceType,
      responses: runObservations.map((item) => ({ brandMentioned: item.brand_mentioned })),
      competitorMentionCount: runObservations.reduce((total, item) => total + item.competitor_mentions.length, 0),
      accuracyChecks: runClaims.map((item) => ({ outcome: mapClaimOutcome(item.status) })),
      completedProductFields: completeness.completed,
      requiredProductFields: completeness.required,
    });
    const accuracyData = runClaims.map((item) => {
      const observation = observationById.get(item.observation_id);
      assert.ok(observation, `Claim ${item.claim_id} references a known observation`);
      const product = productFixtures.find((candidate) => candidate.sku === item.sku);
      assert.ok(product, `Claim ${item.claim_id} references a known product SKU`);
      const responseId = responseIds.get(item.observation_id);
      const id = claimIds.get(item.claim_id);
      claimsById.set(item.claim_id, { id, productId: product.product_id });
      return {
        id,
        responseId,
        productId: product.product_id,
        claim: item.field,
        observedValue: item.observed_claim == null ? "" : String(item.observed_claim),
        verifiedValue: String(item.verified_business_value),
        outcome: mapClaimOutcome(item.status),
        discrepancyType: item.field,
        severity: item.status === "inaccurate" ? "high" : "medium",
        suggestedCorrection: item.explanation,
      };
    });
    const auditId = `fixture-${runId}`;
    auditIds.set(runId, auditId);
    await prisma.audit.create({
      data: {
        id: auditId,
        organizationId: "local-org",
        brandId: maisonElleBrandId,
        sourceType,
        sourceName,
        collectionMethod: first.collection_method,
        methodologyVersion: "1.0",
        questionSetHash,
        sampleSize: runObservations.length,
        createdAt: new Date(first.collected_at),
        responses: {
          create: runObservations.map((item) => ({
            id: responseIds.get(item.observation_id),
            question: item.question,
            response: item.response_text,
            sourceName,
            collectionMethod: item.collection_method,
            observedAt: new Date(item.collected_at),
            brandMentioned: item.brand_mentioned,
            productId: questionProductId(item.question_id),
            competitorMentions: {
              create: item.competitor_mentions.map((competitor) => ({ competitor, mentionCount: 1 })),
            },
          })),
        },
        accuracyChecks: { create: accuracyData },
        categoryScores: {
          create: Object.entries(scoreResult.categories).map(([category, result]) => ({
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
            organizationId: "local-org",
            brandId: maisonElleBrandId,
            overallScore: scoreResult.overall,
            classification: scoreResult.classification,
            methodologyVersion: "1.0",
            sourceType,
            sampleSize: runObservations.length,
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

  const recommendationRows = recommendations.map((item) => {
    const relatedObservations = item.linked_observation_ids
      .map((id) => observationById.get(id))
      .filter(Boolean);
    assert.ok(relatedObservations.length > 0, `${item.recommendation_id} references known observations`);
    const firstRelatedRun = relatedObservations[0].audit_run_id;
    const linkedClaims = claims.filter((claim) => item.linked_observation_ids.includes(claim.observation_id));
    const linkedProductId = linkedClaims.length
      ? productFixtures.find((product) => product.sku === linkedClaims[0].sku)?.product_id
      : null;
    const fixtureStatus = mapStatus(item.status);
    const relatedStatusHistory = statusHistory
      .filter((entry) => entry.recommendation_id === item.recommendation_id)
      .map((entry) => ({
        ...mapStatus(entry.to_status),
        changedAt: new Date(entry.changed_at),
      }))
      .filter((entry) => entry.approvalStatus !== fixtureStatus.approvalStatus ||
        entry.completionStatus !== fixtureStatus.completionStatus ||
        item.status === "in_progress" || item.status === "completed");
    return {
      id: item.recommendation_id,
      organizationId: "local-org",
      brandId: maisonElleBrandId,
      auditId: auditIds.get(firstRelatedRun),
      category: item.category,
      productId: linkedProductId,
      evidenceRef: `fixture:${item.recommendation_id}`,
      title: item.title,
      issue: item.title,
      supportingEvidence: JSON.stringify({
        observationIds: item.linked_observation_ids,
        owner: item.owner,
        dueDate: item.due_date,
        fixtureStatus: item.status,
        dataOrigin: item.data_origin,
      }),
      recommendedAction: item.title,
      whyItMatters: "Synthetic fixture recommendation; importing it does not execute the suggested action.",
      priority: item.priority,
      effort: "unspecified",
      ...fixtureStatus,
      statusChanges: { create: relatedStatusHistory },
    };
  });
  for (const recommendation of recommendationRows) {
    await prisma.recommendation.create({ data: recommendation });
  }

  await prisma.followUpAudit.createMany({
    data: followups.map((item) => ({
      id: item.followup_id,
      organizationId: "local-org",
      brandId: maisonElleBrandId,
      scheduledFor: new Date(item.scheduled_for),
      status: item.status,
      createdAt: new Date("2026-10-28T14:00:00Z"),
    })),
  });
  return { auditIds, claimsById, completeness };
}

test("imports and exercises the fictional MAISON ELLE dataset in isolation", async (t) => {
  assert.ok(
    datasetPath,
    "Set AISHELF_MAISON_ELLE_DATASET to the supplied dataset directory before running this test.",
  );
  const fixture = {
    brand: await readJson("brand.json"),
    products: await readJson("products.json"),
    questions: await readJson("questions.json"),
    audit_observations: await readJson("audit_observations.json"),
    audit_run_metrics: await readJson("audit_run_metrics.json"),
    claim_checks: await readJson("claim_checks.json"),
    recommendations: await readJson("recommendations.json"),
    recommendation_status_history: await readJson("recommendation_status_history.json"),
    followups: await readJson("followups.json"),
  };
  assert.equal(fixture.questions.length, 6);
  assert.equal(fixture.products.length, 5);

  let server;
  let prisma;
  let adminClient;
  let testSchema;
  let ownsTestSchema = false;
  let ownsDistDirectory = false;
  let ownsTsconfig = false;
  let serverOutput = "";
  try {
    const testDatabaseUrl = process.env.AISHELF_TEST_DATABASE_URL;
    assert.ok(testDatabaseUrl, "Set AISHELF_TEST_DATABASE_URL to a disposable PostgreSQL database for MAISON ELLE tests.");
    const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
    assert.ok(
      ["postgres:", "postgresql:"].includes(parsedTestDatabaseUrl.protocol),
      "AISHELF_TEST_DATABASE_URL must use PostgreSQL.",
    );
    testSchema = `aishelf_maison_${process.pid}_${randomUUID().replaceAll("-", "")}`;
    const scopedDatabaseUrl = new URL(testDatabaseUrl);
    scopedDatabaseUrl.searchParams.set("schema", testSchema);
    adminClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
    });
    await adminClient.$connect();
    await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}"`);
    ownsTestSchema = true;
    const databaseUrl = scopedDatabaseUrl.toString();
    await copyFile(path.join(projectRoot, "tsconfig.json"), tsconfigPath, constants.COPYFILE_EXCL);
    ownsTsconfig = true;
    await mkdir(distPath);
    ownsDistDirectory = true;
    const environment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      AISHELF_TEST_DIST_DIR: distDir,
      AISHELF_TEST_TSCONFIG: tsconfigFile,
      AISHELF_TEST_AUTH_BYPASS: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    const migration = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
      { cwd: projectRoot, env: environment, encoding: "utf8" },
    );
    if (migration.status !== 0) {
      const password = decodeURIComponent(parsedTestDatabaseUrl.password);
      let output = `${migration.stdout ?? ""}\n${migration.stderr ?? ""}`
        .replaceAll(databaseUrl, "[connection string redacted]")
        .replaceAll(testDatabaseUrl, "[connection string redacted]");
      if (password) output = output.replaceAll(password, "[redacted]");
      throw new Error(`Could not initialize the isolated fixture database.\n${output}`);
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    const scoring = require(path.join(projectRoot, ".test-tmp-maison/scoring.js"));
    const products = require(path.join(projectRoot, ".test-tmp-maison/products.js"));
    const imported = await loadFixture({ prisma, fixture, scoring, products });

    const port = await findAvailablePort();
    const baseUrl = `http://localhost:${port}`;
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--hostname", "localhost", "--port", String(port)],
      { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] },
    );
    server.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
    server.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
    await waitForServer(server, baseUrl, () => serverOutput);

    const brandHeaders = { "x-aishelf-brand-id": maisonElleBrandId };
    const defaultDashboardResponse = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(defaultDashboardResponse.status, 200);
    const defaultDashboard = await defaultDashboardResponse.json();
    assert.equal(defaultDashboard.brand.name, "Your brand");
    assert.equal(defaultDashboard.products.length, 0);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, { headers: brandHeaders });
    assert.equal(dashboardResponse.status, 200);
    const dashboard = await dashboardResponse.json();
    assert.equal(dashboard.brand.name, "MAISON ELLE");
    assert.equal(dashboard.products.length, 5);
    assert.equal(dashboard.catalogCompleteness.completed, imported.completeness.completed);
    assert.equal(dashboard.catalogCompleteness.required, imported.completeness.required);
    assert.equal(dashboard.catalogCompleteness.completed, 25);
    assert.equal(dashboard.catalogCompleteness.required, 29);
    assert.equal(dashboard.history.length, 3);

    const baseHistory = dashboard.history.find((item) => item.id === imported.auditIds.get("RUN-BASE"));
    const followupHistory = dashboard.history.find((item) => item.id === imported.auditIds.get("RUN-FOLLOWUP"));
    const otherHistory = dashboard.history.find((item) => item.id === imported.auditIds.get("RUN-OTHER"));
    assert.ok(baseHistory);
    assert.ok(followupHistory);
    assert.ok(otherHistory);
    assert.equal(baseHistory.sourceType, "SIMULATED");
    assert.equal(followupHistory.sourceType, "SIMULATED");
    assert.equal(otherHistory.sourceType, "SIMULATED");
    assert.equal(baseHistory.sampleSize, 6);
    assert.equal(followupHistory.sampleSize, 6);
    assert.equal(baseHistory.questionSetHash, followupHistory.questionSetHash);
    assert.notEqual(otherHistory.questionSetHash, baseHistory.questionSetHash);
    assert.equal(baseHistory.evidence.responses.filter((item) => item.brandMentioned).length, 2);
    assert.equal(followupHistory.evidence.responses.filter((item) => item.brandMentioned).length, 6);
    assert.equal(baseHistory.score, 46);
    assert.equal(followupHistory.score, 93);
    assert.equal(baseHistory.categoryScores.find((item) => item.category === "competitive")?.score, 33);
    assert.equal(followupHistory.categoryScores.find((item) => item.category === "competitive")?.score, 75);
    const missingSpecificationSnapshots = await prisma.productFieldSnapshot.findMany({
      where: {
        auditId: baseHistory.id,
        completed: false,
        fieldName: { startsWith: "specifications." },
      },
    });
    assert.deepEqual(
      missingSpecificationSnapshots.map((item) => item.fieldName).sort(),
      [
        "specifications.care",
        "specifications.colors",
        "specifications.material",
        "specifications.sizes",
      ],
    );
    if (dashboard.latestAudit.id === otherHistory.id) {
      assert.equal(dashboard.previousComparable, null);
    } else {
      assert.equal(dashboard.previousComparable?.id, baseHistory.id);
    }
    await prisma.audit.delete({ where: { id: otherHistory.id } });
    const comparableDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, { headers: brandHeaders });
    assert.equal(comparableDashboardResponse.status, 200);
    const comparableDashboard = await comparableDashboardResponse.json();
    assert.equal(comparableDashboard.latestAudit.id, followupHistory.id);
    assert.equal(comparableDashboard.previousComparable?.id, baseHistory.id);

    const latestAudit = comparableDashboard.latestAudit;
    assert.equal(latestAudit.sourceType, "SIMULATED");
    assert.equal(latestAudit.responses.length, 6);
    assert.equal(
      latestAudit.responses.reduce((total, item) => total + item.competitorMentions.length, 0),
      2,
    );
    assert.deepEqual(
      new Set(baseHistory.evidence.accuracyChecks.map((item) => item.outcome)),
      new Set(["ACCURATE", "INACCURATE", "MISSING", "UNVERIFIED"]),
    );
    assert.equal(dashboard.recommendations.length, 5);
    assert.deepEqual(
      new Set(dashboard.recommendations.map((item) => item.priority)),
      new Set(["critical", "high", "medium", "low"]),
    );
    assert.equal(dashboard.followUps.length, 1);
    assert.equal(dashboard.followUps[0].status, "scheduled");
    assert.equal(dashboard.followUps[0].scheduledFor, "2026-11-11T14:00:00.000Z");

    const baseClaim = await prisma.accuracyCheck.findUnique({ where: { id: imported.claimsById.get("C02").id } });
    assert.ok(baseClaim);
    const issueResponse = await fetch(`${baseUrl}/api/issues/${baseClaim.id}`, {
      method: "PATCH",
      headers: { ...brandHeaders, "content-type": "application/json" },
      body: JSON.stringify({ reviewStatus: "approved" }),
    });
    assert.equal(issueResponse.status, 200);
    assert.equal((await issueResponse.json()).issue.reviewStatus, "approved");

    const recommendationResponse = await fetch(`${baseUrl}/api/recommendations/REC-01`, {
      method: "PATCH",
      headers: { ...brandHeaders, "content-type": "application/json" },
      body: JSON.stringify({ approvalStatus: "approved" }),
    });
    assert.equal(recommendationResponse.status, 200);
    const approvedRecommendation = (await recommendationResponse.json()).recommendation;
    assert.equal(approvedRecommendation.approvalStatus, "approved");
    assert.equal(approvedRecommendation.completionStatus, "in_progress");

    const completionResponse = await fetch(`${baseUrl}/api/recommendations/REC-01`, {
      method: "PATCH",
      headers: { ...brandHeaders, "content-type": "application/json" },
      body: JSON.stringify({ completionStatus: "implemented" }),
    });
    assert.equal(completionResponse.status, 200);
    assert.equal((await completionResponse.json()).recommendation.completionStatus, "implemented");
    const updatedRecommendation = await prisma.recommendation.findUnique({
      where: { id: "REC-01" },
      include: { statusChanges: true },
    });
    assert.equal(updatedRecommendation.statusChanges.length, 3);
    assert.equal(updatedRecommendation.statusChanges.at(-1).completionStatus, "implemented");

    t.diagnostic("Fixture evidence is synthetic and was imported only into a temporary PostgreSQL schema.");
    t.diagnostic("The baseline README states 1/6 mentions, but its observations and run metrics agree on 2/6; scores use the observations.");
    t.diagnostic("The app has no dedicated deferred, recommendation owner, or due-date fields; those fixture details remain in recommendation evidence.");
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    if (ownsDistDirectory) await rm(distPath, { recursive: true, force: true });
    if (ownsTsconfig) await rm(tsconfigPath, { force: true });
    try {
      if (prisma) await prisma.$disconnect();
    } finally {
      if (adminClient) {
        try {
          if (ownsTestSchema) {
            await adminClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
          }
        } finally {
          await adminClient.$disconnect();
        }
      }
    }
  }
});
