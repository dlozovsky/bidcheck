import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalysisResult, StreamEvent } from "@/lib/contracts";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  RateLimitConfigurationError: class RateLimitConfigurationError extends Error {},
}));

vi.mock("@/lib/analyze", () => {
  class PipelineError extends Error {
    constructor(
      public readonly stage: "extraction" | "gap_check" | "memo",
      public readonly code: string,
      message: string,
      public readonly retryable: boolean,
    ) {
      super(message);
    }
  }
  return { runAnalysis: vi.fn(), PipelineError };
});

import { PipelineError, runAnalysis } from "@/lib/analyze";
import { POST } from "@/app/api/analyze/route";

const requestBody = {
  sourceText: "A".repeat(500),
  sourceName: "Route fixture",
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
};

function request() {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
}

const result = {
  sourceName: "Route fixture",
  createdAt: "2026-07-18T00:00:00.000Z",
  extraction: {
    solicitationMeta: {
      solicitationNumber: null,
      agency: null,
      title: null,
      naicsCode: null,
      setAside: null,
      contractType: null,
      responseDeadline: null,
      questionsDeadline: null,
      periodOfPerformance: null,
      placeOfPerformance: null,
    },
    requirements: [],
    deliverables: [],
    evaluationCriteria: [],
    referencedClauses: [],
    aiMlScope: false,
  },
  gapCheck: {
    findings: [],
    topThreeActions: [],
    signals: {
      opportunityRisk: "low",
      readinessCoverage: "undetermined",
      confidence: "solicitation_only",
      applicableRuleCount: 0,
      evaluatedRuleCount: 0,
      statusCounts: {
        gap: 0,
        needs_review: 0,
        not_evaluated: 0,
        satisfied: 0,
        not_applicable: 0,
      },
    },
  },
  memo: {
    recommendation: "BID_WITH_CONDITIONS",
    confidence: "solicitation_only",
    rationale: "Company evidence is required.",
    memoMarkdown: "# BidCheck memo",
  },
} satisfies AnalysisResult;

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.mocked(runAnalysis).mockReset();
  });

  it("streams a complete happy path", async () => {
    vi.mocked(runAnalysis).mockImplementation(
      async (_input, _identifier, emit) => {
        await emit({
          type: "progress",
          stage: "extraction",
          status: "started",
        });
        await emit({ type: "complete", data: result });
        return result;
      },
    );

    const response = await POST(request());
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as StreamEvent);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(events.map((event) => event.type)).toEqual(["progress", "complete"]);
  });

  it("streams one safe, stage-specific pipeline failure", async () => {
    vi.mocked(runAnalysis).mockRejectedValue(
      new PipelineError(
        "gap_check",
        "model_request_failed",
        "The gap check stage could not be completed.",
        true,
      ),
    );

    const response = await POST(request());
    const event = JSON.parse((await response.text()).trim()) as StreamEvent;

    expect(response.status).toBe(200);
    expect(event).toEqual({
      type: "error",
      stage: "gap_check",
      code: "model_request_failed",
      message: "The gap check stage could not be completed.",
      retryable: true,
    });
  });
});
