import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";

describe("POST /alunos", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const telefoneTeste = `+5581${Number.parseInt(randomUUID().slice(0, 8), 16)
    .toString()
    .padStart(10, "0")
    .slice(0, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();

  let periodoId: string;
  let turmaId: string;
  let duplaId: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste alunos ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;

    const turma = await prisma.turma.create({
      data: { periodoId, nome: "Turma teste", nomeAbaPlanilha: "Turma teste" },
    });
    turmaId = turma.id;

    const chefe = await prisma.monitor.create({
      data: { nome: "Chefe teste", whatsappNumero: telefoneTeste, isChefe: true, periodoId },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: chefe.id,
        email: `chefe-${sufixo}@teste.dev`,
        senhaHash: await hashPassword("senha-de-teste-1234"),
      },
    });
    await prisma.sessaoChefe.create({
      data: {
        contaChefeId: conta.id,
        tokenHash: await hashToken(token),
        expiraEm: new Date(Date.now() + 60_000),
      },
    });

    const grupo = await prisma.grupoRevisao.create({
      data: { periodoId, chefeId: chefe.id, nome: "Grupo teste" },
    });
    const dupla = await prisma.dupla.create({
      data: { grupoRevisaoId: grupo.id, label: "Dupla 1" },
    });
    duplaId = dupla.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.aluno.deleteMany({ where: { turmaId } });
    await prisma.grupoPrazo.deleteMany({ where: { periodoId } });
    await prisma.dupla.deleteMany({ where: { grupoRevisao: { periodoId } } });
    await prisma.grupoRevisao.deleteMany({ where: { periodoId } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("atribui alunos ao grupo de prazo em lote", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId, nome: "Atribuição em lote" },
    });
    const alunos = await Promise.all(
      [1, 2].map((numero) =>
        prisma.aluno.create({
          data: {
            nome: `Aluno grupo ${numero}`,
            matricula: `ATRIBUIR-${sufixo}-${numero}`,
            turmaId,
          },
        }),
      ),
    );
    const resposta = await app.inject({
      method: "PATCH",
      url: "/alunos/atribuir-grupo-prazo",
      headers: { authorization: `Bearer ${token}` },
      payload: { alunoIds: alunos.map((aluno) => aluno.id), grupoPrazoId: grupo.id },
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ atualizados: 2 });
    expect(
      await prisma.aluno.count({
        where: { id: { in: alunos.map((aluno) => aluno.id) }, grupoPrazoId: grupo.id },
      }),
    ).toBe(2);
  });

  it("recusa atribuição ao grupo de outro período sem atualizar os alunos", async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Outro período grupo ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    try {
      const grupo = await prisma.grupoPrazo.create({
        data: { periodoId: periodo.id, nome: "Outro período" },
      });
      const aluno = await prisma.aluno.create({
        data: { nome: "Aluno período diferente", matricula: `PERIODO-${sufixo}`, turmaId },
      });
      const resposta = await app.inject({
        method: "PATCH",
        url: "/alunos/atribuir-grupo-prazo",
        headers: { authorization: `Bearer ${token}` },
        payload: { alunoIds: [aluno.id], grupoPrazoId: grupo.id },
      });
      expect(resposta.statusCode).toBe(400);
      expect(
        (await prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })).grupoPrazoId,
      ).toBeNull();
    } finally {
      await prisma.grupoPrazo.deleteMany({ where: { periodoId: periodo.id } });
      await prisma.periodo.delete({ where: { id: periodo.id } });
    }
  });

  it("desvincula alunos em lote com grupoPrazoId null preservando o grupo e os demais alunos", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId, nome: "Desvinculação em lote" },
    });
    const alunos = await Promise.all(
      [1, 2, 3].map((numero) =>
        prisma.aluno.create({
          data: {
            nome: `Aluno desvincular ${numero}`,
            matricula: `DESVINCULAR-${sufixo}-${numero}`,
            turmaId,
            grupoPrazoId: grupo.id,
          },
        }),
      ),
    );
    const ids = alunos.slice(0, 2).map((aluno) => aluno.id);
    const resposta = await app.inject({
      method: "PATCH",
      url: "/alunos/atribuir-grupo-prazo",
      headers: { authorization: `Bearer ${token}` },
      payload: { alunoIds: ids, grupoPrazoId: null },
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ atualizados: 2 });
    expect(await prisma.aluno.count({ where: { id: { in: ids }, grupoPrazoId: null } })).toBe(2);
    expect(await prisma.aluno.count({ where: { grupoPrazoId: grupo.id } })).toBe(1);
    expect(await prisma.grupoPrazo.findUnique({ where: { id: grupo.id } })).not.toBeNull();
  });

  it("GET /alunos filtra somente alunos do grupo de prazo solicitado", async () => {
    const grupo = await prisma.grupoPrazo.create({ data: { periodoId, nome: "Filtro de grupo" } });
    await prisma.aluno.create({
      data: {
        nome: "Aluno filtrado",
        matricula: `FILTRO-${sufixo}`,
        turmaId,
        grupoPrazoId: grupo.id,
      },
    });
    await prisma.aluno.create({
      data: { nome: "Aluno fora do filtro", matricula: `FORA-FILTRO-${sufixo}`, turmaId },
    });
    const resposta = await app.inject({
      method: "GET",
      url: `/alunos?grupoPrazoId=${grupo.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resposta.statusCode).toBe(200);
    const alunos = resposta.json() as { grupoPrazoId: string | null }[];
    expect(alunos.length).toBe(1);
    expect(alunos.every((aluno) => aluno.grupoPrazoId === grupo.id)).toBe(true);
  });
  it("cria o aluno quando qtdQuestoesMeta é omitido (campo opcional)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/alunos",
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: "Aluno teste", matricula: `TESTE-${sufixo}`, turmaId, duplaId },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().qtdQuestoesMeta).toBeNull();
  });

  it("permite pré-cadastrar aluno sem dupla", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/alunos",
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: "Aluno sem dupla", matricula: `SEM-DUPLA-${sufixo}`, turmaId },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().duplaId).toBeNull();
  });

  it("vincula alunos existentes à dupla em lote", async () => {
    const alunos = await prisma.aluno.findMany({ where: { turmaId }, select: { id: true } });
    const response = await app.inject({
      method: "PATCH",
      url: "/alunos/atribuir-dupla",
      headers: { authorization: `Bearer ${token}` },
      payload: { alunoIds: alunos.map((aluno) => aluno.id), duplaId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ atualizados: alunos.length });
    expect(
      await prisma.aluno.count({ where: { id: { in: alunos.map((aluno) => aluno.id) }, duplaId } }),
    ).toBe(alunos.length);
  });

  it("desvincula o aluno sem excluir seu cadastro", async () => {
    const aluno = await prisma.aluno.findFirstOrThrow({ where: { turmaId, duplaId } });
    const response = await app.inject({
      method: "PATCH",
      url: `/alunos/${aluno.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { duplaId: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().duplaId).toBeNull();
    expect(await prisma.aluno.findUnique({ where: { id: aluno.id } })).toMatchObject({
      id: aluno.id,
      duplaId: null,
    });
  });

  it("continua recusando qtdQuestoesMeta explicitamente inválido", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/alunos",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        nome: "Outro aluno",
        matricula: `TESTE-${sufixo}-2`,
        turmaId,
        duplaId,
        qtdQuestoesMeta: -1,
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
