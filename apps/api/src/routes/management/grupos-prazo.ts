import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { requireChief } from "../../auth/require-chief.js";
import { type IdParams, parseText } from "../../http/input.js";

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
}
