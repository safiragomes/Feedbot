-- A migration anterior (remove_anonimizar_cascata_delecao) cascateou Dupla->Aluno e
-- GrupoRevisao->Dupla, mas esqueceu que Feedback.duplaId é um retrato de qual dupla o
-- aluno tinha na hora do registro — se o aluno já trocou de dupla depois, esse
-- Feedback.duplaId antigo não é mais igual ao Aluno.duplaId atual, então o cascade via
-- aluno não é suficiente pra liberar a exclusão da dupla antiga. Faltava cascatear
-- Feedback.duplaId também.

-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_duplaId_fkey";

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_duplaId_fkey" FOREIGN KEY ("duplaId") REFERENCES "Dupla"("id") ON DELETE CASCADE ON UPDATE CASCADE;
