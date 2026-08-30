-- Remove o fluxo de lembretes automáticos por WhatsApp (mensagem direta não
-- solicitada ao contato do monitor), que contribuiu para o banimento do número.
ALTER TABLE "LembreteAtraso" DROP CONSTRAINT "LembreteAtraso_alunoId_fkey";
ALTER TABLE "LembreteAtraso" DROP CONSTRAINT "LembreteAtraso_listaId_fkey";

DROP TABLE "LembreteAtraso";
