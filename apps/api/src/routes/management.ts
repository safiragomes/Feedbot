import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { MonitorStatus, Semana } from "../generated/prisma/enums.js";
import { requireChief } from "../auth/require-chief.js";

type IdParams = { id: string };

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function date(value: unknown): Date | undefined {
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function optionalInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  return positiveInteger(value);
}

function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV possui aspas não fechadas");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseCsvStudents(csv: string) {
  const [header, ...rows] = csvRows(csv);
  if (!header) throw new Error("CSV vazio");
  const columns = new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));
  for (const required of ["nome", "matricula", "turmaid", "duplaid"]) {
    if (!columns.has(required)) throw new Error(`CSV requer a coluna ${required}`);
  }
  const value = (row: string[], name: string) => row[columns.get(name)!]?.trim();
  return rows.map((row, index) => {
    const nome = value(row, "nome");
    const matricula = value(row, "matricula");
    const turmaId = value(row, "turmaid");
    const duplaId = value(row, "duplaid");
    if (!nome || !matricula || !turmaId || !duplaId)
      throw new Error(`Linha ${index + 2} incompleta`);
    const pcd = value(row, "ispcd")?.toLowerCase();
    const metaValue = value(row, "qtdquestoesmeta");
    const qtdQuestoesMeta = metaValue ? Number(metaValue) : null;
    if (pcd && !["true", "false", "sim", "nao", "não", "1", "0"].includes(pcd)) {
      throw new Error(`isPcd inválido na linha ${index + 2}`);
    }
    if (
      metaValue &&
      (qtdQuestoesMeta === null || !Number.isInteger(qtdQuestoesMeta) || qtdQuestoesMeta < 1)
    ) {
      throw new Error(`qtdQuestoesMeta inválida na linha ${index + 2}`);
    }
    return {
      nome,
      matricula,
      turmaId,
      duplaId,
      isPcd: ["true", "sim", "1"].includes(pcd ?? ""),
      qtdQuestoesMeta,
    };
  });
}

async function validateDuplaMonitor(
  prisma: PrismaClient,
  duplaId: string,
  monitorId: string | null | undefined,
) {
  if (!monitorId) return;
  const [dupla, monitor] = await Promise.all([
    prisma.dupla.findUnique({ where: { id: duplaId }, include: { grupoRevisao: true } }),
    prisma.monitor.findUnique({ where: { id: monitorId } }),
  ]);
  if (!dupla || !monitor) throw new Error("Dupla ou monitor não encontrado");
  if (monitor.periodoId !== dupla.grupoRevisao.periodoId)
    throw new Error("Monitor deve pertencer ao período da dupla");
  if (monitor.duplaId && monitor.duplaId !== duplaId)
    throw new Error("Monitor já está vinculado a outra dupla neste período");
}

async function validateAlunoLinks(prisma: PrismaClient, turmaId: string, duplaId: string) {
  const [turma, dupla] = await Promise.all([
    prisma.turma.findUnique({ where: { id: turmaId } }),
    prisma.dupla.findUnique({ where: { id: duplaId }, include: { grupoRevisao: true } }),
  ]);
  if (!turma || !dupla) throw new Error("Turma ou dupla não encontrada");
  if (turma.periodoId !== dupla.grupoRevisao.periodoId)
    throw new Error("Turma e dupla devem pertencer ao mesmo período");
}

