import { api } from "./api";
import type { ConfirmRequest } from "../components/ui";

/**
 * Excluir aluno ou monitor é exclusão de verdade, em cascata: o histórico de
 * feedback vinculado (do aluno, ou registrado pelo monitor) é apagado junto — não
 * há opção de "anonimizar" como alternativa (schema.prisma: Feedback.aluno e
 * Feedback.monitor usam onDelete: Cascade).
 */
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
    message: "O aluno e todo o histórico de feedback dele serão apagados permanentemente.",
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
    message: "O monitor e todo o histórico de feedback registrado por ele serão apagados permanentemente.",
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
