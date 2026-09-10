-- Decision Candidate Audit: clustering (raw signals -> management candidates).
ALTER TABLE "DecisionCandidateRun"
  ADD COLUMN "clusteringVersion" TEXT,
  ADD COLUMN "clusteredTopDiffers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "clusteredTop3Overlap" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "clusteringChangedTop" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "clusteringChangedTop3" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DecisionCandidate"
  ADD COLUMN "level" TEXT NOT NULL DEFAULT 'signal',
  ADD COLUMN "clusterId" TEXT,
  ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "leadSignalId" TEXT,
  ADD COLUMN "actionFamily" TEXT,
  ADD COLUMN "auditStatus" TEXT,
  ADD COLUMN "clusterJson" JSONB;

CREATE INDEX "DecisionCandidate_clusterId_idx" ON "DecisionCandidate"("clusterId");
