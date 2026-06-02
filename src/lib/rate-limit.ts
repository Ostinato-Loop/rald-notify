// RALD Notify — Rate Limiting (Cloudflare KV) — LILCKY STUDIO LIMITED
import type { KVNamespace } from "../index";

export async function checkRateLimit(
  kv: KVNamespace | undefined,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!kv) return { allowed: true, remaining: limit, resetAt: 0 };
  try {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
    const kvKey = `ratelimit:${key}:${windowStart}`;
    const current = parseInt((await kv.get(kvKey)) ?? "0", 10);
    if (current >= limit) {
      return { allowed: false, remaining: 0, resetAt: windowStart + windowSeconds };
    }
    await kv.put(kvKey, String(current + 1), { expirationTtl: windowSeconds + 60 });
    return { allowed: true, remaining: limit - current - 1, resetAt: windowStart + windowSeconds };
  } catch {
    return { allowed: true, remaining: limit, resetAt: 0 };
  }
}
