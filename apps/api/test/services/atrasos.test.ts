import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { buscarPendenciasAtrasadas } from "../../src/services/atrasos.js";

describe("buscarPendenciasAtrasadas", () => {
  it("atribui listas ímpares ao A, pares ao B e respeita prazo individual e feedback entregue", async () => {
    const agora = new Date("2026-09-10T12:00:00Z");
    const monitorA = { id: "a", nome: "Monitor A", whatsappNumero: "+5581999999991" };
    const monitorB = { id: "b", nome: "Monitor B", whatsappNumero: "+5581999999992" };
    const prisma = {
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno",
            nome: "Aluno Teste",
            turmaId: "turma",
            duplaId: "dupla",
            monitorSemanaAId: "a",
            turma: { periodoId: "periodo" },
            dupla: { monitores: [monitorA, monitorB] },
            prazosIndividuais: [
              {
                listaId: "lista-2",
                prazoEntregaFeedback: new Date("2026-09-09T12:00:00Z"),
              },
            ],
            feedbacks: [{ listaId: "lista-1" }],
          },
          {
            id: "sem-dupla",
            nome: "Sem dupla",
            turmaId: "turma",
            duplaId: null,
            monitorSemanaAId: null,
            turma: { periodoId: "periodo" },
            dupla: null,
            prazosIndividuais: [],
            feedbacks: [],
          },
        ]),
      },
      lista: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lista-1",
            nome: "Lista 1",
            periodoId: "periodo",
            ordem: 1,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2026-09-08T12:00:00Z") }],
          },
          {
            id: "lista-2",
            nome: "Lista 2",
            periodoId: "periodo",
            ordem: 2,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2026-09-20T12:00:00Z") }],
          },
          {
            id: "lista-3",
            nome: "Lista 3",
            periodoId: "periodo",
            ordem: 3,
            semanaOverride: "B",
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2026-09-09T12:00:00Z") }],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const pendencias = await buscarPendenciasAtrasadas(prisma, agora);

    expect(pendencias).toHaveLength(2);
    expect(pendencias.map((item) => [item.listaId, item.monitorId])).toEqual([
      ["lista-2", "b"],
      ["lista-3", "b"],
    ]);
  });

  it("calcula a semana pela posição da lista no período, não pelo valor bruto de ordem (que fica com buracos após exclusão)", async () => {
    const agora = new Date("2026-09-10T12:00:00Z");
    const monitorA = { id: "a", nome: "Monitor A", whatsappNumero: "+5581999999991" };
    const monitorB = { id: "b", nome: "Monitor B", whatsappNumero: "+5581999999992" };
    const prisma = {
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno",
            nome: "Aluno Teste",
            turmaId: "turma",
            duplaId: "dupla",
            monitorSemanaAId: "a",
            turma: { periodoId: "periodo" },
            dupla: { monitores: [monitorA, monitorB] },
            prazosIndividuais: [],
            feedbacks: [],
          },
        ]),
      },
      lista: {
        // "Lista 2" (ordem=2) foi excluída — ordem não é renumerado, então sobra um
        // buraco. lista-3 continua com ordem=3 no banco, mas é a 2ª lista do período
        // (posição 2 = semana B), não a 3ª (que seria semana A se usasse ordem cru).
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lista-1",
            nome: "Lista 1",
            periodoId: "periodo",
            ordem: 1,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2026-09-08T12:00:00Z") }],
          },
          {
            id: "lista-3",
            nome: "Lista 3",
            periodoId: "periodo",
            ordem: 3,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2026-09-09T12:00:00Z") }],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const pendencias = await buscarPendenciasAtrasadas(prisma, agora);

    expect(pendencias.map((item) => [item.listaId, item.monitorId])).toEqual([
      ["lista-1", "a"],
      ["lista-3", "b"],
    ]);
  });

  it("não atribui a semana B ao primeiro monitor da dupla quando o aluno não tem monitorSemanaAId definido", async () => {
    // Regressão: a lógica anterior fazia dupla.monitores.find(m => m.id !== monitorSemanaAId),
    // que com monitorSemanaAId=null sempre casava com o primeiro monitor da dupla —
    // atribuindo o atraso a um monitor sem nenhum aluno de fato vinculado a ele (ver
    // domain/monitorSemana.ts, a fonte única da regra: sem monitor A, não há monitor B).
    const agora = new Date("2026-09-10T12:00:00Z");
    const monitorA = { id: "a", nome: "Monitor A", whatsappNumero: "+5581999999991" };
    const monitorB = { id: "b", nome: "Monitor B", whatsappNumero: "+5581999999992" };
    const prisma = {
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno",
            nome: "Aluno sem monitor A",
            turmaId: "turma",
            duplaId: "dupla",
            monitorSemanaAId: null,
            turma: { periodoId: "periodo" },
            dupla: { monitores: [monitorA, monitorB] },
            prazosIndividuais: [],
            feedbacks: [],
          },
        ]),
      },
      lista: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lista-1",
            nome: "Lista 1",
            periodoId: "periodo",
            ordem: 1,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2026-09-08T12:00:00Z") }],
          },
          {
            id: "lista-2",
            nome: "Lista 2",
            periodoId: "periodo",
            ordem: 2,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2026-09-08T12:00:00Z") }],
          },
        ]),
      },
    } as unknown as PrismaClient;

    expect(await buscarPendenciasAtrasadas(prisma, agora)).toEqual([]);
  });

  it("um prazo salvo como 'fim do dia local' só vira atraso depois da meia-noite local, não assim que o dia vira", async () => {
    // O frontend salva o prazo com fimDoDiaIso("2026-09-10") = "2026-09-10T23:59:59.999"
    // interpretado no fuso local de quem definiu, virando um instante em UTC (aqui,
    // fuso -03:00, fica "2026-09-11T02:59:59.999Z"). Confirma que o dia inteiro de
    // 10/09 no horário local ainda conta como dentro do prazo.
    const prazoFimDoDia10DeSetembroLocal = new Date("2026-09-10T23:59:59.999-03:00");
    const monitorA = { id: "a", nome: "Monitor A", whatsappNumero: "+5581999999991" };
    const prisma = {
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno",
            nome: "Aluno Teste",
            turmaId: "turma",
            duplaId: "dupla",
            monitorSemanaAId: "a",
            turma: { periodoId: "periodo" },
            dupla: { monitores: [monitorA] },
            prazosIndividuais: [],
            feedbacks: [],
          },
        ]),
      },
      lista: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lista-1",
            nome: "Lista 1",
            periodoId: "periodo",
            ordem: 1,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: prazoFimDoDia10DeSetembroLocal }],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const aindaNoDia10 = new Date("2026-09-10T23:58:00-03:00");
    const jaVirouODia11 = new Date("2026-09-11T00:01:00-03:00");

    expect(await buscarPendenciasAtrasadas(prisma, aindaNoDia10)).toEqual([]);
    expect(await buscarPendenciasAtrasadas(prisma, jaVirouODia11)).toHaveLength(1);
  });

  it("ignora listas sem prazo, prazo futuro e aluno sem responsável definido", async () => {
    const prisma = {
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno",
            nome: "Aluno",
            turmaId: "turma",
            duplaId: "dupla",
            monitorSemanaAId: null,
            turma: { periodoId: "periodo" },
            dupla: { monitores: [] },
            prazosIndividuais: [],
            feedbacks: [],
          },
        ]),
      },
      lista: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sem-prazo",
            nome: "Sem prazo",
            periodoId: "periodo",
            ordem: 1,
            semanaOverride: null,
            prazos: [],
          },
          {
            id: "futura",
            nome: "Futura",
            periodoId: "periodo",
            ordem: 2,
            semanaOverride: null,
            prazos: [{ turmaId: "turma", prazoEntregaFeedback: new Date("2027-01-01T00:00:00Z") }],
          },
        ]),
      },
    } as unknown as PrismaClient;

    expect(await buscarPendenciasAtrasadas(prisma, new Date("2026-09-10T00:00:00Z"))).toEqual([]);
  });
});

