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
