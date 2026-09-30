import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";
import { NUM_LISTAS_POR_PERIODO, QTD_QUESTOES_PADRAO } from "../../src/domain/lista.js";

describe("Listas fixas por período e prazos por turma", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();

  let periodoIdAuth: string;
  let periodoId: string;
  let outroPeriodoId: string;
  let turmaId: string;
  let outraTurmaId: string;

  beforeAll(async () => {
    // Período à parte, só para hospedar o chefe usado na autenticação — a sessão de
    // chefe não é escopada a um período (requireChief só valida o token).
    const periodoAuth = await prisma.periodo.create({
      data: {
        nome: `Teste listas auth ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoIdAuth = periodoAuth.id;
    const chefeBootstrap = await prisma.monitor.create({
      data: {
        nome: "Chefe teste listas",
        whatsappNumero: `+55${sufixo}0`,
        isChefe: true,
        periodoId: periodoIdAuth,
      },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: chefeBootstrap.id,
        email: `chefe-listas-${sufixo}@teste.dev`,
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

    const response = await app.inject({
      method: "POST",
      url: "/periodos",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        nome: `Teste listas ${sufixo}`,
        dataInicio: "2026-08-03T00:00:00Z",
        dataFim: "2026-12-01T00:00:00Z",
        dataReferenciaRodizio: "2026-08-03T00:00:00Z",
      },
    });
    expect(response.statusCode).toBe(201);
    periodoId = (response.json() as { id: string }).id;

    const outroPeriodo = await prisma.periodo.create({
      data: {
        nome: `Teste listas outro periodo ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    outroPeriodoId = outroPeriodo.id;

    const turma = await prisma.turma.create({
      data: { periodoId, nome: "Turma A", nomeAbaPlanilha: "Turma A" },
    });
    turmaId = turma.id;
    const outraTurma = await prisma.turma.create({
      data: { periodoId, nome: "Turma B", nomeAbaPlanilha: "Turma B" },
    });
    outraTurmaId = outraTurma.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.prazoLista.deleteMany({ where: { turma: { periodoId } } });
    await prisma.lista.deleteMany({ where: { periodoId: { in: [periodoId, outroPeriodoId] } } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.periodo.deleteMany({ where: { id: { in: [periodoId, outroPeriodoId] } } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId: periodoIdAuth } } });
    await prisma.monitor.deleteMany({ where: { periodoId: periodoIdAuth } });
    await prisma.periodo.delete({ where: { id: periodoIdAuth } });
  });

  it("POST /periodos cria automaticamente as 6 listas padrão, em ordem", async () => {
    const listas = await prisma.lista.findMany({ where: { periodoId }, orderBy: { ordem: "asc" } });
    expect(listas).toHaveLength(NUM_LISTAS_POR_PERIODO);
    expect(listas.map((l) => l.ordem)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(listas.every((l) => l.qtdQuestoesTotal === QTD_QUESTOES_PADRAO)).toBe(true);
  });

  it("POST /periodos cria automaticamente as três turmas fixas", async () => {
    const turmas = await prisma.turma.findMany({ where: { periodoId }, orderBy: { nome: "asc" } });
    const fixas = turmas.filter((t) => ["CC/IA", "EC", "SI"].includes(t.nome));
    expect(fixas.map((t) => t.nome)).toEqual(["CC/IA", "EC", "SI"]);
    expect(fixas.every((t) => t.nomeAbaPlanilha === t.nome)).toBe(true);
  });

  it("PATCH /listas/:id rejeita mudança de ordem", async () => {
    const lista = await prisma.lista.findFirstOrThrow({ where: { periodoId, ordem: 1 } });
    const response = await app.inject({
      method: "PATCH",
      url: `/listas/${lista.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ordem: 2 },
    });
    expect(response.statusCode).toBe(400);
    const inalterada = await prisma.lista.findUniqueOrThrow({ where: { id: lista.id } });
    expect(inalterada.ordem).toBe(1);
  });

  it("PATCH /listas/:id continua editando nome e quantidade de questões", async () => {
    const lista = await prisma.lista.findFirstOrThrow({ where: { periodoId, ordem: 2 } });
    const response = await app.inject({
      method: "PATCH",
      url: `/listas/${lista.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: "Lista 2 renomeada", qtdQuestoesTotal: 8 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { nome: string; qtdQuestoesTotal: number };
    expect(body.nome).toBe("Lista 2 renomeada");
    expect(body.qtdQuestoesTotal).toBe(8);
  });

  it("GET /prazos-lista retorna null para pares lista×turma ainda não configurados", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/prazos-lista?turmaId=${turmaId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const itens = response.json() as { listaId: string; prazoEntregaFeedback: string | null }[];
    expect(itens).toHaveLength(NUM_LISTAS_POR_PERIODO);
    expect(itens.every((item) => item.prazoEntregaFeedback === null)).toBe(true);
  });

  it("PUT /prazos-lista faz upsert e permite prazos diferentes por turma", async () => {
    const listas = await prisma.lista.findMany({ where: { periodoId }, orderBy: { ordem: "asc" } });
    const primeira = listas[0]!;

    const criar = await app.inject({
      method: "PUT",
      url: "/prazos-lista",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        turmaId,
        prazos: [{ listaId: primeira.id, prazoEntregaFeedback: "2026-09-01T00:00:00Z" }],
      },
    });
    expect(criar.statusCode).toBe(200);

    const atualizar = await app.inject({
      method: "PUT",
      url: "/prazos-lista",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        turmaId,
        prazos: [{ listaId: primeira.id, prazoEntregaFeedback: "2026-09-08T00:00:00Z" }],
      },
    });
    expect(atualizar.statusCode).toBe(200);

    const outraTurmaResp = await app.inject({
      method: "PUT",
      url: "/prazos-lista",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        turmaId: outraTurmaId,
        prazos: [{ listaId: primeira.id, prazoEntregaFeedback: "2026-09-15T00:00:00Z" }],
      },
    });
    expect(outraTurmaResp.statusCode).toBe(200);

    const [prazoTurma, prazoOutraTurma] = await Promise.all([
      prisma.prazoLista.findUniqueOrThrow({
        where: { listaId_turmaId: { listaId: primeira.id, turmaId } },
      }),
      prisma.prazoLista.findUniqueOrThrow({
        where: { listaId_turmaId: { listaId: primeira.id, turmaId: outraTurmaId } },
      }),
    ]);
    expect(prazoTurma.prazoEntregaFeedback.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(prazoOutraTurma.prazoEntregaFeedback.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("PUT /prazos-lista rejeita lista de outro período", async () => {
    const listaDeOutroPeriodo = await prisma.lista.create({
      data: {
        periodoId: outroPeriodoId,
        nome: "Lista de outro período",
        qtdQuestoesTotal: 6,
        ordem: 1,
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: "/prazos-lista",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        turmaId,
        prazos: [{ listaId: listaDeOutroPeriodo.id, prazoEntregaFeedback: "2026-09-01T00:00:00Z" }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("PUT /prazos-lista rejeita turma inexistente", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/prazos-lista",
      headers: { authorization: `Bearer ${token}` },
      payload: { turmaId: "turma-inexistente", prazos: [] },
    });
    expect(response.statusCode).toBe(404);
  });

  it("GET /listas retorna o prazo configurado por grupo de prazo", async () => {
    const lista = await prisma.lista.findFirstOrThrow({ where: { periodoId, ordem: 3 } });
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId, nome: `Grupo de prazo ${sufixo}` },
    });
    await prisma.prazoGrupoLista.create({
      data: {
        listaId: lista.id,
        grupoPrazoId: grupo.id,
        prazoEntregaFeedback: new Date("2026-09-20T00:00:00Z"),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/listas?periodoId=${periodoId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const listas = response.json() as {
      id: string;
      prazosGrupo: { grupoPrazoId: string; prazoEntregaFeedback: string }[];
    }[];
    const listaRetornada = listas.find((l) => l.id === lista.id);
    expect(listaRetornada?.prazosGrupo).toHaveLength(1);
    expect(listaRetornada?.prazosGrupo[0]).toMatchObject({
      grupoPrazoId: grupo.id,
      prazoEntregaFeedback: "2026-09-20T00:00:00.000Z",
    });

    await prisma.prazoGrupoLista.deleteMany({ where: { grupoPrazoId: grupo.id } });
    await prisma.grupoPrazo.delete({ where: { id: grupo.id } });
  });

  it("GET /listas retorna prazosGrupo vazio quando nenhum grupo tem prazo configurado", async () => {
    const lista = await prisma.lista.findFirstOrThrow({ where: { periodoId, ordem: 4 } });

    const response = await app.inject({
      method: "GET",
      url: `/listas?periodoId=${periodoId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const listas = response.json() as { id: string; prazosGrupo: unknown[] }[];
    const listaRetornada = listas.find((l) => l.id === lista.id);
    expect(listaRetornada?.prazosGrupo).toEqual([]);
  });

  it("GET /listas retorna o prazo de cada grupo separadamente quando mais de um grupo configura a mesma lista", async () => {
    const lista = await prisma.lista.findFirstOrThrow({ where: { periodoId, ordem: 5 } });
    const [grupoA, grupoB] = await Promise.all([
      prisma.grupoPrazo.create({ data: { periodoId, nome: `Grupo A ${sufixo}` } }),
      prisma.grupoPrazo.create({ data: { periodoId, nome: `Grupo B ${sufixo}` } }),
    ]);
    await Promise.all([
      prisma.prazoGrupoLista.create({
        data: {
          listaId: lista.id,
          grupoPrazoId: grupoA.id,
          prazoEntregaFeedback: new Date("2026-09-21T00:00:00Z"),
        },
      }),
      prisma.prazoGrupoLista.create({
        data: {
          listaId: lista.id,
          grupoPrazoId: grupoB.id,
          prazoEntregaFeedback: new Date("2026-09-22T00:00:00Z"),
        },
      }),
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/listas?periodoId=${periodoId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const listas = response.json() as {
      id: string;
      prazosGrupo: { grupoPrazoId: string; prazoEntregaFeedback: string }[];
    }[];
    const listaRetornada = listas.find((l) => l.id === lista.id);
    expect(listaRetornada?.prazosGrupo).toHaveLength(2);
    expect(listaRetornada?.prazosGrupo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grupoPrazoId: grupoA.id,
          prazoEntregaFeedback: "2026-09-21T00:00:00.000Z",
        }),
        expect.objectContaining({
          grupoPrazoId: grupoB.id,
          prazoEntregaFeedback: "2026-09-22T00:00:00.000Z",
        }),
      ]),
    );

    await prisma.prazoGrupoLista.deleteMany({
      where: { grupoPrazoId: { in: [grupoA.id, grupoB.id] } },
    });
    await prisma.grupoPrazo.deleteMany({ where: { id: { in: [grupoA.id, grupoB.id] } } });
  });
});
