import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";

describe("POST /alunos", () => {
  const sufixo = Date.now();
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
      data: { nome: "Chefe teste", whatsappNumero: `+55${sufixo}0`, isChefe: true, periodoId },
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
    await prisma.dupla.deleteMany({ where: { grupoRevisao: { periodoId } } });
    await prisma.grupoRevisao.deleteMany({ where: { periodoId } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
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
