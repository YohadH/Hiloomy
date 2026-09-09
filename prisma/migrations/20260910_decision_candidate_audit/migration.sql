-- Decision Candidate Audit (shadow ranking instrumentation). See
-- lib/domain/decision-candidate.ts and lib/services/decision-candidate-audit-service.ts.
CREATE TABLE "DecisionCandidateRun" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "rankingVersion" TEXT NOT NULL,
    "priorsVersion" TEXT NOT NULL,
    "weightsJson" JSONB NOT NULL,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "surfaced" INTEGER NOT NULL DEFAULT 0,
    "topDiffers" BOOLEAN NOT NULL DEFAULT false,
    "top3Overlap" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    CONSTRAINT "DecisionCandidateRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DecisionCandidateRun_storeId_runAt_idx" ON "DecisionCandidateRun"("storeId", "runAt" DESC);
ALTER TABLE "DecisionCandidateRun" ADD CONSTRAINT "DecisionCandidateRun_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DecisionCandidate" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "domain" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT true,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "titleJson" JSONB NOT NULL,
    "detailJson" JSONB NOT NULL,
    "financialExposure" DECIMAL(14,2),
    "financialExposureType" TEXT,
    "financialConfidence" TEXT NOT NULL,
    "materiality" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "actionability" INTEGER NOT NULL,
    "managementJudgment" INTEGER NOT NULL,
    "novelty" INTEGER NOT NULL,
    "crossDomainScore" INTEGER NOT NULL,
    "globalScore" DECIMAL(6,1) NOT NULL,
    "observableScore" DECIMAL(6,1) NOT NULL,
    "rank" INTEGER,
    "observableRank" INTEGER,
    "todayRank" INTEGER,
    "crossDomain" BOOLEAN NOT NULL DEFAULT false,
    "proposedStatus" TEXT,
    "surfaced" BOOLEAN NOT NULL DEFAULT false,
    "suppressionReason" TEXT,
    "relatedDecisionId" TEXT,
    CONSTRAINT "DecisionCandidate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DecisionCandidate_runId_idx" ON "DecisionCandidate"("runId");
CREATE INDEX "DecisionCandidate_storeId_runAt_idx" ON "DecisionCandidate"("storeId", "runAt" DESC);
CREATE INDEX "DecisionCandidate_storeId_domain_idx" ON "DecisionCandidate"("storeId", "domain");
CREATE INDEX "DecisionCandidate_relatedDecisionId_idx" ON "DecisionCandidate"("relatedDecisionId");
ALTER TABLE "DecisionCandidate" ADD CONSTRAINT "DecisionCandidate_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "DecisionCandidateRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCandidate" ADD CONSTRAINT "DecisionCandidate_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
