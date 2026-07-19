import { z } from "zod";

export const MIN_SOURCE_LENGTH = 500;
export const MAX_SOURCE_LENGTH = 60_000;
export const MAX_PROFILE_LENGTH = 10_000;

const nullableText = z.string().nullable();

export const analysisRequestSchema = z.object({
  sourceText: z.string().trim().min(MIN_SOURCE_LENGTH).max(MAX_SOURCE_LENGTH),
  sourceName: z.string().trim().min(1).max(160).optional(),
  companyProfile: z.string().trim().max(MAX_PROFILE_LENGTH).optional(),
  sessionId: z.uuid(),
});

export const extractionSchema = z.object({
  solicitationMeta: z.object({
    solicitationNumber: nullableText,
    agency: nullableText,
    title: nullableText,
    naicsCode: nullableText,
    setAside: nullableText,
    contractType: nullableText,
    responseDeadline: nullableText,
    questionsDeadline: nullableText,
    periodOfPerformance: nullableText,
    placeOfPerformance: nullableText,
  }),
  requirements: z.array(
    z.object({
      id: z.string().regex(/^REQ-\d{3,}$/),
      category: z.enum([
        "technical",
        "security",
        "compliance",
        "personnel",
        "deliverable",
        "submission",
        "past_performance",
        "pricing",
        "other",
      ]),
      verbatim: z.string(),
      summary: z.string(),
      sectionReference: nullableText,
    }),
  ),
  deliverables: z.array(
    z.object({
      name: z.string(),
      frequencyOrDue: nullableText,
    }),
  ),
  evaluationCriteria: z.array(
    z.object({
      factor: z.string(),
      weightOrOrder: nullableText,
    }),
  ),
  referencedClauses: z.array(z.string()),
  aiMlScope: z.boolean(),
});

export const ruleStatusSchema = z.enum([
  "satisfied",
  "gap",
  "needs_review",
  "not_applicable",
  "not_evaluated",
]);

export const findingBasisSchema = z.enum([
  "company_evidence",
  "solicitation_conflict",
  "trigger_absent",
  "missing_evidence",
]);

export const evidenceSchema = z.object({
  source: z.enum(["solicitation", "company_profile"]),
  reference: z.string(),
  quote: z.string().max(500),
});

export const gapCheckModelSchema = z.object({
  findings: z.array(
    z.object({
      ruleId: z.string(),
      status: ruleStatusSchema,
      basis: findingBasisSchema,
      evidence: z.array(evidenceSchema),
      note: z.string(),
    }),
  ),
  topThreeActions: z.array(z.string()).max(3),
});

export const memoDraftSchema = z.object({
  recommendation: z.enum(["BID", "NO_BID", "BID_WITH_CONDITIONS"]),
  rationale: z.string(),
  memoMarkdown: z.string(),
});

export const ruleSchema = z.object({
  ruleId: z.string(),
  title: z.string(),
  authority: z.string(),
  trigger: z.string(),
  check: z.string(),
  severity: z.enum(["red", "yellow", "green"]),
  category: z.enum([
    "registration",
    "security",
    "ai_governance",
    "accessibility",
    "socioeconomic",
    "submission",
    "supply_chain",
  ]),
  baseline: z.boolean(),
  type: z.enum(["readiness", "advisory"]),
  riskDriver: z.boolean(),
  sourceUrl: z.url(),
  lastVerified: z.string(),
});

export const rulebookSchema = z.object({
  version: z.string(),
  lastVerified: z.string(),
  copyright: z.string(),
  disclaimer: z.string(),
  rules: z.array(ruleSchema),
});

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export type RuleStatus = z.infer<typeof ruleStatusSchema>;
export type FindingBasis = z.infer<typeof findingBasisSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type GapCheckModel = z.infer<typeof gapCheckModelSchema>;
export type GapFinding = GapCheckModel["findings"][number];
export type MemoDraft = z.infer<typeof memoDraftSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Rulebook = z.infer<typeof rulebookSchema>;

export type OpportunityRisk = "low" | "moderate" | "high";
export type ReadinessCoverage = "undetermined" | "partial" | "complete";
export type MemoConfidence =
  | "solicitation_only"
  | "partial_readiness"
  | "full_readiness";

export type EnrichedFinding = GapFinding & {
  title: string;
  authority: string;
  severity: Rule["severity"];
  category: Rule["category"];
  sourceUrl: string;
  baseline: boolean;
  type: Rule["type"];
  riskDriver: boolean;
};

export type AggregateSignals = {
  opportunityRisk: OpportunityRisk;
  readinessCoverage: ReadinessCoverage;
  confidence: MemoConfidence;
  applicableRuleCount: number;
  evaluatedRuleCount: number;
  statusCounts: Record<RuleStatus, number>;
};

export type GapCheckResult = {
  findings: EnrichedFinding[];
  topThreeActions: string[];
  signals: AggregateSignals;
};

export type MemoResult = MemoDraft & {
  confidence: MemoConfidence;
};

export type AnalysisResult = {
  sourceName: string;
  createdAt: string;
  extraction: Extraction;
  gapCheck: GapCheckResult;
  memo: MemoResult;
};

export type PipelineStage = "extraction" | "gap_check" | "memo";

export type StreamEvent =
  | { type: "progress"; stage: PipelineStage; status: "started" | "completed" }
  | { type: "extraction"; data: Extraction }
  | { type: "gap_check"; data: GapCheckResult }
  | { type: "memo"; data: MemoResult }
  | { type: "complete"; data: AnalysisResult }
  | {
      type: "error";
      stage: PipelineStage | "request";
      code: string;
      message: string;
      retryable: boolean;
    };
