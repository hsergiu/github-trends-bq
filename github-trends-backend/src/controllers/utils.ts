import crypto from "crypto";

export function calculatePromptHash(userPrompt: string): string {
  const normalizedPrompt = userPrompt?.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalizedPrompt).digest("hex");
}
