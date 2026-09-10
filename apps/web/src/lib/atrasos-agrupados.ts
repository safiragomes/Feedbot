import type { Aluno, Atraso, Dupla, GrupoRevisao } from "./types";

export type OrdenacaoAtrasos = "pendencias" | "dias";

export type ListaPendente = {
  listaId: string;
  listaNome: string;
  prazoEntregaFeedback: string;
};

export type AlunoDoMonitor = {
  alunoId: string;
  alunoNome: string;
  duplaId: string;
  duplaLabel: string;
  listas: ListaPendente[];
  totalAtrasos: number;
  prazoMaisAntigo: string;
};

export type MonitorAgrupado = {
  monitorId: string;
  monitorNome: string;
  alunos: AlunoDoMonitor[];
  totalAtrasos: number;
  prazoMaisAntigo: string;
};

export type GrupoAgrupado = {
  grupoId: string;
  grupoNome: string;
  monitores: MonitorAgrupado[];
  totalAtrasos: number;
  prazoMaisAntigo: string;
};

export type TurmaAgrupada = {
  turmaId: string;
  turmaNome: string;
  grupos: GrupoAgrupado[];
  totalAtrasos: number;
  prazoMaisAntigo: string;
};

type Contavel = { totalAtrasos: number; prazoMaisAntigo: string };

/** "dias": prazo mais antigo primeiro (quem está atrasado há mais tempo). Empate resolvido
 * por nome pelo chamador de cada .sort — esta função só decide entre os dois critérios. */
function comparar(ordenarPor: OrdenacaoAtrasos, a: Contavel, b: Contavel): number {
  if (ordenarPor === "dias") {
    return new Date(a.prazoMaisAntigo).getTime() - new Date(b.prazoMaisAntigo).getTime();
  }
  return b.totalAtrasos - a.totalAtrasos;
}

export function agruparAtrasosPorTurma(
  atrasos: Atraso[],
  alunos: Aluno[],
  duplas: Dupla[],
  grupos: GrupoRevisao[],
  ordenarPor: OrdenacaoAtrasos = "pendencias",
): TurmaAgrupada[] {
  const alunoPorId = new Map(alunos.map((a) => [a.id, a]));
  const duplaPorId = new Map(duplas.map((d) => [d.id, d]));
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));

  const turmas = new Map<string, TurmaAgrupada>();

  for (const atraso of atrasos) {
    const aluno = alunoPorId.get(atraso.alunoId);
    if (!aluno) continue;
    const dupla = duplaPorId.get(atraso.duplaId);
    const grupoId = dupla?.grupoRevisaoId ?? "sem-grupo";
    const grupoNome = grupoPorId.get(grupoId)?.nome ?? "Sem grupo";
    const prazo = atraso.prazoEntregaFeedback;

    let turma = turmas.get(aluno.turmaId);
    if (!turma) {
      turma = {
        turmaId: aluno.turmaId,
        turmaNome: aluno.turma.nome,
        grupos: [],
        totalAtrasos: 0,
        prazoMaisAntigo: prazo,
      };
      turmas.set(aluno.turmaId, turma);
    }
    turma.totalAtrasos += 1;
    if (prazo < turma.prazoMaisAntigo) turma.prazoMaisAntigo = prazo;

    let grupo = turma.grupos.find((g) => g.grupoId === grupoId);
    if (!grupo) {
      grupo = { grupoId, grupoNome, monitores: [], totalAtrasos: 0, prazoMaisAntigo: prazo };
      turma.grupos.push(grupo);
    }
    grupo.totalAtrasos += 1;
    if (prazo < grupo.prazoMaisAntigo) grupo.prazoMaisAntigo = prazo;

    let monitor = grupo.monitores.find((m) => m.monitorId === atraso.monitorId);
    if (!monitor) {
      monitor = {
        monitorId: atraso.monitorId,
        monitorNome: atraso.monitorNome,
        alunos: [],
        totalAtrasos: 0,
        prazoMaisAntigo: prazo,
      };
      grupo.monitores.push(monitor);
    }
    monitor.totalAtrasos += 1;
    if (prazo < monitor.prazoMaisAntigo) monitor.prazoMaisAntigo = prazo;

    let alunoAgrupado = monitor.alunos.find((a) => a.alunoId === atraso.alunoId);
    if (!alunoAgrupado) {
      alunoAgrupado = {
        alunoId: atraso.alunoId,
        alunoNome: atraso.alunoNome,
        duplaId: atraso.duplaId,
        duplaLabel: dupla?.label ?? "—",
        listas: [],
        totalAtrasos: 0,
        prazoMaisAntigo: prazo,
      };
      monitor.alunos.push(alunoAgrupado);
    }
    alunoAgrupado.totalAtrasos += 1;
    if (prazo < alunoAgrupado.prazoMaisAntigo) alunoAgrupado.prazoMaisAntigo = prazo;
    alunoAgrupado.listas.push({
      listaId: atraso.listaId,
      listaNome: atraso.listaNome,
      prazoEntregaFeedback: prazo,
    });
  }

  const turmasArr = [...turmas.values()];
  turmasArr.forEach((turma) => {
    turma.grupos.forEach((grupo) => {
      grupo.monitores.forEach((monitor) => {
        monitor.alunos.forEach((aluno) => {
          aluno.listas.sort((a, b) => a.prazoEntregaFeedback.localeCompare(b.prazoEntregaFeedback));
        });
        monitor.alunos.sort(
          (a, b) => comparar(ordenarPor, a, b) || a.alunoNome.localeCompare(b.alunoNome, "pt-BR"),
        );
      });
      grupo.monitores.sort(
        (a, b) => comparar(ordenarPor, a, b) || a.monitorNome.localeCompare(b.monitorNome, "pt-BR"),
      );
    });
    turma.grupos.sort(
      (a, b) => comparar(ordenarPor, a, b) || a.grupoNome.localeCompare(b.grupoNome, "pt-BR"),
    );
  });
  turmasArr.sort(
    (a, b) => comparar(ordenarPor, a, b) || a.turmaNome.localeCompare(b.turmaNome, "pt-BR"),
  );

  return turmasArr;
}

export type MonitorEmAtraso = {
  monitorId: string;
  monitorNome: string;
  totalAtrasos: number;
  prazoMaisAntigo: string;
};

/** Ranking "quem cobrar primeiro" independente da árvore por turma — usa o mesmo critério
 * de ordenarPor, pra não ficar preso a "mais pendências" quando a chefe escolhe "mais dias". */
export function listarMonitoresEmAtraso(
  atrasos: Atraso[],
  ordenarPor: OrdenacaoAtrasos = "pendencias",
): MonitorEmAtraso[] {
  const porMonitor = new Map<string, MonitorEmAtraso>();
  for (const atraso of atrasos) {
    const atual = porMonitor.get(atraso.monitorId) ?? {
      monitorId: atraso.monitorId,
      monitorNome: atraso.monitorNome,
      totalAtrasos: 0,
      prazoMaisAntigo: atraso.prazoEntregaFeedback,
    };
    atual.totalAtrasos += 1;
    if (atraso.prazoEntregaFeedback < atual.prazoMaisAntigo) {
      atual.prazoMaisAntigo = atraso.prazoEntregaFeedback;
    }
    porMonitor.set(atraso.monitorId, atual);
  }
  return [...porMonitor.values()].sort(
    (a, b) => comparar(ordenarPor, a, b) || a.monitorNome.localeCompare(b.monitorNome, "pt-BR"),
  );
}
