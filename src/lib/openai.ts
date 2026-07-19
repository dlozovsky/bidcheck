import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export function isRetryableOpenAIError(error: unknown) {
  return (
    error instanceof OpenAI.APIError &&
    (error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500))
  );
}

export class IncompleteModelOutputError extends Error {}

export function isRetryableModelError(error: unknown) {
  return (
    error instanceof IncompleteModelOutputError ||
    isRetryableOpenAIError(error)
  );
}
