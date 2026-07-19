import { zodTextFormat } from "openai/helpers/zod";

import { EXTRACTION_PROMPT } from "../../prompts/extraction";
import { GAP_CHECK_PROMPT } from "../../prompts/gap-check";
import { MEMO_PROMPT } from "../../prompts/memo";
import type {
  AnalysisRequest,
  AnalysisResult,
  Extraction,
  GapCheckModel,
  MemoDraft,
  PipelineStage,
  StreamEvent,
} from "@/lib/contracts";
import {
  extractionSchema,
  gapCheckModelSchema,
  memoDraftSchema,
} from "@/lib/contracts";
import {
  getOpenAI,
  IncompleteModelOutputError,
  isRetryableModelError,
} from "@/lib/openai";
import { rulebook } from "@/lib/rulebook";
import {
  applyMemoGuardrails,
  applyStatusGuardrails,
  calculateSignals,
  enrichFindings,
  validateFindingSet,
} from "@/lib/signals";

export class PipelineError extends Error {
  constructor(
    public readonly stage: PipelineStage,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

type Emit = (event: StreamEvent) => void | Promise<void>;

function normalizeRequirementIds(extraction: Extraction): Extraction {
  return {
    ...extraction,
    requirements: extraction.requirements.map((requirement, index) => ({
      ...requirement,
      id: `REQ-${String(index + 1).padStart(3, "0")}`,
    })),
  };
}

function memoWordCount(markdown: string) {
  return markdown
    .trim()
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

async function withRetry<T>(
  stage: PipelineStage,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableModelError(error) || attempt === 1) {
        break;
      }
    }
  }

  const missingKey =
    lastError instanceof Error &&
    lastError.message.includes("OPENAI_API_KEY");
  throw new PipelineError(
    stage,
    missingKey ? "configuration_error" : "model_request_failed",
    missingKey
      ? "The analysis service is not configured yet."
      : `The ${stage.replace("_", " ")} stage could not be completed.`,
    !missingKey && isRetryableModelError(lastError),
  );
}

async function extractSolicitation(
  request: AnalysisRequest,
  safetyIdentifier: string,
) {
  return withRetry("extraction", async () => {
    const response = await getOpenAI().responses.parse({
      model: process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.6-sol",
      store: false,
      safety_identifier: safetyIdentifier,
      reasoning: { effort: "low" },
      max_output_tokens: 24_000,
      instructions: EXTRACTION_PROMPT,
      input: `SOLICITATION TEXT:\n<<<\n${request.sourceText}\n>>>\n\nExtract per the schema.`,
      text: {
        format: zodTextFormat(extractionSchema, "solicitation_extraction"),
        verbosity: "low",
      },
    });

    if (!response.output_parsed) {
      throw new IncompleteModelOutputError(
        "Extraction returned no parsed output.",
      );
    }
    return normalizeRequirementIds(response.output_parsed);
  });
}

async function checkGaps(
  extraction: Awaited<ReturnType<typeof extractSolicitation>>,
  request: AnalysisRequest,
  safetyIdentifier: string,
): Promise<GapCheckModel> {
  return withRetry("gap_check", async () => {
    const response = await getOpenAI().responses.parse({
      model: process.env.OPENAI_GAP_MODEL ?? "gpt-5.6-sol",
      store: false,
      safety_identifier: safetyIdentifier,
      reasoning: { effort: "low" },
      max_output_tokens: 16_000,
      instructions: GAP_CHECK_PROMPT,
      input: `EXTRACTION:\n${JSON.stringify(extraction)}\n\nRULEBOOK:\n${JSON.stringify(rulebook.rules)}\n\nCOMPANY PROFILE (self-reported; may be absent):\n${request.companyProfile || "[NOT PROVIDED]"}`,
      text: {
        format: zodTextFormat(gapCheckModelSchema, "readiness_findings"),
        verbosity: "low",
      },
    });

    if (!response.output_parsed) {
      throw new IncompleteModelOutputError(
        "Gap-check returned no parsed output.",
      );
    }
    validateFindingSet(response.output_parsed.findings, rulebook.rules);
    return response.output_parsed;
  });
}

async function writeMemo(
  extraction: Awaited<ReturnType<typeof extractSolicitation>>,
  gapCheck: ReturnType<typeof buildGapResult>,
  request: AnalysisRequest,
  safetyIdentifier: string,
): Promise<MemoDraft> {
  return withRetry("memo", async () => {
    const response = await getOpenAI().responses.parse({
      model: process.env.OPENAI_MEMO_MODEL ?? "gpt-5.6-sol",
      store: false,
      safety_identifier: safetyIdentifier,
      reasoning: { effort: "medium" },
      max_output_tokens: 5_000,
      instructions: MEMO_PROMPT,
      input: `EXTRACTION:\n${JSON.stringify(extraction)}\n\nFINDINGS AND DETERMINISTIC SIGNALS:\n${JSON.stringify(gapCheck)}\n\nCOMPANY PROFILE (self-reported; may be absent):\n${request.companyProfile || "[NOT PROVIDED]"}`,
      text: {
        format: zodTextFormat(memoDraftSchema, "bid_memo"),
        verbosity: "medium",
      },
    });

    if (!response.output_parsed) {
      throw new IncompleteModelOutputError("Memo returned no parsed output.");
    }
    const words = memoWordCount(response.output_parsed.memoMarkdown);
    if (words < 400 || words > 600) {
      throw new IncompleteModelOutputError(
        `Memo length was ${words} words; expected 400-600.`,
      );
    }
    return response.output_parsed;
  });
}

function buildGapResult(modelResult: GapCheckModel, hasCompanyProfile: boolean) {
  const guarded = applyStatusGuardrails(
    modelResult.findings,
    hasCompanyProfile,
  );
  const findings = enrichFindings(guarded, rulebook.rules);
  return {
    findings,
    topThreeActions: modelResult.topThreeActions,
    signals: calculateSignals(findings),
  };
}

export async function runAnalysis(
  request: AnalysisRequest,
  safetyIdentifier: string,
  emit: Emit,
): Promise<AnalysisResult> {
  await emit({ type: "progress", stage: "extraction", status: "started" });
  const extraction = await extractSolicitation(request, safetyIdentifier);
  await emit({ type: "extraction", data: extraction });
  await emit({ type: "progress", stage: "extraction", status: "completed" });

  await emit({ type: "progress", stage: "gap_check", status: "started" });
  const gapModel = await checkGaps(extraction, request, safetyIdentifier);
  const gapCheck = buildGapResult(gapModel, Boolean(request.companyProfile));
  await emit({ type: "gap_check", data: gapCheck });
  await emit({ type: "progress", stage: "gap_check", status: "completed" });

  await emit({ type: "progress", stage: "memo", status: "started" });
  const memoDraft = await writeMemo(
    extraction,
    gapCheck,
    request,
    safetyIdentifier,
  );
  const memo = applyMemoGuardrails(
    memoDraft,
    gapCheck.signals.confidence,
  );
  await emit({ type: "memo", data: memo });
  await emit({ type: "progress", stage: "memo", status: "completed" });

  const result: AnalysisResult = {
    sourceName: request.sourceName ?? "Pasted solicitation",
    createdAt: new Date().toISOString(),
    extraction,
    gapCheck,
    memo,
  };
  await emit({ type: "complete", data: result });
  return result;
}
