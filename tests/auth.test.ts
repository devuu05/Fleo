import { describe, expect, it } from "vitest";
import { memoryDb } from "../src/db";
import { isEmail, safeNext } from "../src/lib/auth/config";
import { setPremium, upsertUser } from "../src/lib/auth/users";

describe("safeNext (open-redirect guard)", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNext("/deals?x=1")).toBe("/deals?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad as string)).toBe("/");
    }
  });
});

describe("isEmail", () => {
  it("accepts normal addresses, rejects junk", () => {
    expect(isEmail("a@b.co")).toBe(true);
    for (const bad of ["", "a@b", "a b@c.com", "@x.com", 5, "a@b.c".padEnd(300, "x")]) expect(isEmail(bad)).toBe(false);
  });
});

describe("upsertUser", () => {
  it("creates once, normalises email, links authId, never changes premium", async () => {
    const db = await memoryDb();
    const a = await upsertUser(db, { email: "  Riya@Example.com " });
    expect(a.email).toBe("riya@example.com");
    expect(a.isPremium).toBe(false);
    await setPremium(db, a.id, true);
    const b = await upsertUser(db, { email: "riya@example.com", authId: "uuid-1" });
    expect(b.id).toBe(a.id);
    expect(b.authId).toBe("uuid-1");
    expect(b.isPremium).toBe(true); // login must not reset a paid user
    const c = await upsertUser(db, { email: "riya@example.com" });
    expect(c.authId).toBe("uuid-1"); // dev-style login doesn't unlink
  });
});
