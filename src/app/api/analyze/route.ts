import { analysisRequestSchema, type StreamEvent } from "@/lib/contracts";
import { runAnalysis, PipelineError } from "@/lib/analyze";
import { createSafetyIdentifier } from "@/lib/identity";
import {
  checkRateLimit,
  RateLimitConfigurationError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { code: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = analysisRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        code: "invalid_request",
        message: "Check the solicitation length and request fields.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const rateLimit = await checkRateLimit(request);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          code: "rate_limited",
          message: "The public demo limit has been reached. Please try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }
  } catch (error) {
    return Response.json(
      {
        code: "configuration_error",
        message:
          error instanceof RateLimitConfigurationError
            ? "The demo limit is not configured yet."
            : "The demo limit could not be checked. Please try again.",
      },
      { status: 503 },
    );
  }

  let safetyIdentifier: string;
  try {
    safetyIdentifier = createSafetyIdentifier(parsed.data.sessionId);
  } catch {
    return Response.json(
      {
        code: "configuration_error",
        message: "The analysis service is not configured yet.",
      },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void runAnalysis(parsed.data, safetyIdentifier, emit)
        .catch((error: unknown) => {
          if (error instanceof PipelineError) {
            emit({
              type: "error",
              stage: error.stage,
              code: error.code,
              message: error.message,
              retryable: error.retryable,
            });
            return;
          }
          emit({
            type: "error",
            stage: "request",
            code: "analysis_failed",
            message: "The analysis could not be completed.",
            retryable: false,
          });
        })
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
