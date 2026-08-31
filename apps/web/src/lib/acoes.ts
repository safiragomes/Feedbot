import { api } from "./api";
import type { ConfirmRequest } from "./types";

/** Exclusões com feedback são recusadas pela API para preservar o histórico acadêmico. */
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
      "O aluno só será removido se ainda não possuir feedback. Se houver histórico, use o fluxo de anonimização.",
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
      "Alunos que já possuem feedback registrado não serão removidos, para preservar o histórico acadêmico; os demais serão excluídos.",
    confirmLabel: "Remover selecionados",
    onConfirm: async () => {
      onErro("");
      const resultados = await Promise.allSettled(
        alunos.map((aluno) => api.excluirAluno(token, aluno.id)),
      );
      const falhas = resultados.filter((r) => r.status === "rejected").length;
      onConcluido();
      await onReload();
      if (falhas > 0) {
        onErro(
          `${falhas} de ${alunos.length} aluno${alunos.length === 1 ? "" : "s"} não ${falhas === 1 ? "pôde" : "puderam"} ser removido${falhas === 1 ? "" : "s"} (provavelmente já tem feedback registrado).`,
        );
      }
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
      "Monitores que já têm feedback registrado não serão removidos; os demais serão excluídos.",
    confirmLabel: "Excluir selecionados",
    onConfirm: async () => {
      onErro("");
      const resultados = await Promise.allSettled(
        monitores.map((monitor) => api.excluirMonitor(token, monitor.id)),
      );
      const falhas = resultados.filter((r) => r.status === "rejected").length;
      onConcluido();
      await onReload();
      if (falhas > 0) {
        onErro(
          `${falhas} de ${monitores.length} monitor${monitores.length === 1 ? "" : "es"} não ${falhas === 1 ? "pôde" : "puderam"} ser removido${falhas === 1 ? "" : "s"} (provavelmente já tem feedback registrado).`,
        );
      }
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
    message: "O monitor só será removido se ainda não tiver feedback registrado.",
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
