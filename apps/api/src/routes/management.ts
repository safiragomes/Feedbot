import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { MonitorStatus, Semana } from "../generated/prisma/enums.js";
import { requireChief } from "../auth/require-chief.js";
import { normalizarWhatsapp } from "../domain/telefone.js";
import { NUM_LISTAS_POR_PERIODO, QTD_QUESTOES_PADRAO } from "../domain/lista.js";
import { TURMAS_FIXAS } from "../domain/turma.js";

type IdParams = { id: string };

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= 200 ? normalized : undefined;
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
  if (value === null || value === undefined) return null;
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
  if (Buffer.byteLength(csv, "utf8") > 512 * 1024) throw new Error("CSV excede o limite de 512 KB");
  const [header, ...rows] = csvRows(csv);
  if (!header) throw new Error("CSV vazio");
  if (rows.length > 2_000) throw new Error("CSV excede o limite de 2.000 alunos");
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
    if (
      !nome ||
      !matricula ||
      !turmaId ||
      !duplaId ||
      nome.length > 200 ||
      matricula.length > 100 ||
      turmaId.length > 200 ||
      duplaId.length > 200
    )
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

async function validateAlunoLinks(prisma: PrismaClient, turmaId: string, duplaId: string) {
  const [turma, dupla] = await Promise.all([
    prisma.turma.findUnique({ where: { id: turmaId } }),
    prisma.dupla.findUnique({ where: { id: duplaId }, include: { grupoRevisao: true } }),
  ]);
  if (!turma || !dupla) throw new Error("Turma ou dupla não encontrada");
  if (turma.periodoId !== dupla.grupoRevisao.periodoId)
    throw new Error("Turma e dupla devem pertencer ao mesmo período");
  return turma.periodoId;
}

// O monitor da semana A de um aluno precisa ser um dos (até 2) monitores da própria
// dupla do aluno — o monitor da semana B é sempre "o outro" dessa mesma dupla,
// derivado (não armazenado).
async function validateAlunoMonitorA(
  prisma: PrismaClient,
  duplaId: string,
  monitorId: string | null | undefined,
) {
  if (!monitorId) return;
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) throw new Error("Monitor não encontrado");
  if (monitor.duplaId !== duplaId) throw new Error("Monitor deve pertencer à dupla do aluno");
}