export function managementRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const protectedRoute = { preHandler: requireChief(prisma) };

  app.get("/periodos", protectedRoute, async () =>
    prisma.periodo.findMany({ orderBy: { dataInicio: "desc" } }),
  );
  app.post("/periodos", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const nome = text(body.nome);
    const dataInicio = date(body.dataInicio);
    const dataFim = date(body.dataFim);
    const dataReferenciaRodizio = date(body.dataReferenciaRodizio);
    if (!nome || !dataInicio || !dataFim || !dataReferenciaRodizio || dataFim < dataInicio)
      return reply.badRequest("Dados do período inválidos");
    return reply.code(201).send(
      await prisma.periodo.create({
        data: {
          nome,
          dataInicio,
          dataFim,
          dataReferenciaRodizio,
          ativo: bool(body.ativo) ?? true,
        },
      }),
    );
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
    await prisma.periodo.delete({ where: request.params as IdParams });
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
  app.post("/turmas", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const periodoId = text(body.periodoId);
    const nome = text(body.nome);
    const nomeAbaPlanilha = text(body.nomeAbaPlanilha);
    if (!periodoId || !nome || !nomeAbaPlanilha)
      return reply.badRequest("período, nome e aba da planilha são obrigatórios");
    return reply
      .code(201)
      .send(await prisma.turma.create({ data: { periodoId, nome, nomeAbaPlanilha } }));
  });
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
    }
    return prisma.grupoRevisao.update({
      where: request.params as IdParams,
      data: { nome, chefeId },
    });
  });
  app.delete("/grupos-revisao/:id", protectedRoute, async (request, reply) => {
    await prisma.grupoRevisao.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });

  app.get("/duplas", protectedRoute, async (request) =>
    prisma.dupla.findMany({
      where: text((request.query as Record<string, unknown>).grupoRevisaoId)
        ? { grupoRevisaoId: text((request.query as Record<string, unknown>).grupoRevisaoId) }
        : undefined,
      include: {
        grupoRevisao: true,
        monitorSemanaA: true,
        monitorSemanaB: true,
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
    const duplaId = (request.params as IdParams).id;
    const monitorSemanaAId =
      body.monitorSemanaAId === null
        ? null
        : body.monitorSemanaAId === undefined
          ? undefined
          : text(body.monitorSemanaAId);
    const monitorSemanaBId =
      body.monitorSemanaBId === null
        ? null
        : body.monitorSemanaBId === undefined
          ? undefined
          : text(body.monitorSemanaBId);
    if (
      (body.monitorSemanaAId !== undefined && monitorSemanaAId === undefined) ||
      (body.monitorSemanaBId !== undefined && monitorSemanaBId === undefined) ||
      (monitorSemanaAId && monitorSemanaAId === monitorSemanaBId)
    )
      return reply.badRequest("Escalas de monitor inválidas");
    try {
      await validateDuplaMonitor(prisma, duplaId, monitorSemanaAId);
      await validateDuplaMonitor(prisma, duplaId, monitorSemanaBId);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Monitor inválido");
    }
    const label = body.label === undefined ? undefined : text(body.label);
    if (body.label !== undefined && !label) return reply.badRequest("Rótulo inválido");
    return prisma.$transaction(async (tx) => {
      for (const monitorId of [monitorSemanaAId, monitorSemanaBId])
        if (monitorId) await tx.monitor.update({ where: { id: monitorId }, data: { duplaId } });
      return tx.dupla.update({
        where: { id: duplaId },
        data: { label, monitorSemanaAId, monitorSemanaBId },
      });
    });
  });
  app.delete("/duplas/:id", protectedRoute, async (request, reply) => {
    await prisma.dupla.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });

  app.get("/monitores", protectedRoute, async (request) =>
    prisma.monitor.findMany({
      where: text((request.query as Record<string, unknown>).periodoId)
        ? { periodoId: text((request.query as Record<string, unknown>).periodoId) }
        : undefined,
      include: {
        dupla: { include: { grupoRevisao: true } },
        contaChefe: { select: { email: true } },
      },
      orderBy: { nome: "asc" },
    }),
  );
  app.post("/monitores", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const nome = text(body.nome);
    const whatsappNumero = text(body.whatsappNumero);
    const periodoId = text(body.periodoId);
    const duplaId = body.duplaId === null ? null : text(body.duplaId);
    const isChefe = bool(body.isChefe) ?? false;
    const status =
      body.status === "INATIVO"
        ? MonitorStatus.INATIVO
        : body.status === undefined || body.status === "ATIVO"
          ? MonitorStatus.ATIVO
          : undefined;
    if (!nome || !whatsappNumero || !periodoId || !status)
      return reply.badRequest("Dados do monitor inválidos");
    if (duplaId) {
      try {
        await validateDuplaMonitor(prisma, duplaId, undefined);
        const dupla = await prisma.dupla.findUnique({
          where: { id: duplaId },
          include: { grupoRevisao: true },
        });
        if (!dupla || dupla.grupoRevisao.periodoId !== periodoId) throw new Error();
      } catch {
        return reply.badRequest("Dupla inválida para o período");
      }
    }
    return reply.code(201).send(
      await prisma.monitor.create({
        data: { nome, whatsappNumero, periodoId, duplaId, isChefe, status },
      }),
    );
  });
  app.patch("/monitores/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const monitor = await prisma.monitor.findUnique({ where: request.params as IdParams });
    if (!monitor) return reply.notFound();
    const duplaId =
      body.duplaId === null ? null : body.duplaId === undefined ? undefined : text(body.duplaId);
    if (body.duplaId !== undefined && duplaId === undefined)
      return reply.badRequest("Dupla inválida");
    if (duplaId) {
      const dupla = await prisma.dupla.findUnique({
        where: { id: duplaId },
        include: { grupoRevisao: true },
      });
      if (!dupla || dupla.grupoRevisao.periodoId !== monitor.periodoId)
        return reply.badRequest("Dupla deve pertencer ao período do monitor");
    }
    const status =
      body.status === undefined
        ? undefined
        : body.status === "ATIVO"
          ? MonitorStatus.ATIVO
          : body.status === "INATIVO"
            ? MonitorStatus.INATIVO
            : undefined;
    if (body.status !== undefined && !status) return reply.badRequest("Status inválido");
    return prisma.monitor.update({
      where: request.params as IdParams,
      data: {
        nome: body.nome === undefined ? undefined : text(body.nome),
        whatsappNumero: body.whatsappNumero === undefined ? undefined : text(body.whatsappNumero),
        isChefe: body.isChefe === undefined ? undefined : bool(body.isChefe),
        status,
        duplaId,
      },
    });
  });
  app.delete("/monitores/:id", protectedRoute, async (request, reply) => {
    await prisma.monitor.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });

  app.get("/alunos", protectedRoute, async (request) =>
    prisma.aluno.findMany({
      where: text((request.query as Record<string, unknown>).turmaId)
        ? { turmaId: text((request.query as Record<string, unknown>).turmaId) }
        : text((request.query as Record<string, unknown>).duplaId)
          ? { duplaId: text((request.query as Record<string, unknown>).duplaId) }
          : undefined,
      include: { turma: true, dupla: true },
      orderBy: { nome: "asc" },
    }),
  );
  app.post("/alunos", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const nome = text(body.nome);
    const matricula = text(body.matricula);
    const turmaId = text(body.turmaId);
    const duplaId = text(body.duplaId);
    const qtdQuestoesMeta = optionalInteger(body.qtdQuestoesMeta);
    if (!nome || !matricula || !turmaId || !duplaId || qtdQuestoesMeta === undefined)
      return reply.badRequest("Dados do aluno inválidos");
    try {
      await validateAlunoLinks(prisma, turmaId, duplaId);
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
          isPcd: bool(body.isPcd) ?? false,
          qtdQuestoesMeta,
        },
      }),
    );
  });
  app.patch("/alunos/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const aluno = await prisma.aluno.findUnique({ where: request.params as IdParams });
    if (!aluno) return reply.notFound();
    const turmaId = body.turmaId === undefined ? aluno.turmaId : text(body.turmaId);
    const duplaId = body.duplaId === undefined ? aluno.duplaId : text(body.duplaId);
    const qtdQuestoesMeta =
      body.qtdQuestoesMeta === undefined ? undefined : optionalInteger(body.qtdQuestoesMeta);
    if (!turmaId || !duplaId || qtdQuestoesMeta === undefined)
      return reply.badRequest("Dados do aluno inválidos");
    try {
      await validateAlunoLinks(prisma, turmaId, duplaId);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Vínculos inválidos");
    }
    return prisma.aluno.update({
      where: request.params as IdParams,
      data: {
        nome: body.nome === undefined ? undefined : text(body.nome),
        matricula: body.matricula === undefined ? undefined : text(body.matricula),
        turmaId,
        duplaId,
        isPcd: body.isPcd === undefined ? undefined : bool(body.isPcd),
        qtdQuestoesMeta,
      },
    });
  });
  app.delete("/alunos/:id", protectedRoute, async (request, reply) => {
    await prisma.aluno.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });
  app.post("/alunos/importar-csv", protectedRoute, async (request, reply) => {
    const csv = (request.body as Record<string, unknown>).csv;
    if (typeof csv !== "string") return reply.badRequest("Campo csv é obrigatório");
    let alunos;
    try {
      alunos = parseCsvStudents(csv);
      for (const aluno of alunos) await validateAlunoLinks(prisma, aluno.turmaId, aluno.duplaId);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "CSV inválido");
    }
    await prisma.$transaction(alunos.map((aluno) => prisma.aluno.create({ data: aluno })));
    return reply.code(201).send({ importados: alunos.length });
  });

  app.get("/listas", protectedRoute, async (request) =>
    prisma.lista.findMany({
      where: text((request.query as Record<string, unknown>).periodoId)
        ? { periodoId: text((request.query as Record<string, unknown>).periodoId) }
        : undefined,
      orderBy: { prazoEntregaFeedback: "asc" },
    }),
  );
  app.post("/listas", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const periodoId = text(body.periodoId);
    const nome = text(body.nome);
    const qtdQuestoesTotal = positiveInteger(body.qtdQuestoesTotal);
    const prazoEntregaFeedback = date(body.prazoEntregaFeedback);
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
      !prazoEntregaFeedback ||
      semanaOverride === undefined
    )
      return reply.badRequest("Dados da lista inválidos");
    return reply.code(201).send(
      await prisma.lista.create({
        data: { periodoId, nome, qtdQuestoesTotal, prazoEntregaFeedback, semanaOverride },
      }),
    );
  });
  app.patch("/listas/:id", protectedRoute, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const qtdQuestoesTotal =
      body.qtdQuestoesTotal === undefined ? undefined : positiveInteger(body.qtdQuestoesTotal);
    const prazoEntregaFeedback =
      body.prazoEntregaFeedback === undefined ? undefined : date(body.prazoEntregaFeedback);
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
      (body.prazoEntregaFeedback !== undefined && !prazoEntregaFeedback) ||
      (body.semanaOverride !== undefined && semanaOverride === undefined)
    )
      return reply.badRequest("Dados da lista inválidos");
    return prisma.lista.update({
      where: request.params as IdParams,
      data: {
        nome: body.nome === undefined ? undefined : text(body.nome),
        qtdQuestoesTotal,
        prazoEntregaFeedback,
        semanaOverride,
      },
    });
  });
  app.delete("/listas/:id", protectedRoute, async (request, reply) => {
    await prisma.lista.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });
}
