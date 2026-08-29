import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { requireChief } from "../auth/require-chief.js";
import { GoogleSheetsSync } from "../services/google-sheets.js";

export function planilhaRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  sheets: GoogleSheetsSync,
) {
  const protectedRoute = { preHandler: requireChief(prisma) };

  app.get("/planilha/configuracao", protectedRoute, async () => sheets.status(prisma));

  app.put("/periodos/:id/planilha", protectedRoute, async (request, reply) => {
    const periodoId = (request.params as { id: string }).id;
    const url = String((request.body as { url?: unknown }).url ?? "").trim();
    if (!url) return reply.badRequest("Informe o link da planilha");
    try {
      return await sheets.vincularPlanilha(prisma, periodoId, url);
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível validar a planilha",
      );
    }
  });

  app.delete("/periodos/:id/planilha", protectedRoute, async (request, reply) => {
    try {
      await sheets.desvincularPlanilha(prisma, (request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível desvincular a planilha",
      );
    }
  });

  app.get("/periodos/:id/planilha/alunos/previa", protectedRoute, async (request, reply) => {
    try {
      return await sheets.previsualizarImportacaoAlunos(
        prisma,
        (request.params as { id: string }).id,
      );
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível ler os alunos da planilha",
      );
    }
  });

  app.post("/periodos/:id/planilha/alunos/importar", protectedRoute, async (request, reply) => {
    const matriculasSelecionadas = (
      request.body as { matriculasSelecionadas?: unknown } | undefined
    )?.matriculasSelecionadas;
    if (
      !Array.isArray(matriculasSelecionadas) ||
      matriculasSelecionadas.length > 2_000 ||
      matriculasSelecionadas.some(
        (matricula) => typeof matricula !== "string" || !/^\d{11}$/.test(matricula),
      )
    )
      return reply.badRequest("Seleção de matrículas inválida");
    const selecaoUnica = [...new Set(matriculasSelecionadas as string[])];
    try {
      return await sheets.importarAlunosDaPlanilha(
        prisma,
        (request.params as { id: string }).id,
        selecaoUnica,
      );
    } catch (error) {
      return reply.badRequest(
        error instanceof Error ? error.message : "Não foi possível importar os alunos",
      );
    }
  });
}
