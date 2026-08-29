import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { calcularSemana } from "../src/domain/semana.js";
import { NUM_LISTAS_POR_PERIODO, QTD_QUESTOES_PADRAO } from "../src/domain/lista.js";

const TURMAS = ["CC/IA", "EC", "SI"];

const GRUPOS = [
  { nome: "Grupo Bruno", chefe: "Bruno Andrade" },
  { nome: "Grupo Ana", chefe: "Ana Ferreira" },
  { nome: "Grupo Carla", chefe: "Carla Nunes" },
  { nome: "Grupo Diego", chefe: "Diego Salles" },
  { nome: "Grupo Elis", chefe: "Elis Prado" },
  { nome: "Grupo Fábio", chefe: "Fábio Rocha" },
];

const MONITOR_NOMES = [
  "Rafael Souza",
  "Marina Dias",
  "Thiago Lima",
  "Beatriz Cunha",
  "Pedro Alves",
  "Larissa Melo",
  "Gustavo Reis",
  "Camila Torres",
  "Vinícius Braga",
  "Júlia Matos",
  "Leandro Faria",
  "Nicole Barros",
  "Rodrigo Peixoto",
  "Amanda Vieira",
  "Bruno Castro",
  "Débora Lopes",
  "Felipe Nogueira",
  "Renata Costa",
  "Igor Teixeira",
  "Paula Ramos",
  "Otávio Freitas",
  "Sabrina Duarte",
  "Caio Monteiro",
  "Vera Siqueira",
];

const ALUNO_NOMES = [
  "Beatriz Costa",
  "Arthur Morais",
  "Bianca Almeida",
  "Caio Silva",
  "Camila Ribeiro",
  "Carlos Cavalcante",
  "Cauã Ribeiro",
  "Clarice Florêncio",
  "Cláudia Xavier",
  "Cristiano Pereira",
  "Daniel Nascimento",
  "Davi Cezar",
  "Ednaldo Junior",
  "Eduardo Valença",
  "Erick Silvério",
  "Felipe Oliveira",
  "Fernanda Leite",
  "Flávio Santana",
  "Gabriel Hara",
  "Guilherme Nóbrega",
  "Heitor Ximenes",
  "Isabel Maia",
  "Isadora Leão",
  "Jakson Amorim",
  "João Apolinário",
  "Josiel Junior",
  "Juliana Neves",
  "Júlio Barros",
  "Ana Beatriz",
  "Marcos Vinícius",
  "Natália Prado",
  "Otávio Lins",
  "Paula Regina",
  "Renan Duarte",
  "Sofia Andrade",
  "Tales Moreira",
];

function proximaSegunda(base: Date): Date {
  const data = new Date(base);
  const diaSemana = data.getUTCDay(); // 0 = domingo
  const diasAteSegunda = (8 - diaSemana) % 7;
  data.setUTCDate(data.getUTCDate() + diasAteSegunda);
  return data;
}

