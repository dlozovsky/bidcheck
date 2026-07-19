import { describe, expect, it } from "vitest";

import type {
  EnrichedFinding,
  Evidence,
  GapFinding,
  MemoDraft,
  RuleStatus,
} from "@/lib/contracts";
import {
  applyMemoGuardrails,
  applyStatusGuardrails,
  calculateSignals,
} from "@/lib/signals";

const companyEvidence: Evidence = {
  source: "company_profile",
  reference: "Company profile",
  quote: "Current, relevant evidence is available.",
};

function finding(
  status: RuleStatus,
  evidence: Evidence[] = [companyEvidence],
): GapFinding {
  return {
    ruleId: "RB-TEST",
    status,
    basis:
      status === "not_applicable"
        ? "trigger_absent"
        : status === "not_evaluated"
          ? "missing_evidence"
          : "company_evidence",
    evidence,
    note: "Test finding",
  };
}

function enriched(
  status: RuleStatus,
  options: Partial<
    Pick<EnrichedFinding, "baseline" | "severity" | "riskDriver" | "type">
  > = {},
): EnrichedFinding {
  return {
    ...finding(status, status === "not_evaluated" ? [] : [companyEvidence]),
    title: "Test rule",
    authority: "Test authority",
    severity: options.severity ?? "green",
    category: "submission",
    sourceUrl: "https://example.com/rule",
    baseline: options.baseline ?? false,
    type: options.type ?? "readiness",
    riskDriver: options.riskDriver ?? false,
  };
}

describe("five-status guardrails", () => {
  it.each<RuleStatus>([
    "satisfied",
    "gap",
    "needs_review",
    "not_applicable",
    "not_evaluated",
  ])("preserves a valid %s finding with its required evidence", (status) => {
    const result = applyStatusGuardrails([finding(status)], true);
    expect(result[0]?.status).toBe(status);
  });

  it.each<RuleStatus>(["satisfied", "gap", "needs_review"])(
    "turns unsupported %s into not_evaluated, never a deficiency",
    (status) => {
      const result = applyStatusGuardrails([finding(status, [])], true);
      expect(result[0]).toMatchObject({
        status: "not_evaluated",
        basis: "missing_evidence",
      });
    },
  );

  it("keeps a solicitation-proven conflict even without company context", () => {
    const result = applyStatusGuardrails(
      [
        {
          ...finding("gap", [
            {
              source: "solicitation",
              reference: "Section L.3",
              quote: "Offerors must already hold the required facility clearance.",
            },
          ]),
          basis: "solicitation_conflict",
        },
      ],
      false,
    );
    expect(result[0]?.status).toBe("gap");
  });

  it("marks every other triggered rule not_evaluated without company context", () => {
    const result = applyStatusGuardrails([finding("satisfied")], false);
    expect(result[0]).toMatchObject({
      status: "not_evaluated",
      basis: "missing_evidence",
    });
  });
});

describe("deterministic aggregate and memo rules", () => {
  it("excludes always-on baseline severity from opportunity risk", () => {
    const signals = calculateSignals([
      enriched("gap", { baseline: true, severity: "red" }),
      enriched("satisfied", { baseline: false, severity: "green" }),
    ]);
    expect(signals.opportunityRisk).toBe("low");
  });

  it("keeps boilerplate red clauses from inflating a moderate fixture", () => {
    const signals = calculateSignals([
      enriched("not_evaluated", { severity: "red", riskDriver: false }),
      enriched("not_evaluated", { severity: "yellow", riskDriver: true }),
    ]);
    expect(signals.opportunityRisk).toBe("moderate");
  });

  it("uses the highest triggered risk-driver severity", () => {
    const signals = calculateSignals([
      enriched("satisfied", { severity: "yellow", riskDriver: true }),
      enriched("not_evaluated", { severity: "red", riskDriver: true }),
    ]);
    expect(signals.opportunityRisk).toBe("high");
  });

  it("treats an explicit solicitation conflict as a risk driver", () => {
    const conflict = {
      ...enriched("gap", { severity: "red", riskDriver: false }),
      basis: "solicitation_conflict" as const,
    };
    expect(calculateSignals([conflict]).opportunityRisk).toBe("high");
  });

  it("excludes advisory rules from the readiness denominator", () => {
    const signals = calculateSignals([
      enriched("satisfied", { type: "readiness" }),
      enriched("not_evaluated", { type: "advisory" }),
    ]);
    expect(signals).toMatchObject({
      readinessCoverage: "complete",
      confidence: "full_readiness",
      applicableRuleCount: 1,
      evaluatedRuleCount: 1,
    });
  });

  it.each([
    [[enriched("not_evaluated")], "undetermined", "solicitation_only"],
    [
      [enriched("satisfied"), enriched("not_evaluated")],
      "partial",
      "partial_readiness",
    ],
    [
      [enriched("satisfied"), enriched("gap"), enriched("not_applicable")],
      "complete",
      "full_readiness",
    ],
  ] as const)(
    "derives %s coverage and qualitative confidence",
    (findings, coverage, confidence) => {
      const signals = calculateSignals([...findings]);
      expect(signals.readinessCoverage).toBe(coverage);
      expect(signals.confidence).toBe(confidence);
      expect(typeof signals.confidence).toBe("string");
    },
  );

  it("converts BID to BID_WITH_CONDITIONS until readiness is complete", () => {
    const draft: MemoDraft = {
      recommendation: "BID",
      rationale: "Promising fit.",
      memoMarkdown: "# Memo",
    };
    expect(
      applyMemoGuardrails(draft, "partial_readiness").recommendation,
    ).toBe("BID_WITH_CONDITIONS");
    expect(applyMemoGuardrails(draft, "full_readiness").recommendation).toBe(
      "BID",
    );
  });
});
