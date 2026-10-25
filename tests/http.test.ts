import { describe, expect, it } from "vitest";
import { HttpError, RateLimiter, withBackoff } from "../src/lib/http";

describe("withBackoff", () => {
  it("retries 429/5xx then succeeds, honouring Retry-After", async () => {
    const waits: number[] = [];
    let calls = 0;
    const r = await withBackoff(async () => {
      if (++calls < 3) throw new HttpError(429, "slow down", 2000);
      return "ok";
    }, { retries: 5, sleep: async (ms) => void waits.push(ms) });
    expect(r).toBe("ok");
    expect(calls).toBe(3);
    expect(waits).toEqual([2000, 2000]);
  });
  it("does not retry 4xx client errors", async () => {
    let calls = 0;
    await expect(withBackoff(async () => { calls++; throw new HttpError(401, "bad token"); }, { retries: 5, sleep: async () => {} })).rejects.toThrow("bad token");
    expect(calls).toBe(1);
  });
  it("gives up after the retry budget", async () => {
    let calls = 0;
    await expect(withBackoff(async () => { calls++; throw new HttpError(503, "down"); }, { retries: 2, sleep: async () => {} })).rejects.toThrow("down");
    expect(calls).toBe(3);
  });
});

describe("RateLimiter", () => {
  it("spaces calls at the configured rate", async () => {
    let t = 0;
    const slept: number[] = [];
    const rl = new RateLimiter(2, () => t, async (ms) => { slept.push(ms); t += ms; });
    await rl.wait(); await rl.wait(); await rl.wait();
    expect(slept).toEqual([500, 500]);
  });
});
