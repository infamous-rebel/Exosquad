-- Phase 12: Add computed scores to reseller_viability_assessments
-- Opportunity score (0-100) and viability score (0-100) are deterministic
-- outputs of the product opportunity engine.

ALTER TABLE "reseller_viability_assessments"
  ADD COLUMN "opportunityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "viabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "reseller_viability_assessments_opportunityScore_idx"
  ON "reseller_viability_assessments"("opportunityScore");

CREATE INDEX "reseller_viability_assessments_viabilityScore_idx"
  ON "reseller_viability_assessments"("viabilityScore");
