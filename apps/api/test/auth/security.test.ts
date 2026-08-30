import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashToken,
  newSessionToken,
  timingSafeEqualString,
  verifyPassword,
} from "../../src/auth/password.js";

describe("proteção de tokens de sessão", () => {
  it("usa digest determinístico sem armazenar o token", async () => {
    const token = "token-aleatorio-com-alta-entropia";
    const digest = await hashToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(await hashToken(token)).toBe(digest);
  });

  it("gera tokens de sessão independentes e com alta entropia", () => {
    const primeiro = newSessionToken();
    const segundo = newSessionToken();
    expect(primeiro).toHaveLength(43);
    expect(segundo).toHaveLength(43);
    expect(primeiro).not.toBe(segundo);
  });

  it("armazena senha com salt e rejeita senha diferente ou hash malformado", async () => {
    const senha = "senha-muito-segura-123";
    const primeiroHash = await hashPassword(senha);
    const segundoHash = await hashPassword(senha);
    expect(primeiroHash).not.toBe(segundoHash);
    expect(await verifyPassword(senha, primeiroHash)).toBe(true);
    expect(await verifyPassword("senha-incorreta", primeiroHash)).toBe(false);
    expect(await verifyPassword(senha, "hash-invalido")).toBe(false);
  });

  it("compara segredos sem aceitar comprimentos ou conteúdos diferentes", () => {
    expect(timingSafeEqualString("segredo", "segredo")).toBe(true);
    expect(timingSafeEqualString("segredo", "outrooo")).toBe(false);
    expect(timingSafeEqualString("curto", "muito-mais-longo")).toBe(false);
  });
});
