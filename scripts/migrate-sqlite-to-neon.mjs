import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = process.env.AISHELF_SQLITE_URL;
const targetUrl = process.env.NEON_DATABASE_URL;
const models = [
  { client: "organization", table: "Organization" },
  { client: "brand", table: "Brand" },
  { client: "product", table: "Product" },
  { client: "audit", table: "Audit" },
  { client: "auditResponse", table: "AuditResponse" },
  { client: "competitorMention", table: "CompetitorMention" },
  { client: "accuracyCheck", table: "AccuracyCheck" },
  { client: "auditCategoryScore", table: "AuditCategoryScore" },
  { client: "productFieldSnapshot", table: "ProductFieldSnapshot" },
  { client: "brandScoreSnapshot", table: "BrandScoreSnapshot" },
  { client: "recommendation", table: "Recommendation" },
  { client: "recommendationStatusChange", table: "RecommendationStatusChange" },
  { client: "followUpAudit", table: "FollowUpAudit" },
];

assert.ok(sourceUrl, "Set AISHELF_SQLITE_URL to the read-only local dev.db URL.");
assert.ok(targetUrl, "Set NEON_DATABASE_URL to the Neon connection string.");

const sqliteUrl = new URL(sourceUrl);
assert.equal(sqliteUrl.protocol, "file:", "AISHELF_SQLITE_URL must use SQLite.");
assert.equal(sqliteUrl.searchParams.get("mode"), "ro", "SQLite must be opened read-only.");
assert.equal(
  path.resolve(fileURLToPath(sqliteUrl)),
  path.resolve(projectRoot, "dev.db"),
  "Migration source must be the project's dev.db, not another database file.",
);

const postgresUrl = new URL(targetUrl);
assert.ok(
  ["postgres:", "postgresql:"].includes(postgresUrl.protocol),
  "NEON_DATABASE_URL must use PostgreSQL.",
);
assert.ok(postgresUrl.hostname.endsWith(".neon.tech"), "Target must be a Neon database.");
assert.ok(
  ["require", "verify-ca", "verify-full"].includes(postgresUrl.searchParams.get("sslmode")),
  "Neon connection must require SSL.",
);

const sensitiveValues = [
  targetUrl,
  decodeURIComponent(postgresUrl.username),
  decodeURIComponent(postgresUrl.password),
].filter(Boolean);

function redact(value) {
  return sensitiveValues.reduce(
    (result, sensitive) => result.replaceAll(sensitive, "[REDACTED]"),
    String(value),
  );
}

function runPrisma(args, databaseUrl) {
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, "node_modules/prisma/build/index.js"), ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
      },
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) process.stdout.write(redact(output));
  if (result.error) throw new Error(`Prisma ${args[0]} could not run: ${redact(result.error.message)}`);
  if (result.status !== 0) throw new Error(`Prisma ${args[0]} failed with status ${result.status}.`);
}

function canonicalRows(rows) {
  const normalize = (value) => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, normalize(value[key])]),
      );
    }
    return value;
  };
  return JSON.stringify(
    rows.map(normalize).sort((left, right) => left.id.localeCompare(right.id)),
  );
}

async function publicRelations(client) {
  return client.$queryRaw`
    SELECT c.relname AS name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ORDER BY c.relname
  `;
}

function makeMigrationSchema(source, provider, output) {
  const legacyModels = source.replace(
    /\nmodel (?:AiProjectBudget|AiRequestWindow|AiUsageEvent|AiAuditCache) \{[\s\S]*?\n\}\n/g,
    "\n",
  );
  return legacyModels
    .replace('provider = "postgresql"', `provider = "${provider}"`)
    .replace(
      /generator\s+client\s*\{[\s\S]*?\}/,
      `generator client {\n  provider = "prisma-client"\n  output   = "${output}"\n}`,
    );
}

