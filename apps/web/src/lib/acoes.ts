import { api } from "./api";
import type { ConfirmRequest } from "./types";

/** Excluir um aluno remove também, em cascata, todo o feedback registrado para ele. */
export function solicitarRemocaoAluno({
  aluno,
  token,
  onRequestConfirm,
  onReload,
  onErro,
}: {
  aluno: { id: string; nome: string };
  token: string;
  onRequestConfirm: (request: ConfirmRequest) => void;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
}) {
  onRequestConfirm({
    title: `Remover ${aluno.nome}?`,
    message:
      "Esta ação é definitiva. Se o aluno já tiver feedback registrado, todo esse histórico também será apagado.",
    confirmLabel: "Remover",
    onConfirm: async () => {
      onErro("");
      try {
        await api.excluirAluno(token, aluno.id);
        await onReload();
      } catch (error) {
        onErro(error instanceof Error ? error.message : "Não foi possível remover o aluno");
      }
    },
  });
}

export function solicitarRemocaoVariosAlunos({
  alunos,
  token,
  onRequestConfirm,
  onReload,
  onErro,
  onConcluido,
}: {
  alunos: { id: string; nome: string }[];
  token: string;
  onRequestConfirm: (request: ConfirmRequest) => void;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
  onConcluido: () => void;
}) {
  onRequestConfirm({
    title: `Remover ${alunos.length} aluno${alunos.length === 1 ? "" : "s"}?`,
    message:
      "Esta ação é definitiva. Todo o feedback já registrado para esses alunos também será apagado junto.",
    confirmLabel: "Remover selecionados",
    onConfirm: async () => {
      onErro("");
      try {
        // Um único request pro lote inteiro — evita estourar o rate limit da API
        // quando muitos alunos são selecionados de uma vez (ver incidente de exclusão
        // em massa: N requests em paralelo/sequência competiam com o reload seguinte).
        const { excluidos } = await api.excluirAlunosEmLote(
          token,
          alunos.map((aluno) => aluno.id),
        );
        if (excluidos < alunos.length) {
          onErro(
            `${excluidos} de ${alunos.length} aluno${alunos.length === 1 ? "" : "s"} ${excluidos === 1 ? "foi removido" : "foram removidos"} — a seleção pode ter ficado desatualizada.`,
          );
        }
      } catch (error) {
        onErro(error instanceof Error ? error.message : "Não foi possível remover os alunos");
      }
      onConcluido();
      await onReload();
    },
  });
}

export function solicitarRemocaoVariosMonitores({
  monitores,
  token,
  onRequestConfirm,
  onReload,
  onErro,
  onConcluido,
}: {
  monitores: { id: string; nome: string }[];
  token: string;
  onRequestConfirm: (request: ConfirmRequest) => void;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
  onConcluido: () => void;
}) {
  onRequestConfirm({
    title: `Excluir ${monitores.length} monitor${monitores.length === 1 ? "" : "es"}?`,
    message:
      "Esta ação é definitiva. O feedback já registrado por eles é preservado (fica só sem essa autoria).",
    confirmLabel: "Excluir selecionados",
    onConfirm: async () => {
      onErro("");
      try {
        // Um único request pro lote inteiro — evita estourar o rate limit da API
        // quando muitos monitores são selecionados de uma vez.
        const { excluidos } = await api.excluirMonitoresEmLote(
          token,
          monitores.map((monitor) => monitor.id),
        );
        if (excluidos < monitores.length) {
          onErro(
            `${excluidos} de ${monitores.length} monitor${monitores.length === 1 ? "" : "es"} ${excluidos === 1 ? "foi removido" : "foram removidos"} — a seleção pode ter ficado desatualizada.`,
          );
        }
      } catch (error) {
        onErro(error instanceof Error ? error.message : "Não foi possível excluir os monitores");
      }
      onConcluido();
      await onReload();
    },
  });
}

export function solicitarRemocaoMonitor({
  monitor,
  token,
  onRequestConfirm,
  onReload,
  onErro,
}: {
  monitor: { id: string; nome: string };
  token: string;
  onRequestConfirm: (request: ConfirmRequest) => void;
  onReload: () => Promise<void>;
  onErro: (mensagem: string) => void;
}) {
  onRequestConfirm({
    title: `Excluir ${monitor.nome}?`,
    message:
      "Esta ação é definitiva. O feedback já registrado por ele é preservado (fica só sem essa autoria).",
    confirmLabel: "Excluir monitor",
    onConfirm: async () => {
      onErro("");
      try {
        await api.excluirMonitor(token, monitor.id);
        await onReload();
      } catch (error) {
        onErro(error instanceof Error ? error.message : "Não foi possível excluir o monitor");
      }
    },
  });
}
