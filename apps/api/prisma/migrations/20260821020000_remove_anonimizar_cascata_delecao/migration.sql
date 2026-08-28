-- Remove o recurso de "anonimizar monitor" (usado como alternativa quando excluir
-- falhava por causa de histórico de feedback vinculado) e faz "excluir" ser exclusão
-- de verdade em cascata: excluir um grupo apaga suas duplas e os alunos delas; excluir
-- um monitor apaga a conta de chefe dele (se houver) e o histórico de feedback que ele
-- registrou. Aluno.monitorSemanaAId só fica nulo (o aluno continua existindo).

-- DropForeignKey
ALTER TABLE "Aluno" DROP CONSTRAINT "Aluno_duplaId_fkey";

-- DropForeignKey
ALTER TABLE "Aluno" DROP CONSTRAINT "Aluno_monitorSemanaAId_fkey";

-- DropForeignKey
ALTER TABLE "ContaChefe" DROP CONSTRAINT "ContaChefe_monitorId_fkey";

-- DropForeignKey
ALTER TABLE "Dupla" DROP CONSTRAINT "Dupla_grupoRevisaoId_fkey";

-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_monitorId_fkey";

-- AddForeignKey
ALTER TABLE "Dupla" ADD CONSTRAINT "Dupla_grupoRevisaoId_fkey" FOREIGN KEY ("grupoRevisaoId") REFERENCES "GrupoRevisao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaChefe" ADD CONSTRAINT "ContaChefe_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_duplaId_fkey" FOREIGN KEY ("duplaId") REFERENCES "Dupla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_monitorSemanaAId_fkey" FOREIGN KEY ("monitorSemanaAId") REFERENCES "Monitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