describe("precedência do grupo nos indicadores de atraso", () => {
  it.each([
    {
      cenario: "grupo prevalece sobre turma",
      individual: null,
      grupo: "2026-09-09T00:00:00Z",
      turma: "2026-09-20T00:00:00Z",
      esperado: "2026-09-09T00:00:00Z",
    },
    {
      cenario: "exceção prevalece sobre grupo",
      individual: "2026-09-08T00:00:00Z",
      grupo: "2026-09-09T00:00:00Z",
      turma: null,
      esperado: "2026-09-08T00:00:00Z",
    },
    {
      cenario: "nenhum nível configurado não gera atraso",
      individual: null,
      grupo: null,
      turma: null,
      esperado: null,
    },
    {
      cenario: "grupo futuro afasta atraso da turma",
      individual: null,
      grupo: "2026-09-20T00:00:00Z",
      turma: "2026-09-09T00:00:00Z",
      esperado: null,
    },
  ])("$cenario", async ({ individual, grupo, turma, esperado }) => {
    const prisma = {
      aluno: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "aluno",
            nome: "Aluno teste",
            turmaId: "turma",
            grupoPrazoId: "grupo",
            duplaId: "dupla",
            monitorSemanaAId: "monitor",
            turma: { periodoId: "periodo" },
            dupla: { monitores: [{ id: "monitor", nome: "Monitor teste", whatsappNumero: null }] },
            feedbacks: [],
            prazosIndividuais: individual
              ? [{ listaId: "lista", prazoEntregaFeedback: new Date(individual) }]
              : [],
          },
        ]),
      },
      lista: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lista",
            nome: "Lista teste",
            periodoId: "periodo",
            ordem: 1,
            semanaOverride: null,
            prazos: turma ? [{ turmaId: "turma", prazoEntregaFeedback: new Date(turma) }] : [],
            prazosGrupo: grupo
              ? [{ grupoPrazoId: "grupo", prazoEntregaFeedback: new Date(grupo) }]
              : [],
          },
        ]),
      },
    } as unknown as PrismaClient;
    const pendencias = await buscarPendenciasAtrasadas(prisma, new Date("2026-09-10T00:00:00Z"));
    expect(pendencias.map((pendencia) => pendencia.prazoEntregaFeedback)).toEqual(
      esperado ? [new Date(esperado)] : [],
    );
  });
});
