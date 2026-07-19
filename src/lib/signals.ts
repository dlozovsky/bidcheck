import type {
  AggregateSignals,
  EnrichedFinding,
  GapFinding,
  MemoConfidence,
  MemoDraft,
  MemoResult,
  ReadinessCoverage,
  Rule,
  RuleStatus,
} from "@/lib/contracts";

const evaluatedStatuses = new Set<RuleStatus>([
  "satisfied",
  "gap",
  "needs_review",
]);

export function validateFindingSet(findings: GapFinding[], rules: Rule[]) {
  const expected = new Set(rules.map((rule) => rule.ruleId));
  const received = new Set(findings.map((finding) => finding.ruleId));

  if (received.size !== findings.length) {
    throw new Error("Gap-check returned duplicate rule IDs.");
  }

  if (
    expected.size !== received.size ||
    [...expected].some((ruleId) => !received.has(ruleId))
  ) {
    throw new Error("Gap-check did not return every rule exactly once.");
  }
}

export function applyStatusGuardrails(
  findings: GapFinding[],
  hasCompanyProfile: boolean,
): GapFinding[] {
  return findings.map((finding) => {
    if (finding.status === "not_applicable") {
      return {
        ...finding,
        basis: "trigger_absent",
        evidence: finding.evidence.filter(
          (item) => item.source === "solicitation",
        ),
      };
    }

    if (!hasCompanyProfile) {
      const supportedSolicitationConflict =
        finding.status === "gap" &&
        finding.basis === "solicitation_conflict" &&
        finding.evidence.some((item) => item.source === "solicitation");

      if (!supportedSolicitationConflict) {
        return {
          ...finding,
          status: "not_evaluated",
          basis: "missing_evidence",
          evidence: finding.evidence.filter(
            (item) => item.source === "solicitation",
          ),
          note:
            "This rule applies, but no relevant company evidence was provided.",
        };
      }
    }

    const hasCompanyEvidence = finding.evidence.some(
      (item) => item.source === "company_profile",
    );

    if (
      (finding.status === "satisfied" || finding.status === "needs_review") &&
      !hasCompanyEvidence
    ) {
      return {
        ...finding,
        status: "not_evaluated",
        basis: "missing_evidence",
        note:
          "This rule applies, but the company profile contains no relevant evidence.",
      };
    }

    if (
      finding.status === "gap" &&
      finding.basis !== "solicitation_conflict" &&
      !hasCompanyEvidence
    ) {
      return {
        ...finding,
        status: "not_evaluated",
        basis: "missing_evidence",
        note:
          "This rule applies, but a deficiency cannot be established without company evidence.",
      };
    }

    return finding;
  });
}

export function enrichFindings(
  findings: GapFinding[],
  rules: Rule[],
): EnrichedFinding[] {
  const byId = new Map(rules.map((rule) => [rule.ruleId, rule]));

  return findings.map((finding) => {
    const rule = byId.get(finding.ruleId);
    if (!rule) {
      throw new Error(`Unknown rule ID: ${finding.ruleId}`);
    }
    return {
      ...finding,
      title: rule.title,
      authority: rule.authority,
      severity: rule.severity,
      category: rule.category,
      sourceUrl: rule.sourceUrl,
      baseline: rule.baseline,
      type: rule.type,
      riskDriver: rule.riskDriver,
    };
  });
}

export function calculateSignals(
  findings: EnrichedFinding[],
): AggregateSignals {
  const statusCounts: Record<RuleStatus, number> = {
    gap: 0,
    needs_review: 0,
    not_evaluated: 0,
    satisfied: 0,
    not_applicable: 0,
  };

  for (const finding of findings) {
    statusCounts[finding.status] += 1;
  }

  const applicable = findings.filter(
    (finding) =>
      finding.type === "readiness" && finding.status !== "not_applicable",
  );
  const evaluated = applicable.filter((finding) =>
    evaluatedStatuses.has(finding.status),
  );

  let readinessCoverage: ReadinessCoverage = "undetermined";
  if (evaluated.length > 0) {
    readinessCoverage =
      evaluated.length === applicable.length ? "complete" : "partial";
  }

  const triggeredRiskDrivers = findings.filter(
    (finding) =>
      finding.status !== "not_applicable" &&
      (finding.riskDriver || finding.basis === "solicitation_conflict"),
  );
  const opportunityRisk = triggeredRiskDrivers.some(
    (finding) => finding.severity === "red",
  )
    ? "high"
    : triggeredRiskDrivers.some((finding) => finding.severity === "yellow")
      ? "moderate"
      : "low";

  const confidence: MemoConfidence =
    readinessCoverage === "complete"
      ? "full_readiness"
      : readinessCoverage === "partial"
        ? "partial_readiness"
        : "solicitation_only";

  return {
    opportunityRisk,
    readinessCoverage,
    confidence,
    applicableRuleCount: applicable.length,
    evaluatedRuleCount: evaluated.length,
    statusCounts,
  };
}

export function applyMemoGuardrails(
  draft: MemoDraft,
  confidence: MemoConfidence,
): MemoResult {
  return {
    ...draft,
    recommendation:
      draft.recommendation === "BID" && confidence !== "full_readiness"
        ? "BID_WITH_CONDITIONS"
        : draft.recommendation,
    confidence,
  };
}
