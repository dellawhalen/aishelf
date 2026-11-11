import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = `.next-functional-${process.pid}`;
const distPath = path.join(projectRoot, distDir);
const tsconfigFile = `.tsconfig-functional-${process.pid}.json`;
const tsconfigPath = path.join(projectRoot, tsconfigFile);
let server;
let baseUrl;
let adminClient;
let testSchema;
let ownsTestSchema = false;
let serverOutput = "";
let ownsDistDirectory = false;
let ownsTsconfig = false;

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

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Functional test server exited early.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/dashboard`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Functional test server did not become ready.\n${serverOutput}`);
}

before(async () => {
  const testDatabaseUrl = process.env.AISHELF_TEST_DATABASE_URL;
  assert.ok(testDatabaseUrl, "Set AISHELF_TEST_DATABASE_URL to a disposable PostgreSQL database for functional tests.");
  const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
  assert.ok(
    ["postgres:", "postgresql:"].includes(parsedTestDatabaseUrl.protocol),
    "AISHELF_TEST_DATABASE_URL must use PostgreSQL.",
  );
  testSchema = `aishelf_test_${process.pid}_${randomUUID().replaceAll("-", "")}`;
  const scopedDatabaseUrl = new URL(testDatabaseUrl);
  scopedDatabaseUrl.searchParams.set("schema", testSchema);
  adminClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
  });
  await adminClient.$connect();
  await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}"`);
  ownsTestSchema = true;

  await copyFile(path.join(projectRoot, "tsconfig.json"), tsconfigPath, constants.COPYFILE_EXCL);
  ownsTsconfig = true;
  await mkdir(distPath);
  ownsDistDirectory = true;
  const environment = {
    ...process.env,
    DATABASE_URL: scopedDatabaseUrl.toString(),
    DIRECT_URL: scopedDatabaseUrl.toString(),
    AISHELF_TEST_DIST_DIR: distDir,
    AISHELF_TEST_TSCONFIG: tsconfigFile,
    AISHELF_TEST_AUTH_BYPASS: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const migration = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "push"],
    { cwd: projectRoot, env: environment, encoding: "utf8" },
  );
  if (migration.status !== 0) {
    const parsedUrl = new URL(testDatabaseUrl);
    const password = decodeURIComponent(parsedUrl.password);
    const output = `${migration.stdout ?? ""}\n${migration.stderr ?? ""}`
      .replaceAll(scopedDatabaseUrl.toString(), "[connection string redacted]")
      .replaceAll(testDatabaseUrl, "[connection string redacted]");
    const safeOutput = password ? output.replaceAll(password, "[redacted]") : output;
    throw new Error(`Could not initialize the functional test database.\n${safeOutput}`);
  }

  const port = await findAvailablePort();
  baseUrl = `http://localhost:${port}`;
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--hostname", "localhost", "--port", String(port)],
    { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  await waitForServer();
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (ownsDistDirectory) {
    await rm(distPath, { recursive: true, force: true });
  }
  if (ownsTsconfig) {
    await rm(tsconfigPath, { force: true });
  }
  if (adminClient) {
    try {
      if (ownsTestSchema) {
        await adminClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      }
    } finally {
      await adminClient.$disconnect();
    }
  }
});

test("product and audit evidence flow through recommendations and the dashboard", async () => {
  const invalidProduct = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Invalid product", price: -1 }),
  });
  assert.equal(invalidProduct.status, 400);

  const productResponse = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Functional test shirt",
      description: "A cotton shirt used by the functional test.",
      price: 32,
      category: "Shirts",
      imageUrl: "https://example.test/shirt.jpg",
      specifications: JSON.stringify({ material: "cotton" }),
      requiresSpecifications: true,
    }),
  });
  assert.equal(productResponse.status, 201);
  const { product } = await productResponse.json();
  assert.equal(product.name, "Functional test shirt");

  const auditResponse = await fetch(`${baseUrl}/api/audits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceType: "SIMULATED",
      sourceName: "Functional test source",
      collectionMethod: "Functional API test",
      question: "Which cotton shirt should I buy?",
      response: "A competing brand's cotton shirt was recommended.",
      brandMentioned: false,
      competitorMentions: [{ competitor: "Example competitor", mentionCount: 1 }],
      accuracyCheck: {
        productId: product.id,
        claim: "Material",
        observedValue: "Polyester",
        verifiedValue: "Cotton",
        outcome: "INACCURATE",
        discrepancyType: "incorrect_material",
        severity: "high",
        suggestedCorrection: "Update the product material information.",
      },
    }),
  });
  assert.equal(auditResponse.status, 201);
  const { audit } = await auditResponse.json();
  assert.equal(audit.scoreSnapshot.overallScore, 15);
  assert.equal(audit.categoryScores.length, 4);

  const recommendationResponse = await fetch(`${baseUrl}/api/recommendations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auditId: audit.id }),
  });
  assert.equal(recommendationResponse.status, 201);
  const { recommendations } = await recommendationResponse.json();
  assert.equal(recommendations.length, 3);
  assert.ok(recommendations.some((item) => item.category === "accuracy"));
  assert.ok(recommendations.some((item) => item.category === "visibility"));
  assert.ok(recommendations.some((item) => item.category === "competitive"));

  const followUpResponse = await fetch(`${baseUrl}/api/follow-ups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }),
  });
  assert.equal(followUpResponse.status, 201);

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.ok(dashboard.products.some((item) => item.id === product.id));
  assert.equal(dashboard.latestAudit.id, audit.id);
  assert.equal(dashboard.latestAudit.responses[0].response, "A competing brand's cotton shirt was recommended.");
  assert.equal(dashboard.history[0].score, 15);
  assert.equal(dashboard.recommendations.length, 3);
  assert.equal(dashboard.followUps.length, 1);
});
