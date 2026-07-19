import { createHmac } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Limiters = {
  perIp: Ratelimit;
  global: Ratelimit;
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export class RateLimitConfigurationError extends Error {}

let limiters: Limiters | null = null;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getLimiters() {
  if (limiters) return limiters;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new RateLimitConfigurationError(
        "Upstash Redis is not configured.",
      );
    }
    return null;
  }

  const redis = new Redis({ url, token });
  limiters = {
    perIp: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        positiveInteger(process.env.RATE_LIMIT_PER_IP, 5),
        "15 m",
      ),
      analytics: false,
      prefix: "bidcheck:ip:v1",
    }),
    global: new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(
        positiveInteger(process.env.RATE_LIMIT_GLOBAL, 100),
        "1 d",
      ),
      analytics: false,
      prefix: "bidcheck:global:v1",
    }),
  };
  return limiters;
}

function clientIp(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "local-development";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function hashIp(ip: string) {
  const configuredSecret = process.env.RATE_LIMIT_HMAC_SECRET?.trim();
  const secret =
    configuredSecret ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "bidcheck-local-rate-limit");
  if (!secret) {
    throw new RateLimitConfigurationError(
      "RATE_LIMIT_HMAC_SECRET is not configured.",
    );
  }
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export async function checkRateLimit(
  request: Request,
): Promise<RateLimitDecision> {
  const configured = getLimiters();
  if (!configured) return { allowed: true };

  const identifier = hashIp(clientIp(request));
  const [perIp, global] = await Promise.all([
    configured.perIp.limit(identifier),
    configured.global.limit("all-analyses"),
  ]);

  if (perIp.success && global.success) return { allowed: true };
  const reset = Math.max(
    perIp.success ? 0 : perIp.reset,
    global.success ? 0 : global.reset,
  );
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1_000)),
  };
}
