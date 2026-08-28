import { describe, expect, it } from "vitest";
import { monitorSemanaB } from "./dupla";

describe("monitorSemanaB", () => {
  it("retorna o outro monitor quando a dupla tem 2", () => {
    const monitores = [{ id: "m1" }, { id: "m2" }];
    expect(monitorSemanaB(monitores, "m1")).toEqual({ id: "m2" });
  });

  it("retorna o próprio monitor quando a dupla só tem 1 (chefe sem parceiro)", () => {
    const monitores = [{ id: "m1" }];
    expect(monitorSemanaB(monitores, "m1")).toEqual({ id: "m1" });
  });

  it("retorna null quando monitorSemanaAId é null", () => {
    const monitores = [{ id: "m1" }, { id: "m2" }];
    expect(monitorSemanaB(monitores, null)).toBeNull();
  });

  it("retorna null quando a dupla não tem nenhum monitor", () => {
    expect(monitorSemanaB([], "m1")).toBeNull();
  });
});