async function main() {
  let source;
  let target;
  let temporaryDirectory;

  try {
    await mkdir(path.join(projectRoot, "node_modules/.cache"), { recursive: true });
    temporaryDirectory = await mkdtemp(
      path.join(projectRoot, "node_modules/.cache/aishelf-neon-migration-"),
    );
    const originalSchema = await readFile(path.join(projectRoot, "prisma/schema.prisma"), "utf8");
    const sqliteSchemaPath = path.join(temporaryDirectory, "schema-sqlite.prisma");
    const postgresSchemaPath = path.join(temporaryDirectory, "schema-postgres.prisma");
    const sqliteSchema = makeMigrationSchema(originalSchema, "sqlite", "./sqlite-client");
    const postgresSchema = makeMigrationSchema(originalSchema, "postgresql", "./postgres-client");
    assert.match(sqliteSchema, /provider = "sqlite"/);
    assert.match(postgresSchema, /provider = "postgresql"/);
    await writeFile(sqliteSchemaPath, sqliteSchema, { mode: 0o600 });
    await writeFile(postgresSchemaPath, postgresSchema, { mode: 0o600 });

    runPrisma(["generate", "--schema", sqliteSchemaPath], sourceUrl);
    runPrisma(["generate", "--schema", postgresSchemaPath], targetUrl);
    const sqliteClient = await import(
      pathToFileURL(path.join(temporaryDirectory, "sqlite-client/client.ts")).href
    );
    const postgresClient = await import(
      pathToFileURL(path.join(temporaryDirectory, "postgres-client/client.ts")).href
    );
    source = new sqliteClient.PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: sourceUrl }),
    });
    target = new postgresClient.PrismaClient({
      adapter: new PrismaPg({ connectionString: targetUrl }),
    });
    await source.$connect();
    await target.$connect();

    const sourceRows = new Map();
    const sourceCounts = {};
    for (const { client, table } of models) {
      const rows = await source[client].findMany();
      sourceRows.set(client, rows);
      sourceCounts[table] = rows.length;
    }
    assert.ok(
      Object.values(sourceCounts).some((count) => count > 0),
      "Source database is unexpectedly empty; no migration was attempted.",
    );

    const existingRelations = await publicRelations(target);
    const expectedTables = new Set(models.map(({ table }) => table));
    const unexpectedRelations = existingRelations.filter(({ name }) => !expectedTables.has(name));
    assert.equal(
      unexpectedRelations.length,
      0,
      "Neon contains public relations outside the expected AIShelf schema; refusing to modify it.",
    );
    if (existingRelations.length > 0) {
      assert.equal(
        existingRelations.length,
        expectedTables.size,
        "Neon has a partial AIShelf schema; refusing to modify it.",
      );
      for (const { client, table } of models) {
        assert.equal(
          await target[client].count(),
          0,
          `Neon table ${table} already has records; refusing to modify it.`,
        );
      }
    }

    runPrisma(["db", "push", "--schema", postgresSchemaPath, "--skip-generate"], targetUrl);
    const targetRelations = await publicRelations(target);
    assert.deepEqual(
      targetRelations.map(({ name }) => name).sort(),
      [...expectedTables].sort(),
      "Neon schema differs from the expected AIShelf tables.",
    );
    for (const { client, table } of models) {
      assert.equal(
        await target[client].count(),
        0,
        `Neon table ${table} is not empty; refusing to copy over existing records.`,
      );
    }

    await target.$transaction(async (transaction) => {
      for (const { client } of models) {
        const rows = sourceRows.get(client);
        if (rows.length > 0) await transaction[client].createMany({ data: rows });
      }
    }, { maxWait: 10_000, timeout: 120_000 });

    const verifiedCounts = {};
    for (const { client, table } of models) {
      const targetRows = await target[client].findMany();
      assert.equal(
        canonicalRows(targetRows),
        canonicalRows(sourceRows.get(client)),
        `${table} records differ after migration.`,
      );
      verifiedCounts[table] = targetRows.length;
    }

    console.log(JSON.stringify({
      status: "verified",
      target: postgresUrl.hostname,
      sourceWasReadOnly: true,
      applicationDatabaseWasNotSwitched: true,
      exactRowsVerifiedByTable: verifiedCounts,
    }, null, 2));
  } catch (error) {
    throw new Error(`Migration stopped without deleting existing data: ${redact(error.message)}`);
  } finally {
    try {
      if (target) await target.$disconnect();
    } finally {
      try {
        if (source) await source.$disconnect();
      } finally {
        if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
