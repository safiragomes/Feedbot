import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireChief } from "../auth/require-chief.js";

export function privacyRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const protectedRoute = { preHandler: requireChief(prisma) };
  app.get("/privacidade/alunos/:id", protectedRoute, async (request, reply) => {
    const aluno = await prisma.aluno.findUnique({
      where: request.params as { id: string },
      include: {
        turma: true,
        dupla: true,
        feedbacks: {
          include: { lista: true, questoesIa: true, questoesPlagio: true, questoesProibicao: true },
        },
      },
    });
    return aluno ?? reply.notFound("Aluno não encontrado");
  });
  app.delete("/privacidade/alunos/:id", protectedRoute, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    await prisma.aluno.update({
      where: { id },
      data: {
        nome: `Aluno removido (${id.slice(-6)})`,
        matricula: `REMOVIDO-${id}`,
        isPcd: false,
        qtdQuestoesMeta: null,
      },
    });
    return reply.code(204).send();
  });
  app.get("/privacidade/monitores/:id", protectedRoute, async (request, reply) => {
    const monitor = await prisma.monitor.findUnique({
      where: request.params as { id: string },
      include: { dupla: true, feedbacksRegistrados: { include: { lista: true, aluno: true } } },
    });
    return monitor ?? reply.notFound("Monitor não encontrado");
  });
  app.delete("/privacidade/monitores/:id", protectedRoute, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    await prisma.$transaction(async (tx) => {
      await tx.contaChefe.deleteMany({ where: { monitorId: id } });
      await tx.monitor.update({
        where: { id },
        data: {
          nome: `Monitor removido (${id.slice(-6)})`,
          whatsappNumero: `REMOVIDO-${id}`,
          status: "INATIVO",
          duplaId: null,
        },
      });
    });
    return reply.code(204).send();
  });
}
