import { createHmac } from "node:crypto";

export function createSafetyIdentifier(sessionId: string) {
  const configuredSecret = process.env.SAFETY_IDENTIFIER_SECRET?.trim();
  const secret =
    configuredSecret ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "bidcheck-local-development");

  if (!secret) {
    throw new Error("SAFETY_IDENTIFIER_SECRET is not configured.");
  }

  return createHmac("sha256", secret).update(sessionId).digest("hex");
}
