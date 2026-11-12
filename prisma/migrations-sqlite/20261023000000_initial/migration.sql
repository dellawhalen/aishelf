-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" REAL,
    "category" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "specifications" TEXT NOT NULL DEFAULT '{}',
    "requiredFields" TEXT NOT NULL DEFAULT '["description","price","category","imageUrl"]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "collectionMethod" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL DEFAULT '1.0',
    "questionSetHash" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Audit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Audit_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "collectionMethod" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brandMentioned" BOOLEAN NOT NULL,
    "productId" TEXT,
    CONSTRAINT "AuditResponse_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorMention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "mentionCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CompetitorMention_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "AuditResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccuracyCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "responseId" TEXT,
    "productId" TEXT,
    "claim" TEXT NOT NULL,
    "verifiedValue" TEXT NOT NULL,
    "observedValue" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "discrepancyType" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "suggestedCorrection" TEXT NOT NULL DEFAULT '',
    "reviewStatus" TEXT NOT NULL DEFAULT 'needs_review',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccuracyCheck_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccuracyCheck_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "AuditResponse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccuracyCheck_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditCategoryScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" REAL,
    "evidenceCount" INTEGER NOT NULL,
    "calculation" TEXT NOT NULL,
    CONSTRAINT "AuditCategoryScore_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductFieldSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL,
    CONSTRAINT "ProductFieldSnapshot_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandScoreSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "overallScore" REAL,
    "classification" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "evidenceReferences" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandScoreSnapshot_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "productId" TEXT,
    "accuracyCheckId" TEXT,
    "evidenceRef" TEXT,
    "title" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "supportingEvidence" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "completionStatus" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_accuracyCheckId_fkey" FOREIGN KEY ("accuracyCheckId") REFERENCES "AccuracyCheck" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecommendationStatusChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recommendationId" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL,
    "completionStatus" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationStatusChange_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowUpAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUpAudit_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Brand_organizationId_idx" ON "Brand"("organizationId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Audit_organizationId_brandId_createdAt_idx" ON "Audit"("organizationId", "brandId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditResponse_auditId_idx" ON "AuditResponse"("auditId");

-- CreateIndex
CREATE INDEX "CompetitorMention_responseId_idx" ON "CompetitorMention"("responseId");

-- CreateIndex
CREATE INDEX "AccuracyCheck_auditId_idx" ON "AccuracyCheck"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditCategoryScore_auditId_category_key" ON "AuditCategoryScore"("auditId", "category");

-- CreateIndex
CREATE INDEX "ProductFieldSnapshot_auditId_idx" ON "ProductFieldSnapshot"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandScoreSnapshot_auditId_key" ON "BrandScoreSnapshot"("auditId");

-- CreateIndex
CREATE INDEX "BrandScoreSnapshot_organizationId_brandId_createdAt_idx" ON "BrandScoreSnapshot"("organizationId", "brandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_accuracyCheckId_key" ON "Recommendation"("accuracyCheckId");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_evidenceRef_key" ON "Recommendation"("evidenceRef");

-- CreateIndex
CREATE INDEX "Recommendation_organizationId_brandId_createdAt_idx" ON "Recommendation"("organizationId", "brandId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationStatusChange_recommendationId_changedAt_idx" ON "RecommendationStatusChange"("recommendationId", "changedAt");

-- CreateIndex
CREATE INDEX "FollowUpAudit_organizationId_brandId_scheduledFor_idx" ON "FollowUpAudit"("organizationId", "brandId", "scheduledFor");
