const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bpa-[A-Za-z0-9_-]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
];
const KEY_FIELD = /("(?:apiKey|api_key|token|secret)"\s*:\s*")[^"]+(")/gi;

export function redactSecrets(chunk: string): string {
  let out = chunk;
  for (const p of PATTERNS) out = out.replace(p, "[redacted]");
  return out.replace(KEY_FIELD, "$1[redacted]$2");
}