function addDias(base: Date, dias: number): Date {
  const data = new Date(base);
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

async function limparBanco() {
  await prisma.feedbackQuestaoPlagio.deleteMany();
  await prisma.feedbackQuestaoProibicao.deleteMany();
  await prisma.feedbackQuestaoIA.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.mapeamentoPlanilhaLista.deleteMany();
  await prisma.aluno.deleteMany();
  await prisma.lista.deleteMany();
  // Dupla depende de GrupoRevisao, e GrupoRevisao depende de Monitor (chefeId) — nessa ordem.
  await prisma.dupla.deleteMany();
  await prisma.grupoRevisao.deleteMany();
  // ContaChefe (e SessaoChefe, em cascata) precisa sair antes do Monitor que ela referencia.
  await prisma.contaChefe.deleteMany();
  await prisma.monitor.deleteMany();
  await prisma.turma.deleteMany();
  await prisma.periodo.deleteMany();
}

async function main() {
  await limparBanco();

  const dataInicio = new Date("2026-08-03T00:00:00Z");
  const dataReferenciaRodizio = proximaSegunda(dataInicio);
  const dataFim = addDias(dataInicio, 7 * 16);

  const periodo = await prisma.periodo.create({
    data: {
      nome: "2026.2",
      dataInicio,
      dataFim,
      dataReferenciaRodizio,
      ativo: true,
    },
  });

  const turmas = await Promise.all(
    TURMAS.map((nome) =>
      prisma.turma.create({
        data: { periodoId: periodo.id, nome, nomeAbaPlanilha: nome },
      }),
    ),
  );

  let monitorIndex = 0;
  let duplaIndex = 0;
  // Cada dupla tem no máximo 2 monitores (Monitor.duplaId). Guarda os 2 membros de
  // cada dupla para depois alternar, aluno a aluno, qual dos dois é a semana A.
  const duplaMembros = new Map<string, { m1Id: string; m2Id: string }>();

  for (const grupoDef of GRUPOS) {
    const chefe = await prisma.monitor.create({
      data: {
        nome: grupoDef.chefe,
        whatsappNumero: `+55 81 9${String(9000 + monitorIndex).padStart(8, "0")}`,
        isChefe: true,
        periodoId: periodo.id,
      },
    });
    monitorIndex += 1;

    const grupo = await prisma.grupoRevisao.create({
      data: {
        periodoId: periodo.id,
        chefeId: chefe.id,
        nome: grupoDef.nome,
      },
    });

    for (let d = 1; d <= 2; d += 1) {
      const dupla = await prisma.dupla.create({
        data: { grupoRevisaoId: grupo.id, label: `Dupla ${d}` },
      });
      duplaIndex += 1;

      const nomeA = MONITOR_NOMES[monitorIndex % MONITOR_NOMES.length]!;
      const monitorA = await prisma.monitor.create({
        data: {
          nome: nomeA,
          whatsappNumero: `+55 81 9${String(9000 + monitorIndex).padStart(8, "0")}`,
          isChefe: false,
          periodoId: periodo.id,
          duplaId: dupla.id,
        },
      });
      monitorIndex += 1;

      const nomeB = MONITOR_NOMES[monitorIndex % MONITOR_NOMES.length]!;
      const monitorB = await prisma.monitor.create({
        data: {
          nome: nomeB,
          whatsappNumero: `+55 81 9${String(9000 + monitorIndex).padStart(8, "0")}`,
          isChefe: false,
          periodoId: periodo.id,
          duplaId: dupla.id,
        },
      });
      monitorIndex += 1;

      duplaMembros.set(dupla.id, { m1Id: monitorA.id, m2Id: monitorB.id });
    }
  }

  const duplas = await prisma.dupla.findMany();

  const alunos = await Promise.all(
    ALUNO_NOMES.map((nome, i) => {
      const turma = turmas[i % turmas.length]!;
      const dupla = duplas[i % duplas.length]!;
      const isPcd = i % 17 === 0;
      const membros = duplaMembros.get(dupla.id);
      // Alterna qual dos 2 monitores da dupla é a semana A deste aluno, para
      // demonstrar que a divisão pode variar aluno a aluno dentro da mesma dupla.
      // (i cicla por todas as duplas antes de repetir uma — usa a "rodada" em vez de
      // i diretamente, senão todo aluno de uma mesma dupla cairia sempre do mesmo lado.)
      const rodada = Math.floor(i / duplas.length);
      const monitorSemanaAId = membros
        ? rodada % 2 === 0
          ? membros.m1Id
          : membros.m2Id
        : undefined;

      return prisma.aluno.create({
        data: {
          nome,
          matricula: `202600${String(1000 + i * 7)}`,
          turmaId: turma.id,
          duplaId: dupla.id,
          isPcd,
          qtdQuestoesMeta: isPcd ? QTD_QUESTOES_PADRAO - 2 : null,
          monitorSemanaAId,
        },
      });
    }),
  );

  const listas = await Promise.all(
    Array.from({ length: NUM_LISTAS_POR_PERIODO }, (_, i) =>
      prisma.lista.create({
        data: {
          periodoId: periodo.id,
          nome: `Lista ${i + 1}`,
          qtdQuestoesTotal: QTD_QUESTOES_PADRAO,
          ordem: i + 1,
        },
      }),
    ),
  );

  // Mesma lista pra todas as turmas, mas o prazo varia por turma (2 dias de
  // defasagem entre turmas) — demonstra o caso de uso real de PrazoLista.
  const prazoPorListaTurma = new Map<string, Date>();
  await Promise.all(
    listas.flatMap((lista, listaIndex) =>
      turmas.map(async (turma, turmaIndex) => {
        const prazoEntregaFeedback = addDias(
          dataReferenciaRodizio,
          7 * listaIndex + 6 + turmaIndex * 2,
        );
        await prisma.prazoLista.create({
          data: { listaId: lista.id, turmaId: turma.id, prazoEntregaFeedback },
        });
        prazoPorListaTurma.set(`${lista.id}:${turma.id}`, prazoEntregaFeedback);
      }),
    ),
  );

  const qtdFeedbacks = await gerarFeedbacks({ alunos, listas, prazoPorListaTurma, duplaMembros });

  console.log(
    `Seed concluído: período ${periodo.nome} com ${duplaIndex} duplas, ${monitorIndex} monitores, ${ALUNO_NOMES.length} alunos, ${NUM_LISTAS_POR_PERIODO} listas e ${qtdFeedbacks} feedbacks.`,
  );
}

const DIFICULDADE_QUESTAO = [0.92, 0.83, 0.55, 0.78, 0.6, 0.88];

async function gerarFeedbacks({
  alunos,
  listas,
  prazoPorListaTurma,
  duplaMembros,
}: {
  alunos: {
    id: string;
    duplaId: string | null;
    turmaId: string;
    monitorSemanaAId: string | null;
  }[];
  listas: { id: string }[];
  prazoPorListaTurma: Map<string, Date>;
  duplaMembros: Map<string, { m1Id: string; m2Id: string }>;
}) {
  let total = 0;

  for (const [alunoIndex, aluno] of alunos.entries()) {
    if (!aluno.duplaId) continue;
    const entregues = 3 + (alunoIndex % 4);

    for (
      let listaIndex = 0;
      listaIndex < entregues && listaIndex < listas.length;
      listaIndex += 1
    ) {
      const lista = listas[listaIndex]!;
      const seed = (alunoIndex * 31 + listaIndex * 17) % 100;
      const semana = calcularSemana({ posicaoLista: listaIndex + 1 });
      const membros = duplaMembros.get(aluno.duplaId);
      const monitorBId =
        membros && aluno.monitorSemanaAId
          ? membros.m1Id === aluno.monitorSemanaAId
            ? membros.m2Id
            : membros.m1Id
          : null;
      const monitorId = semana === "A" ? aluno.monitorSemanaAId : monitorBId;
      if (!monitorId) continue;

      const usouIa = seed % 6 === 0;
      const plagiou = seed % 11 === 0;
      const usouProibicao = seed % 8 === 0;
      const noPrazo = seed % 5 !== 0;

      const questoesIa = usouIa
        ? [
            ...new Set([
              (seed % QTD_QUESTOES_PADRAO) + 1,
              ...(seed % 3 === 0 ? [((seed * 2) % QTD_QUESTOES_PADRAO) + 1] : []),
            ]),
          ]
        : [];
      const questoesProibicao = usouProibicao
        ? [
            ...new Set([
              ((seed * 3) % QTD_QUESTOES_PADRAO) + 1,
              ...(seed % 4 === 0 ? [((seed * 5) % QTD_QUESTOES_PADRAO) + 1] : []),
            ]),
          ]
        : [];
      const parceiros = alunos.filter((a) => a.id !== aluno.id && a.duplaId === aluno.duplaId);
      const envolvido = parceiros.length ? parceiros[seed % parceiros.length] : undefined;
      const questoesPlagio =
        plagiou && envolvido
          ? [{ numeroQuestao: (seed % QTD_QUESTOES_PADRAO) + 1, alunoEnvolvidoId: envolvido.id }]
          : [];

      const qtdQuestoesPontuadas = Array.from({ length: QTD_QUESTOES_PADRAO }, (_, qi) => {
        const roll = ((seed * 7 + qi * 53 + listaIndex * 11) % 100) / 100;
        return roll < DIFICULDADE_QUESTAO[qi]!;
      }).filter(Boolean).length;

      const prazoEntregaFeedback = prazoPorListaTurma.get(`${lista.id}:${aluno.turmaId}`)!;
      const criadoEm = noPrazo
        ? addDias(prazoEntregaFeedback, -(1 + (seed % 4)))
        : addDias(prazoEntregaFeedback, 1 + (seed % 3));

      await prisma.feedback.create({
        data: {
          alunoId: aluno.id,
          monitorId,
          listaId: lista.id,
          duplaId: aluno.duplaId,
          semana,
          qtdQuestoesPontuadas,
          usouIa,
          plagiou,
          usouProibicao,
          criadoEm,
          questoesIa: { create: questoesIa.map((numeroQuestao) => ({ numeroQuestao })) },
          questoesPlagio: { create: questoesPlagio },
          questoesProibicao: {
            create: questoesProibicao.map((numeroQuestao) => ({ numeroQuestao })),
          },
        },
      });
      total += 1;
    }
  }

  return total;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