// Cada monitor pertence a no máximo uma dupla, e cada dupla tem no máximo 2 monitores
// (a "dupla de monitores" que atende os alunos dela).
async function validateMonitorDupla(
  prisma: PrismaClient,
  periodoId: string,
  duplaId: string | null | undefined,
  monitorIdAtual?: string,
) {
  if (!duplaId) return;
  const dupla = await prisma.dupla.findUnique({
    where: { id: duplaId },
    include: { grupoRevisao: true },
  });
  if (!dupla) throw new Error("Dupla não encontrada");
  if (dupla.grupoRevisao.periodoId !== periodoId)
    throw new Error("Dupla deve pertencer ao período do monitor");
  const qtdMonitores = await prisma.monitor.count({
    where: { duplaId, ...(monitorIdAtual ? { id: { not: monitorIdAtual } } : {}) },
  });
  if (qtdMonitores >= 2) throw new Error("Esta dupla já tem 2 monitores");
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
    const periodo = await prisma.$transaction(async (tx) => {
      const periodo = await tx.periodo.create({
        data: {
          nome,
          dataInicio,
          dataFim,
          dataReferenciaRodizio,
          ativo: bool(body.ativo) ?? true,
        },
      });
      await tx.lista.createMany({
        data: Array.from({ length: NUM_LISTAS_POR_PERIODO }, (_, i) => ({
          periodoId: periodo.id,
          nome: `Lista ${i + 1}`,
          qtdQuestoesTotal: QTD_QUESTOES_PADRAO,
          ordem: i + 1,
        })),
      });
      await tx.turma.createMany({
        data: TURMAS_FIXAS.map((nome) => ({
          periodoId: periodo.id,
          nome,
          nomeAbaPlanilha: nome,
        })),
      });
      return periodo;
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
    await prisma.dupla.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });

  app.get("/monitores", protectedRoute, async (request) =>
    prisma.monitor.findMany({
      where: text((request.query as Record<string, unknown>).periodoId)
        ? { periodoId: text((request.query as Record<string, unknown>).periodoId) }
        : undefined,
      include: {
        contaChefe: { select: { email: true } },
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
      await validateMonitorDupla(prisma, periodoId, duplaId);
    } catch (error) {
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
    const monitor = await prisma.monitor.findUnique({ where: request.params as IdParams });
    if (!monitor) return reply.notFound();
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
    try {
      if (duplaId !== undefined)
        await validateMonitorDupla(prisma, monitor.periodoId, duplaId, monitor.id);
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Dupla inválida");
    }
    return prisma.$transaction(async (tx) => {
      if (duplaId !== undefined && duplaId !== monitor.duplaId) {
        // Trocar a dupla do monitor invalida a escolha de "monitor A" de qualquer
        // aluno que dependia dele — limpa para não deixar Aluno.monitorSemanaAId
        // apontando para um monitor fora da dupla do aluno.
        await tx.aluno.updateMany({
          where: { monitorSemanaAId: monitor.id },
          data: { monitorSemanaAId: null },
        });
      }
      const atualizado = await tx.monitor.update({
        where: request.params as IdParams,
        data: {
          nome: body.nome === undefined ? undefined : text(body.nome),
          whatsappNumero: whatsappNumero ?? undefined,
          isChefe: body.isChefe === undefined ? undefined : bool(body.isChefe),
          status,
          duplaId,
        },
      });
      if (atualizado.status === MonitorStatus.INATIVO || !atualizado.isChefe) {
        await tx.sessaoChefe.deleteMany({ where: { contaChefe: { monitorId: atualizado.id } } });
      }
      return atualizado;
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
      include: { turma: true, dupla: true, monitorSemanaA: true, prazosIndividuais: true },
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
    const monitorSemanaAId = body.monitorSemanaAId === null ? null : text(body.monitorSemanaAId);
    if (!nome || !matricula || !turmaId || !duplaId || qtdQuestoesMeta === undefined)
      return reply.badRequest("Dados do aluno inválidos");
    try {
      await validateAlunoLinks(prisma, turmaId, duplaId);
      await validateAlunoMonitorA(prisma, duplaId, monitorSemanaAId);
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
          monitorSemanaAId,
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
    const monitorSemanaAId =
      body.monitorSemanaAId === undefined
        ? undefined
        : body.monitorSemanaAId === null
          ? null
          : text(body.monitorSemanaAId);
    if (
      !turmaId ||
      !duplaId ||
      (body.qtdQuestoesMeta !== undefined && qtdQuestoesMeta === undefined) ||
      (body.monitorSemanaAId !== undefined && monitorSemanaAId === undefined)
    )
      return reply.badRequest("Dados do aluno inválidos");
    try {
      await validateAlunoLinks(prisma, turmaId, duplaId);
      // Se a dupla do aluno está mudando, a atribuição de monitor A anterior (da
      // dupla antiga) deixa de valer — precisa ser reescolhida ou limpa.
      const monitorParaValidar =
        monitorSemanaAId !== undefined
          ? monitorSemanaAId
          : duplaId !== aluno.duplaId
            ? null
            : undefined;
      await validateAlunoMonitorA(prisma, duplaId, monitorParaValidar);
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
    await prisma.aluno.delete({ where: request.params as IdParams });
    return reply.code(204).send();
  });
  app.put("/alunos/:id/prazos-lista", protectedRoute, async (request, reply) => {
    const alunoId = (request.params as IdParams).id;
    const body = request.body as Record<string, unknown>;
    const listaId = text(body.listaId);
    const valor = body.prazoEntregaFeedback;
    const aluno = await prisma.aluno.findUnique({
      where: { id: alunoId },
      include: { turma: true },
    });
    if (!aluno || !listaId)
      return aluno ? reply.badRequest("listaId é obrigatório") : reply.notFound();
    const lista = await prisma.lista.findUnique({ where: { id: listaId } });
    if (!lista || lista.periodoId !== aluno.turma.periodoId)
      return reply.badRequest("A lista deve pertencer ao período do aluno");
    if (valor === null) {
      await prisma.prazoAlunoLista.deleteMany({ where: { alunoId, listaId } });
      await prisma.lembreteAtraso.deleteMany({ where: { alunoId, listaId } });
      return reply.code(204).send();
    }
    const prazoEntregaFeedback = date(valor);
    if (!prazoEntregaFeedback) return reply.badRequest("Prazo inválido");
    const prazo = await prisma.prazoAlunoLista.upsert({
      where: { alunoId_listaId: { alunoId, listaId } },
      create: { alunoId, listaId, prazoEntregaFeedback },
      update: { prazoEntregaFeedback },
    });
    // Se o prazo foi prorrogado, um eventual lembrete anterior não deve impedir um
    // novo aviso caso o monitor também ultrapasse a nova data.
    await prisma.lembreteAtraso.deleteMany({ where: { alunoId, listaId } });
    return prazo;
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
    const turma = await prisma.turma.findUnique({ where: { id: turmaId } });
    if (!turma) return reply.notFound();
    const prazos: { listaId: string; prazoEntregaFeedback: Date }[] = [];
    for (const item of prazosBrutos) {
      const listaId = text(item.listaId);
      const prazoEntregaFeedback = date(item.prazoEntregaFeedback);
      if (!listaId || !prazoEntregaFeedback) return reply.badRequest("Item de prazo inválido");
      prazos.push({ listaId, prazoEntregaFeedback });
    }
    const listaIds = [...new Set(prazos.map((p) => p.listaId))];
    const listas = await prisma.lista.findMany({ where: { id: { in: listaIds } } });
    if (listas.length !== listaIds.length || listas.some((l) => l.periodoId !== turma.periodoId))
      return reply.badRequest("Todas as listas devem pertencer ao período da turma");
    await prisma.$transaction(
      prazos.map((p) =>
        prisma.prazoLista.upsert({
          where: { listaId_turmaId: { listaId: p.listaId, turmaId } },
          create: { listaId: p.listaId, turmaId, prazoEntregaFeedback: p.prazoEntregaFeedback },
          update: { prazoEntregaFeedback: p.prazoEntregaFeedback },
        }),
      ),
    );
    return reply.send({ atualizados: prazos.length });
  });
}
