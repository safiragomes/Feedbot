import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireChief } from "../auth/require-chief.js";
import {
  criarFeedback,
  resolverMonitorResponsavel,
  type NovoFeedback,
} from "../services/feedback.js";
import { GoogleSheetsSync } from "../services/google-sheets.js";
import { buscarPendenciasAtrasadas } from "../services/atrasos.js";

export function feedbackRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  sheets: GoogleSheetsSync,
) {
  const protectedRoute = { preHandler: requireChief(prisma) };

  app.get("/atrasos", protectedRoute, async (request) => {
    const periodoId = (request.query as { periodoId?: string }).periodoId;
    const pendencias = await buscarPendenciasAtrasadas(prisma);
    if (!periodoId) return pendencias;
    const listas = await prisma.lista.findMany({ where: { periodoId }, select: { id: true } });
    const ids = new Set(listas.map((l) => l.id));
    return pendencias.filter((p) => ids.has(p.listaId));
  });

  app.get("/feedbacks", protectedRoute, async (request) => {
    const query = request.query as { periodoId?: string; sincronizado?: string };
    const feedbacks = await prisma.feedback.findMany({
      where: {
        ...(query.periodoId ? { lista: { periodoId: query.periodoId } } : {}),
        ...(query.sincronizado === "false" ? { sincronizadoPlanilha: false } : {}),
      },
      include: {
        aluno: { include: { turma: true, prazosIndividuais: true } },
        monitor: true,
        lista: { include: { prazos: true } },
        questoesIa: true,
        questoesPlagio: { include: { alunoEnvolvido: true } },
        questoesProibicao: true,
      },
      orderBy: { criadoEm: "desc" },
    });
    return feedbacks.map(({ lista: { prazos, ...lista }, ...feedback }) => ({
      ...feedback,
      lista,
      prazoEntregaFeedback:
        feedback.aluno.prazosIndividuais
          .find((p) => p.listaId === lista.id)
          ?.prazoEntregaFeedback.toISOString() ??
        prazos
          .find((p) => p.turmaId === feedback.aluno.turmaId)
          ?.prazoEntregaFeedback.toISOString() ??
        null,
    }));
  });

  app.post("/feedbacks", protectedRoute, async (request, reply) => {
    try {
      const entrada = request.body as Omit<NovoFeedback, "monitorId">;
      const monitorId = await resolverMonitorResponsavel(
        prisma,
        entrada.alunoId,
        entrada.listaId,
        request.chefe!.monitorId,
      );
      const feedback = await criarFeedback(prisma, { ...entrada, monitorId });
      try {
        await sheets.sincronizarFeedback(prisma, feedback.id);
      } catch {
        // Feedback já está salvo; sincronização pode ser refeita depois pelo
        // botão de reprocessar planilha (mesmo padrão do bot em discord-bot.ts).
      }
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
