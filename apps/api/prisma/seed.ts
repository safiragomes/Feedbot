import "dotenv/config";
import { prisma } from "../src/db/client.js";

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

const NUM_QUESTOES = 6;
const NUM_LISTAS = 6;

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
  // Duplas referenciam Monitor (semana A/B) e Monitor referencia Dupla: zera os dois lados antes de excluir.
  await prisma.dupla.updateMany({ data: { monitorSemanaAId: null, monitorSemanaBId: null } });
  await prisma.monitor.updateMany({ data: { duplaId: null } });
  // Dupla depende de GrupoRevisao, e GrupoRevisao depende de Monitor (chefeId) — nessa ordem.
  await prisma.dupla.deleteMany();
  await prisma.grupoRevisao.deleteMany();
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

      await prisma.dupla.update({
        where: { id: dupla.id },
        data: { monitorSemanaAId: monitorA.id, monitorSemanaBId: monitorB.id },
      });
    }
  }

  const duplas = await prisma.dupla.findMany();

  await Promise.all(
    ALUNO_NOMES.map((nome, i) => {
      const turma = turmas[i % turmas.length]!;
      const dupla = duplas[i % duplas.length]!;
      const isPcd = i % 17 === 0;

      return prisma.aluno.create({
        data: {
          nome,
          matricula: `202600${String(1000 + i * 7)}`,
          turmaId: turma.id,
          duplaId: dupla.id,
          isPcd,
          qtdQuestoesMeta: isPcd ? NUM_QUESTOES - 2 : null,
        },
      });
    }),
  );

  await Promise.all(
    Array.from({ length: NUM_LISTAS }, (_, i) =>
      prisma.lista.create({
        data: {
          periodoId: periodo.id,
          nome: `Lista ${i + 1}`,
          qtdQuestoesTotal: NUM_QUESTOES,
          prazoEntregaFeedback: addDias(dataReferenciaRodizio, 7 * i + 6),
        },
      }),
    ),
  );

  console.log(
    `Seed concluído: período ${periodo.nome} com ${duplaIndex} duplas, ${monitorIndex} monitores, ${ALUNO_NOMES.length} alunos e ${NUM_LISTAS} listas.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
