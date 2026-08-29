import { afterEach, describe, expect, it } from "vitest";
import { confiarNoProxy, webOrigins } from "../../src/config/runtime.js";

const originalOrigin = process.env["WEB_ORIGIN"];
const originalNodeEnv = process.env["NODE_ENV"];
const originalTrustProxy = process.env["TRUST_PROXY"];

describe.sequential("configuração segura de origem", () => {
  afterEach(() => {
    if (originalOrigin === undefined) delete process.env["WEB_ORIGIN"];
    else process.env["WEB_ORIGIN"] = originalOrigin;
    if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = originalNodeEnv;
    if (originalTrustProxy === undefined) delete process.env["TRUST_PROXY"];
    else process.env["TRUST_PROXY"] = originalTrustProxy;
  });

  it("normaliza uma lista explícita de origens", () => {
    process.env["WEB_ORIGIN"] = " http://localhost:5173,https://feedbot.example ";
    expect(webOrigins()).toEqual(["http://localhost:5173", "https://feedbot.example"]);
  });

  it("rejeita wildcard e URLs com caminho", () => {
    process.env["WEB_ORIGIN"] = "*";
    expect(() => webOrigins()).toThrow("WEB_ORIGIN inválida");
    process.env["WEB_ORIGIN"] = "https://feedbot.example/app";
    expect(() => webOrigins()).toThrow("não pode conter caminho");
  });

  it("exige HTTPS público em produção, preservando localhost", () => {
    process.env["NODE_ENV"] = "production";
    process.env["WEB_ORIGIN"] = "http://feedbot.example";
    expect(() => webOrigins()).toThrow("HTTPS em produção");
    process.env["WEB_ORIGIN"] = "http://localhost:5173";
    expect(webOrigins()).toEqual(["http://localhost:5173"]);
  });

  it("só confia em proxy quando configurado explicitamente", () => {
    process.env["TRUST_PROXY"] = "false";
    expect(confiarNoProxy()).toBe(false);
    process.env["TRUST_PROXY"] = "true";
    expect(confiarNoProxy()).toBe(true);
    process.env["TRUST_PROXY"] = "sim";
    expect(() => confiarNoProxy()).toThrow("true ou false");
    delete process.env["TRUST_PROXY"];
  });
});
