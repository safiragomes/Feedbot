import { describe, expect, it } from "vitest";
import { monitorDaSemana, semanasCobertasPorMonitor } from "../../src/domain/monitorSemana.js";

describe("monitorDaSemana", () => {
  it("semana A é sempre o monitorSemanaAId, mesmo com outroMonitorId presente", () => {
    expect(monitorDaSemana({ monitorSemanaAId: "m1", outroMonitorId: "m2" }, "A")).toBe("m1");
  });

  it("semana B é o outroMonitorId quando a dupla tem 2 monitores", () => {
    expect(monitorDaSemana({ monitorSemanaAId: "m1", outroMonitorId: "m2" }, "B")).toBe("m2");
  });

  it("semana B cai para o próprio monitorSemanaAId quando a dupla é solo (sem outroMonitorId)", () => {
    expect(monitorDaSemana({ monitorSemanaAId: "m1", outroMonitorId: null }, "B")).toBe("m1");
  });

  it("nenhuma semana tem responsável quando monitorSemanaAId é nulo", () => {
    expect(monitorDaSemana({ monitorSemanaAId: null, outroMonitorId: null }, "A")).toBeNull();
    expect(monitorDaSemana({ monitorSemanaAId: null, outroMonitorId: null }, "B")).toBeNull();
  });
});

describe("semanasCobertasPorMonitor", () => {
  it("dupla com 2 monitores: cada um cobre só a própria letra", () => {
    const input = { monitorSemanaAId: "m1", outroMonitorId: "m2" };
    expect(semanasCobertasPorMonitor(input, "m1")).toEqual(new Set(["A"]));
    expect(semanasCobertasPorMonitor(input, "m2")).toEqual(new Set(["B"]));
  });

  it("dupla solo: o único monitor cobre A e B", () => {
    const input = { monitorSemanaAId: "m1", outroMonitorId: null };
    expect(semanasCobertasPorMonitor(input, "m1")).toEqual(new Set(["A", "B"]));
  });

  it("aluno sem monitorSemanaAId não é coberto por ninguém", () => {
    const input = { monitorSemanaAId: null, outroMonitorId: null };
    expect(semanasCobertasPorMonitor(input, "m1")).toEqual(new Set());
  });

  it("monitor que não é A nem o parceiro não cobre nenhuma semana", () => {
    const input = { monitorSemanaAId: "m1", outroMonitorId: "m2" };
    expect(semanasCobertasPorMonitor(input, "m3")).toEqual(new Set());
  });
});
