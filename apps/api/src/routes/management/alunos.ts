import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { requireChief } from "../../auth/require-chief.js";
import {
  atribuirAlunosADupla,
  AlunoComHistoricoErro,
  excluirAlunoSemHistorico,
  importarAlunos,
  validarMonitorSemanaA,
  validarVinculosAluno,
} from "../../application/alunos/alunos-service.js";
import {
  parseBoolean,
  parseDate,
  parseOptionalPositiveInteger,
  parseText,
  type IdParams,
} from "../../http/input.js";

export function alunoRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const protectedRoute = { preHandler: requireChief(prisma) };

  app.get("/alunos", protectedRoute, async (request) => {
    const query = request.query as Record<string, unknown>;
    const turmaId = parseText(query.turmaId);
    const duplaId = parseText(query.duplaId);
    return prisma.aluno.findMany({
      where: turmaId ? { turmaId } : duplaId ? { duplaId } : undefined,
      include: { turma: true, dupla: true, monitorSemanaA: true, prazosIndividuais: true },
      orderBy: { nome: "asc" },
    });
  });

  app.post("/alunos", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const nome = parseText(body.nome);
    const matricula = parseText(body.matricula);
    const turmaId = parseText(body.turmaId);
    const duplaId = body.duplaId == null ? null : (parseText(body.duplaId) ?? null);
    const qtdQuestoesMeta = parseOptionalPositiveInteger(body.qtdQuestoesMeta);
    const monitorSemanaAId =
      body.monitorSemanaAId === null ? null : parseText(body.monitorSemanaAId);
    if (!nome || !matricula || !turmaId || qtdQuestoesMeta === undefined)
      return reply.badRequest("Dados do aluno inválidos");
    try {
      await validarVinculosAluno(prisma, turmaId, duplaId);
      await validarMonitorSemanaA(prisma, duplaId, monitorSemanaAId);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Vínculos inválidos");
    }
    return reply.code(201).send(
      await prisma.aluno.create({
        data: {
          nome,
          matricula,
          turmaId,
          duplaId,
          isPcd: parseBoolean(body.isPcd) ?? false,
          qtdQuestoesMeta,
          monitorSemanaAId,
        },
      }),
    );
  });

  app.patch("/alunos/atribuir-dupla", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const duplaId = parseText(body.duplaId);
    const alunoIds = Array.isArray(body.alunoIds)
      ? body.alunoIds.map(parseText).filter((id): id is string => Boolean(id))
      : [];
    if (!duplaId || alunoIds.length === 0 || alunoIds.length > 500) {
      return reply.badRequest("Informe de 1 a 500 alunos e uma dupla");
    }
    try {
      const atualizados = await atribuirAlunosADupla(prisma, alunoIds, duplaId);
      return { atualizados };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Vínculos inválidos");
    }
  });

  app.patch("/alunos/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const aluno = await prisma.aluno.findUnique({ where: request.params as IdParams });
    if (!aluno) return reply.notFound();
    const turmaId = body.turmaId === undefined ? aluno.turmaId : parseText(body.turmaId);
    const duplaId =
      body.duplaId === undefined
        ? aluno.duplaId
        : body.duplaId === null
          ? null
          : (parseText(body.duplaId) ?? null);
    const qtdQuestoesMeta =
      body.qtdQuestoesMeta === undefined
        ? undefined
        : parseOptionalPositiveInteger(body.qtdQuestoesMeta);
    const monitorSemanaAId =
      body.monitorSemanaAId === undefined
        ? undefined
        : body.monitorSemanaAId === null
          ? null
          : parseText(body.monitorSemanaAId);
    if (
      !turmaId ||
      (body.qtdQuestoesMeta !== undefined && qtdQuestoesMeta === undefined) ||
      (body.monitorSemanaAId !== undefined && monitorSemanaAId === undefined)
    )
      return reply.badRequest("Dados do aluno inválidos");
    try {
      await validarVinculosAluno(prisma, turmaId, duplaId);
      const monitorParaValidar =
        monitorSemanaAId !== undefined
          ? monitorSemanaAId
          : duplaId !== aluno.duplaId
            ? null
            : undefined;
      await validarMonitorSemanaA(prisma, duplaId, monitorParaValidar);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Vínculos inválidos");
    }
    return prisma.aluno.update({
      where: request.params as IdParams,
      data: {
        nome: body.nome === undefined ? undefined : parseText(body.nome),
        matricula: body.matricula === undefined ? undefined : parseText(body.matricula),
        turmaId,
        duplaId,
        isPcd: body.isPcd === undefined ? undefined : parseBoolean(body.isPcd),
        qtdQuestoesMeta,
        monitorSemanaAId:
          monitorSemanaAId !== undefined
            ? monitorSemanaAId
            : duplaId !== aluno.duplaId
              ? null
              : undefined,
      },
    });
  });

  app.delete("/alunos/:id", protectedRoute, async (request, reply) => {
    try {
      await excluirAlunoSemHistorico(prisma, (request.params as IdParams).id);
    } catch (error) {
      if (error instanceof AlunoComHistoricoErro) return reply.conflict(error.message);
      throw error;
    }
    return reply.code(204).send();
  });

  app.put("/alunos/:id/prazos-lista", protectedRoute, async (request, reply) => {
    const alunoId = (request.params as IdParams).id;
    const body = request.body as Record<string, unknown>;
    const listaId = parseText(body.listaId);
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      include: { turma: true },
    });
    if (!aluno || !listaId)
      return aluno ? reply.badRequest("listaId é obrigatório") : reply.notFound();
    const lista = await prisma.lista.findUnique({ where: { id: listaId } });
    if (!lista || lista.periodoId !== aluno.turma.periodoId)
      return reply.badRequest("A lista deve pertencer ao período do aluno");
    if (body.prazoEntregaFeedback === null) {
      await prisma.prazoAlunoLista.deleteMany({ where: { alunoId, listaId } });
      return reply.code(204).send();
    }
    const prazoEntregaFeedback = parseDate(body.prazoEntregaFeedback);
    if (!prazoEntregaFeedback) return reply.badRequest("Prazo inválido");
    return prisma.prazoAlunoLista.upsert({
      where: { alunoId_listaId: { alunoId, listaId } },
      create: { alunoId, listaId, prazoEntregaFeedback },
      update: { prazoEntregaFeedback },
    });
  });

  app.post("/alunos/importar-csv", protectedRoute, async (request, reply) => {
    const csv = (request.body as Record<string, unknown>).csv;
    if (typeof csv !== "string") return reply.badRequest("Campo csv é obrigatório");
    try {
      return reply.code(201).send({ importados: await importarAlunos(prisma, csv) });
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "CSV inválido");
    }
  });
}
