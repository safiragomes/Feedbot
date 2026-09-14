import { describe, expect, it } from "vitest";
import { parseCsvAlunos } from "../../src/application/alunos/alunos-service.js";

describe("parseCsvAlunos", () => {
  it("converte um CSV válido sem depender da camada HTTP ou do banco", () => {
    const [aluno] = parseCsvAlunos(
      'nome,matricula,turmaId,duplaId,isPcd,qtdQuestoesMeta\n"Silva, Ana",2026001,turma-1,dupla-1,sim,8',
    );

    expect(aluno).toEqual({
      nome: "Silva, Ana",
      matricula: "2026001",
      turmaId: "turma-1",
      duplaId: "dupla-1",
      isPcd: true,
      qtdQuestoesMeta: 8,
    });
  });

  it("recusa colunas obrigatórias ausentes", () => {
    expect(() => parseCsvAlunos("nome,matricula\nAna,2026001")).toThrow(
      "CSV requer a coluna turmaid",
    );
  });

  it("recusa aspas não fechadas", () => {
    expect(() =>
      parseCsvAlunos('nome,matricula,turmaId,duplaId\n"Ana,2026001,turma-1,dupla-1'),
    ).toThrow("CSV possui aspas não fechadas");
  });
});
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { vi } from "vitest";
import { atribuirAlunosAGrupoPrazo } from "../../src/application/alunos/alunos-service.js";

function prepararGrupoPrazo() {
  const banco = {
    grupoPrazo: {
      findUnique: vi.fn().mockResolvedValue({ id: "grupo-1", periodoId: "periodo-1" }),
    },
    aluno: {
      findMany: vi.fn().mockResolvedValue([
        { id: "aluno-1", grupoPrazoId: null as string | null, turma: { periodoId: "periodo-1" } },
        { id: "aluno-2", grupoPrazoId: null as string | null, turma: { periodoId: "periodo-1" } },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
  return { banco, prisma: banco as unknown as PrismaClient };
}

describe("atribuirAlunosAGrupoPrazo", () => {
  it("atribui o lote do mesmo período e informa quantos alunos foram atualizados", async () => {
    const { banco, prisma } = prepararGrupoPrazo();

    await expect(
      atribuirAlunosAGrupoPrazo(prisma, ["aluno-1", "aluno-2"], "grupo-1"),
    ).resolves.toBe(2);
    expect(banco.grupoPrazo.findUnique).toHaveBeenCalledWith({ where: { id: "grupo-1" } });
    expect(banco.aluno.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["aluno-1", "aluno-2"] } },
      include: { turma: true },
    });
    expect(banco.aluno.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["aluno-1", "aluno-2"] } },
      data: { grupoPrazoId: "grupo-1" },
    });
  });

  it("recusa o lote inteiro quando um aluno pertence a outro período", async () => {
    const { banco, prisma } = prepararGrupoPrazo();
    banco.aluno.findMany.mockResolvedValue([
      { id: "aluno-1", grupoPrazoId: null as string | null, turma: { periodoId: "periodo-1" } },
      { id: "aluno-2", grupoPrazoId: null, turma: { periodoId: "periodo-2" } },
    ]);

    await expect(
      atribuirAlunosAGrupoPrazo(prisma, ["aluno-1", "aluno-2"], "grupo-1"),
    ).rejects.toThrow(/mesmo período/);
    expect(banco.aluno.updateMany).not.toHaveBeenCalled();
  });

  it("substitui o grupo anterior pelo novo grupo", async () => {
    const { banco, prisma } = prepararGrupoPrazo();
    banco.aluno.findMany.mockResolvedValue([
      { id: "aluno-1", grupoPrazoId: "grupo-anterior", turma: { periodoId: "periodo-1" } },
    ]);
    banco.aluno.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      atribuirAlunosAGrupoPrazo(prisma, ["aluno-1"], "grupo-1"),
    ).resolves.toBe(1);
    expect(banco.aluno.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["aluno-1"] } },
      data: { grupoPrazoId: "grupo-1" },
    });
  });

  it("desvincula o lote com null sem exigir compatibilidade de período", async () => {
    const { banco, prisma } = prepararGrupoPrazo();
    banco.aluno.findMany.mockResolvedValue([
      { id: "aluno-1", grupoPrazoId: "grupo-1", turma: { periodoId: "periodo-1" } },
      { id: "aluno-2", grupoPrazoId: "grupo-2", turma: { periodoId: "periodo-2" } },
    ]);

    await expect(
      atribuirAlunosAGrupoPrazo(prisma, ["aluno-1", "aluno-2"], null),
    ).resolves.toBe(2);
    expect(banco.grupoPrazo.findUnique).not.toHaveBeenCalled();
    expect(banco.aluno.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["aluno-1", "aluno-2"] } },
      data: { grupoPrazoId: null },
    });
  });

  it.each(["grupo-1", null])(
    "recusa alunos inexistentes sem atualizar o lote com destino %s",
    async (grupoPrazoId) => {
      const { banco, prisma } = prepararGrupoPrazo();
      banco.aluno.findMany.mockResolvedValue([
        { id: "aluno-1", grupoPrazoId: null as string | null, turma: { periodoId: "periodo-1" } },
      ]);

      await expect(
        atribuirAlunosAGrupoPrazo(prisma, ["aluno-1", "aluno-inexistente"], grupoPrazoId),
      ).rejects.toThrow(/alunos não foram encontrados/);
      expect(banco.aluno.updateMany).not.toHaveBeenCalled();
    },
  );
});
