import { atualizarPrazosDoGrupo, GestaoErro } from "../../application/gestao/gestao-service.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { requireChief } from "../../auth/require-chief.js";
import { type IdParams, parseText, parseDate } from "../../http/input.js";

export function grupoPrazoRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const rotaProtegida = { preHandler: requireChief(prisma) };

  app.get("/grupos-prazo", rotaProtegida, async (request) =>
    prisma.grupoPrazo.findMany({
      where: { periodoId: parseText((request.query as Record<string, unknown>).periodoId) },
      orderBy: { nome: "asc" },
    }),
  );

  app.post("/grupos-prazo", rotaProtegida, async (request, reply) => {
    const corpo = request.body as Record<string, unknown>;
    const periodoId = parseText(corpo.periodoId);
    const nome = parseText(corpo.nome);
    if (!periodoId || !nome) return reply.badRequest("Período e nome são obrigatórios");
    return reply.code(201).send(await prisma.grupoPrazo.create({ data: { periodoId, nome } }));
  });

  app.patch("/grupos-prazo/:id", rotaProtegida, async (request, reply) => {
    const corpo = request.body as Record<string, unknown>;
    const nome = parseText(corpo.nome);
    if (!nome) return reply.badRequest("Nome do grupo de prazo inválido");
    return prisma.grupoPrazo.update({ where: request.params as IdParams, data: { nome } });
  });

  app.delete("/grupos-prazo/:id", rotaProtegida, async (request, reply) => {
    await prisma.grupoPrazo.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });
  app.get("/grupos-prazo/:id/prazos-lista", rotaProtegida, async (request, reply) => {
    const { id: grupoPrazoId } = request.params as IdParams;
    const grupo = await prisma.grupoPrazo.findUnique({ where: { id: grupoPrazoId } });
    if (!grupo) return reply.notFound("Grupo de prazo não encontrado");
    const listas = await prisma.lista.findMany({
      where: { periodoId: grupo.periodoId },
      orderBy: { ordem: "asc" },
      include: { prazosGrupo: { where: { grupoPrazoId } } },
    });
    return listas.map((lista) => ({
      listaId: lista.id,
      listaNome: lista.nome,
      ordem: lista.ordem,
      qtdQuestoesTotal: lista.qtdQuestoesTotal,
      prazoEntregaFeedback: lista.prazosGrupo[0]?.prazoEntregaFeedback.toISOString() ?? null,
    }));
  });

  app.put("/grupos-prazo/:id/prazos-lista", rotaProtegida, async (request, reply) => {
    const { id } = request.params as IdParams;
    const corpo = request.body as Record<string, unknown>;
    if (!Array.isArray(corpo.prazos)) return reply.badRequest("Prazos são obrigatórios");
    const prazos: { listaId: string; prazoEntregaFeedback: Date }[] = [];
    for (const item of corpo.prazos) {
      const listaId = parseText(item?.listaId);
      const prazoEntregaFeedback = parseDate(item?.prazoEntregaFeedback);
      if (!listaId || !prazoEntregaFeedback) return reply.badRequest("Item de prazo inválido");
      prazos.push({ listaId, prazoEntregaFeedback });
    }
    try {
      return { atualizados: await atualizarPrazosDoGrupo(prisma, id, prazos) };
    } catch (erro) {
      if (!(erro instanceof GestaoErro)) throw erro;
      if (erro.codigo === "NAO_ENCONTRADO") return reply.notFound(erro.message);
      return reply.badRequest(erro.message);
    }
  });
}
