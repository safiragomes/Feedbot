import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/client.js";
import { buildApp } from "../../src/app.js";
import { hashPassword, hashToken, newSessionToken } from "../../src/auth/password.js";

describe("Gestão de grupos de prazo", () => {
  const sufixo = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const app = buildApp({ prisma });
  const token = newSessionToken();
  let periodoId: string | undefined;

  beforeAll(async () => {
    const periodo = await prisma.periodo.create({
      data: {
        nome: `Teste grupos de prazo ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    periodoId = periodo.id;
    const chefe = await prisma.monitor.create({
      data: { nome: "Chefe teste grupos de prazo", isChefe: true, periodoId },
    });
    const conta = await prisma.contaChefe.create({
      data: {
        monitorId: chefe.id,
        email: `chefe-grupos-prazo-${sufixo}@teste.dev`,
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
  });

  afterAll(async () => {
    await app.close();
    if (!periodoId) return;
    await prisma.aluno.deleteMany({ where: { turma: { periodoId } } });
    await prisma.grupoPrazo.deleteMany({ where: { periodoId } });
    await prisma.lista.deleteMany({ where: { periodoId } });
    await prisma.turma.deleteMany({ where: { periodoId } });
    await prisma.contaChefe.deleteMany({ where: { monitor: { periodoId } } });
    await prisma.monitor.deleteMany({ where: { periodoId } });
    await prisma.periodo.delete({ where: { id: periodoId } });
  });

  it("POST /grupos-prazo cria um grupo com nome único no período", async () => {
    const resposta = await app.inject({
      method: "POST",
      url: "/grupos-prazo",
      headers: { authorization: `Bearer ${token}` },
      payload: { periodoId, nome: "Rematrícula" },
    });

    expect(resposta.statusCode).toBe(201);
    const grupo = resposta.json() as { id: string; nome: string; periodoId: string };
    expect(grupo).toMatchObject({ id: expect.any(String), nome: "Rematrícula", periodoId });
    expect(await prisma.grupoPrazo.findUnique({ where: { id: grupo.id } })).toMatchObject({
      nome: "Rematrícula",
      periodoId,
    });
  });

  it("POST /grupos-prazo rejeita nome duplicado no mesmo período sem criar outro grupo", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Nome já utilizado" },
    });
    const resposta = await app.inject({
      method: "POST",
      url: "/grupos-prazo",
      headers: { authorization: `Bearer ${token}` },
      payload: { periodoId, nome: grupo.nome },
    });

    expect(resposta.statusCode).toBe(409);
    expect(await prisma.grupoPrazo.findMany({ where: { periodoId, nome: grupo.nome } })).toEqual([
      grupo,
    ]);
  });

  it("PATCH /grupos-prazo/:id renomeia o grupo para um nome disponível", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Nome anterior" },
    });
    const resposta = await app.inject({
      method: "PATCH",
      url: `/grupos-prazo/${grupo.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: "Nome atualizado" },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ id: grupo.id, nome: "Nome atualizado", periodoId });
    expect(await prisma.grupoPrazo.findUnique({ where: { id: grupo.id } })).toMatchObject({
      nome: "Nome atualizado",
      periodoId,
    });
  });

  it("PATCH /grupos-prazo/:id rejeita nome de outro grupo do período e preserva o nome anterior", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Nome preservado" },
    });
    const outroGrupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Nome ocupado" },
    });
    const resposta = await app.inject({
      method: "PATCH",
      url: `/grupos-prazo/${grupo.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: outroGrupo.nome },
    });

    expect(resposta.statusCode).toBe(409);
    expect(await prisma.grupoPrazo.findUnique({ where: { id: grupo.id } })).toEqual(grupo);
    expect(await prisma.grupoPrazo.findUnique({ where: { id: outroGrupo.id } })).toEqual(
      outroGrupo,
    );
  });

  it("DELETE /grupos-prazo/:id remove o grupo e seus prazos, preservando o aluno sem vínculo", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Grupo a excluir" },
    });
    const turma = await prisma.turma.create({
      data: { periodoId: periodoId!, nome: "Turma teste", nomeAbaPlanilha: "Turma teste" },
    });
    const aluno = await prisma.aluno.create({
      data: {
        nome: "Aluno teste",
        matricula: `GRUPO-PRAZO-${sufixo}`,
        turmaId: turma.id,
        grupoPrazoId: grupo.id,
      },
    });
    const lista = await prisma.lista.create({
      data: { periodoId: periodoId!, nome: "Lista teste", qtdQuestoesTotal: 6, ordem: 1 },
    });
    await prisma.prazoGrupoLista.create({
      data: {
        grupoPrazoId: grupo.id,
        listaId: lista.id,
        prazoEntregaFeedback: new Date("2026-09-20T23:59:00Z"),
      },
    });
    const resposta = await app.inject({
      method: "DELETE",
      url: `/grupos-prazo/${grupo.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.statusCode).toBe(204);
    expect(await prisma.grupoPrazo.findUnique({ where: { id: grupo.id } })).toBeNull();
    expect(await prisma.prazoGrupoLista.count({ where: { grupoPrazoId: grupo.id } })).toBe(0);
    expect(await prisma.aluno.findUnique({ where: { id: aluno.id } })).toMatchObject({
      id: aluno.id,
      nome: aluno.nome,
      matricula: aluno.matricula,
      turmaId: turma.id,
      grupoPrazoId: null,
    });
  });
  it("GET de prazos lista configurações e ausência de prazo no período do grupo", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Consulta de prazos" },
    });
    const lista = await prisma.lista.create({
      data: { periodoId: periodoId!, nome: "Lista com prazo", qtdQuestoesTotal: 6, ordem: 2 },
    });
    await prisma.prazoGrupoLista.create({
      data: {
        grupoPrazoId: grupo.id,
        listaId: lista.id,
        prazoEntregaFeedback: new Date("2026-09-20T00:00:00Z"),
      },
    });
    const resposta = await app.inject({
      method: "GET",
      url: `/grupos-prazo/${grupo.id}/prazos-lista`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resposta.statusCode).toBe(200);
    const listas = await prisma.lista.findMany({ where: { periodoId }, orderBy: { ordem: "asc" } });
    expect(resposta.json()).toEqual(
      listas.map((item) => ({
        listaId: item.id,
        listaNome: item.nome,
        ordem: item.ordem,
        qtdQuestoesTotal: item.qtdQuestoesTotal,
        prazoEntregaFeedback: item.id === lista.id ? "2026-09-20T00:00:00.000Z" : null,
      })),
    );
  });

  it("PUT de prazos configura e atualiza o mesmo par sem duplicar", async () => {
    const grupo = await prisma.grupoPrazo.create({
      data: { periodoId: periodoId!, nome: "Atualização de prazos" },
    });
    const lista = await prisma.lista.create({
      data: { periodoId: periodoId!, nome: "Lista para atualizar", qtdQuestoesTotal: 6, ordem: 3 },
    });
    for (const data of ["2026-09-20T00:00:00.000Z", "2026-09-25T00:00:00.000Z"]) {
      const resposta = await app.inject({
        method: "PUT",
        url: `/grupos-prazo/${grupo.id}/prazos-lista`,
        headers: { authorization: `Bearer ${token}` },
        payload: { prazos: [{ listaId: lista.id, prazoEntregaFeedback: data }] },
      });
      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toEqual({ atualizados: 1 });
      const prazos = await prisma.prazoGrupoLista.findMany({ where: { grupoPrazoId: grupo.id } });
      expect(prazos).toHaveLength(1);
      expect(prazos[0]?.prazoEntregaFeedback.toISOString()).toBe(data);
    }
  });

  it("PUT de prazos rejeita lista de outro período sem configurar nenhum prazo", async () => {
    const outroPeriodo = await prisma.periodo.create({
      data: {
        nome: `Outro período prazos ${sufixo}`,
        dataInicio: new Date("2026-08-03T00:00:00Z"),
        dataFim: new Date("2026-12-01T00:00:00Z"),
        dataReferenciaRodizio: new Date("2026-08-03T00:00:00Z"),
      },
    });
    try {
      const grupo = await prisma.grupoPrazo.create({
        data: { periodoId: periodoId!, nome: "Prazos rejeitados" },
      });
      const lista = await prisma.lista.create({
        data: {
          periodoId: outroPeriodo.id,
          nome: "Lista de outro período",
          qtdQuestoesTotal: 6,
          ordem: 1,
        },
      });
      const resposta = await app.inject({
        method: "PUT",
        url: `/grupos-prazo/${grupo.id}/prazos-lista`,
        headers: { authorization: `Bearer ${token}` },
        payload: { prazos: [{ listaId: lista.id, prazoEntregaFeedback: "2026-09-20T00:00:00Z" }] },
      });
      expect(resposta.statusCode).toBe(400);
      expect(await prisma.prazoGrupoLista.count({ where: { grupoPrazoId: grupo.id } })).toBe(0);
    } finally {
      await prisma.periodo.delete({ where: { id: outroPeriodo.id } });
    }
  });
});
