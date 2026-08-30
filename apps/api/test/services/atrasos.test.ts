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
