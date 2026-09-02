import type { FastifyInstance, FastifyReply } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { MonitorStatus, Semana } from "../generated/prisma/enums.js";
import { requireChief } from "../auth/require-chief.js";
import { normalizarWhatsapp } from "../domain/telefone.js";
import {
  atualizarMonitor,
  atualizarPrazosDaTurma,
  criarPeriodo,
  excluirDupla,
  excluirGrupoRevisao,
  excluirMonitor,
  excluirMonitores,
  excluirPeriodo,
  GestaoErro,
  validarMonitorDupla,
  verificarWhatsappDisponivel,
} from "../application/gestao/gestao-service.js";
import {
  type IdParams,
  parseBoolean as bool,
  parseDate as date,
  parsePositiveInteger as positiveInteger,
  parseText as text,
} from "../http/input.js";
import { alunoRoutes } from "./management/alunos.js";

function responderErroGestao(reply: FastifyReply, error: unknown) {
  if (!(error instanceof GestaoErro)) throw error;
  if (error.codigo === "NAO_ENCONTRADO") return reply.notFound(error.message);
  if (error.codigo === "CONFLITO") return reply.conflict(error.message);
  return reply.badRequest(error.message);
}

export function managementRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const protectedRoute = { preHandler: requireChief(prisma) };
  alunoRoutes(app, prisma);

  app.get("/periodos", protectedRoute, async () =>
    // Dois períodos com o mesmo dataInicio (ex.: início de semestre em massa)
    // ficariam em ordem indefinida sem o desempate por criadoEm — e é o primeiro
    // da lista que o painel abre por padrão no login.
    prisma.periodo.findMany({ orderBy: [{ dataInicio: "desc" }, { criadoEm: "desc" }] }),
  );
  app.post("/periodos", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const nome = text(body.nome);
    const dataInicio = date(body.dataInicio);
    const dataFim = date(body.dataFim);
    const dataReferenciaRodizio = date(body.dataReferenciaRodizio);
    if (!nome || !dataInicio || !dataFim || !dataReferenciaRodizio || dataFim < dataInicio)
      return reply.badRequest("Dados do período inválidos");
    const periodo = await criarPeriodo(prisma, {
      nome,
      dataInicio,
      dataFim,
      dataReferenciaRodizio,
      ativo: bool(body.ativo) ?? true,
    });
    return reply.code(201).send(periodo);
  });
  app.patch("/periodos/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.nome !== undefined) data.nome = text(body.nome);
    if (body.ativo !== undefined) data.ativo = bool(body.ativo);
    for (const field of ["dataInicio", "dataFim", "dataReferenciaRodizio"] as const)
      if (body[field] !== undefined) data[field] = date(body[field]);
    if (Object.values(data).some((value) => value === undefined))
      return reply.badRequest("Dados do período inválidos");
    return prisma.periodo.update({ where: request.params as IdParams, data });
  });
  app.delete("/periodos/:id", protectedRoute, async (request, reply) => {
    try {
      await excluirPeriodo(prisma, (request.params as IdParams).id);
    } catch (error) {
      return responderErroGestao(reply, error);
    }
    return reply.code(204).send();
  });

  app.get("/turmas", protectedRoute, async (request) =>
    prisma.turma.findMany({
      where: text((request.query as Record<string, unknown>).periodoId)
        ? { periodoId: text((request.query as Record<string, unknown>).periodoId) }
        : undefined,
      orderBy: { nome: "asc" },
    }),
  );
  app.patch("/turmas/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const data = {
      nome: body.nome === undefined ? undefined : text(body.nome),
      nomeAbaPlanilha: body.nomeAbaPlanilha === undefined ? undefined : text(body.nomeAbaPlanilha),
    };
    if (
      (body.nome !== undefined && !data.nome) ||
      (body.nomeAbaPlanilha !== undefined && !data.nomeAbaPlanilha)
    )
      return reply.badRequest("Dados da turma inválidos");
    return prisma.turma.update({ where: request.params as IdParams, data });
  });
  app.delete("/turmas/:id", protectedRoute, async (request, reply) => {
    await prisma.turma.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });

  app.get("/grupos-revisao", protectedRoute, async (request) =>
    prisma.grupoRevisao.findMany({
      where: text((request.query as Record<string, unknown>).periodoId)
        ? { periodoId: text((request.query as Record<string, unknown>).periodoId) }
        : undefined,
      include: { chefe: true, duplas: true },
      orderBy: { nome: "asc" },
    }),
  );
  app.post("/grupos-revisao", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const periodoId = text(body.periodoId);
    const chefeId = text(body.chefeId);
    const nome = text(body.nome);
    if (!periodoId || !chefeId || !nome)
      return reply.badRequest("período, chefe e nome são obrigatórios");
    const chefe = await prisma.monitor.findUnique({ where: { id: chefeId } });
    if (!chefe || !chefe.isChefe || chefe.periodoId !== periodoId)
      return reply.badRequest("Chefe deve ser um monitor-chefe do mesmo período");
    const grupoDoChefe = await prisma.grupoRevisao.findFirst({ where: { periodoId, chefeId } });
    if (grupoDoChefe) return reply.conflict("Este chefe já possui um grupo neste período");
    return reply
      .code(201)
      .send(await prisma.grupoRevisao.create({ data: { periodoId, chefeId, nome } }));
  });
  app.patch("/grupos-revisao/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const group = await prisma.grupoRevisao.findUnique({ where: request.params as IdParams });
    if (!group) return reply.notFound();
    const nome = body.nome === undefined ? undefined : text(body.nome);
    const chefeId = body.chefeId === undefined ? undefined : text(body.chefeId);
    if ((body.nome !== undefined && !nome) || (body.chefeId !== undefined && !chefeId))
      return reply.badRequest("Dados do grupo inválidos");
    if (chefeId) {
      const chefe = await prisma.monitor.findUnique({ where: { id: chefeId } });
      if (!chefe || !chefe.isChefe || chefe.periodoId !== group.periodoId)
        return reply.badRequest("Chefe inválido para o período");
      const grupoDoChefe = await prisma.grupoRevisao.findFirst({
        where: { periodoId: group.periodoId, chefeId, id: { not: group.id } },
      });
      if (grupoDoChefe) return reply.conflict("Este chefe já possui um grupo neste período");
    }
    return prisma.grupoRevisao.update({
      where: request.params as IdParams,
      data: { nome, chefeId },
    });
  });
  app.delete("/grupos-revisao/:id", protectedRoute, async (request, reply) => {
    const { id } = request.params as IdParams;
    try {
      await excluirGrupoRevisao(prisma, id);
    } catch (error) {
      return responderErroGestao(reply, error);
    }
    return reply.code(204).send();
  });

  app.get("/duplas", protectedRoute, async (request) =>
    prisma.dupla.findMany({
      where: text((request.query as Record<string, unknown>).grupoRevisaoId)
        ? { grupoRevisaoId: text((request.query as Record<string, unknown>).grupoRevisaoId) }
        : undefined,
      include: {
        grupoRevisao: true,
        monitores: true,
        _count: { select: { alunos: true } },
      },
      orderBy: { label: "asc" },
    }),
  );
  app.post("/duplas", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const grupoRevisaoId = text(body.grupoRevisaoId);
    const label = text(body.label);
    if (!grupoRevisaoId || !label) return reply.badRequest("Grupo e rótulo são obrigatórios");
    return reply.code(201).send(await prisma.dupla.create({ data: { grupoRevisaoId, label } }));
  });
  app.patch("/duplas/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const label = body.label === undefined ? undefined : text(body.label);
    if (body.label !== undefined && !label) return reply.badRequest("Rótulo inválido");
    return prisma.dupla.update({ where: request.params as IdParams, data: { label } });
  });
  app.delete("/duplas/:id", protectedRoute, async (request, reply) => {
    const { id } = request.params as IdParams;
    try {
      await excluirDupla(prisma, id);
    } catch (error) {
      return responderErroGestao(reply, error);
    }
    return reply.code(204).send();
  });

  app.get("/monitores", protectedRoute, async (request) =>
    prisma.monitor.findMany({
      where: text((request.query as Record<string, unknown>).periodoId)
        ? { periodoId: text((request.query as Record<string, unknown>).periodoId) }
        : undefined,
      include: {
        contaChefe: { select: { email: true } },
        conviteContaChefe: { select: { email: true, expiraEm: true, usadoEm: true } },
        dupla: { select: { id: true, label: true, grupoRevisaoId: true } },
      },
      orderBy: { nome: "asc" },
    }),
  );
  app.post("/monitores", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const nome = text(body.nome);
    const whatsappNumeroBruto = text(body.whatsappNumero);
    const whatsappNumero = whatsappNumeroBruto
      ? normalizarWhatsapp(whatsappNumeroBruto)
      : undefined;
    const periodoId = text(body.periodoId);
    const isChefe = bool(body.isChefe) ?? false;
    const duplaId = body.duplaId === null || body.duplaId === undefined ? null : text(body.duplaId);
    const status =
      body.status === "INATIVO"
        ? MonitorStatus.INATIVO
        : body.status === undefined || body.status === "ATIVO"
          ? MonitorStatus.ATIVO
          : undefined;
    if (whatsappNumeroBruto && !whatsappNumero)
      return reply.badRequest("Número de WhatsApp inválido");
    if (
      !nome ||
      !whatsappNumero ||
      !periodoId ||
      !status ||
      (body.duplaId !== undefined && body.duplaId !== null && !duplaId)
    )
      return reply.badRequest("Dados do monitor inválidos");
    try {
      await validarMonitorDupla(prisma, periodoId, duplaId);
      await verificarWhatsappDisponivel(prisma, whatsappNumero);
    } catch (error) {
      if (error instanceof GestaoErro) return responderErroGestao(reply, error);
      return reply.badRequest(error instanceof Error ? error.message : "Dupla inválida");
    }
    return reply.code(201).send(
      await prisma.monitor.create({
        data: { nome, whatsappNumero, periodoId, isChefe, status, duplaId },
      }),
    );
  });
  app.patch("/monitores/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const monitorId = (request.params as IdParams).id;
    const status =
      body.status === undefined
        ? undefined
        : body.status === "ATIVO"
          ? MonitorStatus.ATIVO
          : body.status === "INATIVO"
            ? MonitorStatus.INATIVO
            : undefined;
    if (body.status !== undefined && !status) return reply.badRequest("Status inválido");
    const duplaId =
      body.duplaId === undefined ? undefined : body.duplaId === null ? null : text(body.duplaId);
    if (body.duplaId !== undefined && body.duplaId !== null && !duplaId)
      return reply.badRequest("Dupla inválida");
    const whatsappNumero =
      body.whatsappNumero === undefined
        ? undefined
        : normalizarWhatsapp(text(body.whatsappNumero) ?? "");
    if (body.whatsappNumero !== undefined && !whatsappNumero)
      return reply.badRequest("Número de WhatsApp inválido");
    const isChefe = body.isChefe === undefined ? undefined : bool(body.isChefe);
    if (body.isChefe !== undefined && isChefe === undefined)
      return reply.badRequest("Papel do monitor inválido");
    try {
      return await atualizarMonitor(prisma, monitorId, {
        nome: body.nome === undefined ? undefined : text(body.nome),
        whatsappNumero: whatsappNumero ?? undefined,
        isChefe,
        status,
        duplaId,
      });
    } catch (error) {
      return responderErroGestao(reply, error);
    }
  });
  app.delete("/monitores/:id", protectedRoute, async (request, reply) => {
    try {
      await excluirMonitor(prisma, (request.params as IdParams).id);
    } catch (error) {
      return responderErroGestao(reply, error);
    }
    return reply.code(204).send();
  });

  app.post("/monitores/excluir-lote", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const ids = Array.isArray(body.ids)
      ? body.ids.map(text).filter((id): id is string => Boolean(id))
      : [];
    if (ids.length === 0 || ids.length > 500) {
      return reply.badRequest("Informe de 1 a 500 monitores");
    }
    return { excluidos: await excluirMonitores(prisma, ids) };
  });

  app.get("/listas", protectedRoute, async (request) =>
    prisma.lista.findMany({
      where: text((request.query as Record<string, unknown>).periodoId)
        ? { periodoId: text((request.query as Record<string, unknown>).periodoId) }
        : undefined,
      orderBy: { ordem: "asc" },
      include: { prazos: true },
    }),
  );
  app.post("/listas", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const periodoId = text(body.periodoId);
    const nome = text(body.nome);
    const qtdQuestoesTotal = positiveInteger(body.qtdQuestoesTotal);
    const ordemInformada = body.ordem === undefined ? undefined : positiveInteger(body.ordem);
    const semanaOverride =
      body.semanaOverride === null
        ? null
        : body.semanaOverride === "A"
          ? Semana.A
          : body.semanaOverride === "B"
            ? Semana.B
            : body.semanaOverride === undefined
              ? null
              : undefined;
    if (
      !periodoId ||
      !nome ||
      !qtdQuestoesTotal ||
      semanaOverride === undefined ||
      (body.ordem !== undefined && !ordemInformada)
    )
      return reply.badRequest("Dados da lista inválidos");
    const ordem =
      ordemInformada ??
      ((await prisma.lista.aggregate({ where: { periodoId }, _max: { ordem: true } }))._max.ordem ??
        0) + 1;
    return reply.code(201).send(
      await prisma.lista.create({
        data: { periodoId, nome, qtdQuestoesTotal, ordem, semanaOverride },
      }),
    );
  });
  app.patch("/listas/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (body.ordem !== undefined)
      return reply.badRequest(
        "A ordem da lista não pode ser alterada após a criação — isso mudaria a semana A/B de feedbacks já registrados",
      );
    const qtdQuestoesTotal =
      body.qtdQuestoesTotal === undefined ? undefined : positiveInteger(body.qtdQuestoesTotal);
    const semanaOverride =
      body.semanaOverride === undefined
        ? undefined
        : body.semanaOverride === null
          ? null
          : body.semanaOverride === "A"
            ? Semana.A
            : body.semanaOverride === "B"
              ? Semana.B
              : undefined;
    if (
      (body.qtdQuestoesTotal !== undefined && !qtdQuestoesTotal) ||
      (body.semanaOverride !== undefined && semanaOverride === undefined)
    )
      return reply.badRequest("Dados da lista inválidos");
    const listaId = (request.params as IdParams).id;
    const prazosBrutos = body.prazos;
    if (prazosBrutos !== undefined && !Array.isArray(prazosBrutos))
      return reply.badRequest("Prazos inválidos");
    const prazos = (prazosBrutos as Record<string, unknown>[] | undefined)?.map((item) => ({
      turmaId: text(item.turmaId),
      prazoEntregaFeedback: date(item.prazoEntregaFeedback),
    }));
    if (prazos?.some((p) => !p.turmaId || !p.prazoEntregaFeedback))
      return reply.badRequest("Prazo de turma inválido");
    const listaAtual = await prisma.lista.findUnique({ where: { id: listaId } });
    if (!listaAtual) return reply.notFound();
    if (prazos?.length) {
      const turmas = await prisma.turma.findMany({
        where: { id: { in: prazos.map((p) => p.turmaId!) } },
      });
      if (
        turmas.length !== new Set(prazos.map((p) => p.turmaId)).size ||
        turmas.some((t) => t.periodoId !== listaAtual.periodoId)
      )
        return reply.badRequest("Todas as turmas devem pertencer ao período da lista");
    }
    await prisma.$transaction([
      prisma.lista.update({
        where: { id: listaId },
        data: {
          nome: body.nome === undefined ? undefined : text(body.nome),
          qtdQuestoesTotal,
          semanaOverride,
        },
      }),
      ...(prazos ?? []).map((p) =>
        prisma.prazoLista.upsert({
          where: { listaId_turmaId: { listaId, turmaId: p.turmaId! } },
          create: { listaId, turmaId: p.turmaId!, prazoEntregaFeedback: p.prazoEntregaFeedback! },
          update: { prazoEntregaFeedback: p.prazoEntregaFeedback! },
        }),
      ),
    ]);
    return prisma.lista.findUniqueOrThrow({ where: { id: listaId }, include: { prazos: true } });
  });
  app.delete("/listas/:id", protectedRoute, async (request, reply) => {
    await prisma.lista.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });

  app.get("/prazos-lista", protectedRoute, async (request, reply) => {
    const turmaId = text((request.query as Record<string, unknown>).turmaId);
    if (!turmaId) return reply.badRequest("turmaId é obrigatório");
    const turma = await prisma.turma.findUnique({ where: { id: turmaId } });
    if (!turma) return reply.notFound();
    const listas = await prisma.lista.findMany({
      where: { periodoId: turma.periodoId },
      orderBy: { ordem: "asc" },
      include: { prazos: { where: { turmaId } } },
    });
    return listas.map((lista) => ({
      listaId: lista.id,
      listaNome: lista.nome,
      ordem: lista.ordem,
      qtdQuestoesTotal: lista.qtdQuestoesTotal,
      prazoEntregaFeedback: lista.prazos[0]?.prazoEntregaFeedback?.toISOString() ?? null,
    }));
  });
  app.put("/prazos-lista", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const turmaId = text(body.turmaId);
    const prazosBrutos = Array.isArray(body.prazos)
      ? (body.prazos as Record<string, unknown>[])
      : undefined;
    if (!turmaId || !prazosBrutos) return reply.badRequest("turmaId e prazos são obrigatórios");
    const prazos: { listaId: string; prazoEntregaFeedback: Date }[] = [];
    for (const item of prazosBrutos) {
      const listaId = text(item.listaId);
      const prazoEntregaFeedback = date(item.prazoEntregaFeedback);
      if (!listaId || !prazoEntregaFeedback) return reply.badRequest("Item de prazo inválido");
      prazos.push({ listaId, prazoEntregaFeedback });
    }
    try {
      return reply.send({ atualizados: await atualizarPrazosDaTurma(prisma, turmaId, prazos) });
    } catch (error) {
      return responderErroGestao(reply, error);
    }
  });
}
