import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireChief } from "../auth/require-chief.js";
import { criarFeedback, type NovoFeedback } from "../services/feedback.js";
import { GoogleSheetsSync } from "../services/google-sheets.js";

export function feedbackRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  sheets: GoogleSheetsSync,
) {
  const protectedRoute = { preHandler: requireChief(prisma) };

  app.get("/feedbacks", protectedRoute, async (request) => {
    const query = request.query as { periodoId?: string; sincronizado?: string };
    return prisma.feedback.findMany({
      where: {
        ...(query.periodoId ? { lista: { periodoId: query.periodoId } } : {}),
        ...(query.sincronizado === "false" ? { sincronizadoPlanilha: false } : {}),
      },
      include: {
        aluno: { include: { turma: true } },
        monitor: true,
        lista: true,
        questoesIa: true,
        questoesPlagio: { include: { alunoEnvolvido: true } },
        questoesProibicao: true,
      },
      orderBy: { criadoEm: "desc" },
    });
  });

  app.post("/feedbacks", protectedRoute, async (request, reply) => {
    try {
      const feedback = await criarFeedback(prisma, request.body as NovoFeedback);
      return reply.code(201).send(feedback);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Feedback inválido");
    }
  });

  app.post("/feedbacks/:id/reprocessar-planilha", protectedRoute, async (request, reply) => {
    try {
      return await sheets.sincronizarFeedback(prisma, (request.params as { id: string }).id, true);
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Falha ao sincronizar planilha",
      );
    }
  });
}
