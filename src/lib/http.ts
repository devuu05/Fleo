/** Spaces calls so we never exceed `rps` requests/second across all callers. */
export class RateLimiter {
  private next = 0;
  constructor(private rps: number, private now = () => Date.now(), private sleep = defaultSleep) {}
  async wait(): Promise<void> {
    const interval = 1000 / this.rps;
    const t = this.now();
    const at = Math.max(t, this.next);
    this.next = at + interval;
    if (at > t) await this.sleep(at - t);
  }
}

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
  }
}

const retryable = (s: number) => s === 429 || s >= 500;

/** Exponential backoff with jitter; honours Retry-After on 429/503. */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const { retries, baseMs = 500, maxMs = 30_000, sleep = defaultSleep } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0; // 0 = network error
      const canRetry = status === 0 || retryable(status);
      if (!canRetry || attempt >= retries) throw e;
      const exp = Math.min(maxMs, baseMs * 2 ** attempt);
      const wait = e instanceof HttpError && e.retryAfterMs ? e.retryAfterMs : exp / 2 + Math.random() * (exp / 2);
      await sleep(Math.min(wait, maxMs));
    }
  }
}
