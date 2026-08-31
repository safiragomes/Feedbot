import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";

describe("Dupla de monitores e atribuição de monitor A por aluno", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();

  let periodoId: string;
  let grupoId: string;
  let chefeId: string;
  let duplaId: string;
  let outraDuplaId: string;
  let monitorAId: string;
  let monitorBId: string;
  let monitorForaId: string;
  let aluno1Id: string;
  let aluno2Id: string;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste duplas ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;

    const turma = await prisma.turma.create({
      data: { periodoId, nome: "Turma teste", nomeAbaPlanilha: "Turma teste" },
    });

    const chefe = await prisma.monitor.create({
      data: { nome: "Chefe teste", whatsappNumero: `+55${sufixo}0`, isChefe: true, periodoId },
    });
    chefeId = chefe.id;
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
    grupoId = grupo.id;

    const dupla = await prisma.dupla.create({
      data: { grupoRevisaoId: grupo.id, label: "Dupla 1" },
    });
    duplaId = dupla.id;
    const outraDupla = await prisma.dupla.create({
      data: { grupoRevisaoId: grupo.id, label: "Dupla 2" },
    });
    outraDuplaId = outraDupla.id;

    const monitorA = await prisma.monitor.create({
      data: { nome: "Monitor A", whatsappNumero: `+55${sufixo}1`, periodoId, duplaId },
    });
    monitorAId = monitorA.id;
    const monitorB = await prisma.monitor.create({
      data: { nome: "Monitor B", whatsappNumero: `+55${sufixo}2`, periodoId, duplaId },
    });
    monitorBId = monitorB.id;
    const monitorFora = await prisma.monitor.create({
      data: {
        nome: "Monitor de outra dupla",
        whatsappNumero: `+55${sufixo}3`,
        periodoId,
        duplaId: outraDuplaId,
      },
    });
    monitorForaId = monitorFora.id;

    const aluno1 = await prisma.aluno.create({
      data: { nome: "Aluno 1", matricula: `TESTE-${sufixo}-1`, turmaId: turma.id, duplaId },
    });
    aluno1Id = aluno1.id;
    const aluno2 = await prisma.aluno.create({
      data: { nome: "Aluno 2", matricula: `TESTE-${sufixo}-2`, turmaId: turma.id, duplaId },
    });
    aluno2Id = aluno2.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.aluno.deleteMany({ where: { duplaId: { in: [duplaId, outraDuplaId] } } });
    await prisma.monitor.updateMany({ where: { periodoId }, data: { duplaId: null } });
    await prisma.dupla.deleteMany({ where: { grupoRevisaoId: grupoId } });
    await prisma.grupoRevisao.deleteMany({ where: { periodoId } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("uma dupla não pode ter mais de 2 monitores", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/monitores",
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: "Terceiro monitor", whatsappNumero: `+55${sufixo}4`, periodoId, duplaId },
    });
    expect(response.statusCode).toBe(400);
  });

  it("um chefe não pode possuir dois grupos no mesmo período", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/grupos-revisao",
      headers: { authorization: `Bearer ${token}` },
      payload: { periodoId, chefeId, nome: "Segundo grupo do mesmo chefe" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe("Este chefe já possui um grupo neste período");
  });

  it("aluno só pode ter como monitor da semana A um monitor da própria dupla", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/alunos/${aluno1Id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monitorSemanaAId: monitorForaId },
    });
    expect(response.statusCode).toBe(400);
  });

  it("permite que alunos da mesma dupla tenham o papel A/B invertido entre si", async () => {
    const assign1 = await app.inject({
      method: "PATCH",
      url: `/alunos/${aluno1Id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monitorSemanaAId: monitorAId },
    });
    expect(assign1.statusCode).toBe(200);

    const assign2 = await app.inject({
      method: "PATCH",
      url: `/alunos/${aluno2Id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { monitorSemanaAId: monitorBId },
    });
    expect(assign2.statusCode).toBe(200);

    const [aluno1, aluno2] = await Promise.all([
      prisma.aluno.findUniqueOrThrow({ where: { id: aluno1Id } }),
      prisma.aluno.findUniqueOrThrow({ where: { id: aluno2Id } }),
    ]);
    // Mesma dupla, papéis A/B invertidos: aluno1 tem A e aluno2 tem B como semana A.
    expect(aluno1.monitorSemanaAId).toBe(monitorAId);
    expect(aluno2.monitorSemanaAId).toBe(monitorBId);
  });

  it("GET /duplas inclui os monitores da dupla", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/duplas",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const duplas = response.json() as Array<{ id: string; monitores: { id: string }[] }>;
    const dupla = duplas.find((item) => item.id === duplaId);
    expect(dupla?.monitores.map((m) => m.id).sort()).toEqual([monitorAId, monitorBId].sort());
  });

  it("PATCH /duplas/:id atualiza apenas o rótulo", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/duplas/${duplaId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { label: "Dupla renomeada" },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { label: string }).label).toBe("Dupla renomeada");
  });

  it("trocar a dupla do monitor limpa a escolha de monitor A dos alunos que dependiam dele", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/monitores/${monitorAId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { duplaId: null },
    });
    expect(response.statusCode).toBe(200);
    const aluno1 = await prisma.aluno.findUniqueOrThrow({ where: { id: aluno1Id } });
    expect(aluno1.monitorSemanaAId).toBeNull();
  });
});
