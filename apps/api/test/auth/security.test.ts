import { describe, expect, it } from "vitest";
import { hashToken } from "../../src/auth/password.js";

describe("proteção de tokens de sessão", () => {
  it("usa digest determinístico sem armazenar o token", async () => {
    const token = "token-aleatorio-com-alta-entropia";
    const digest = await hashToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(await hashToken(token)).toBe(digest);
  });
});
