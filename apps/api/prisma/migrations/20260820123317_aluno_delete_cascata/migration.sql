-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_alunoId_fkey";

-- DropForeignKey
ALTER TABLE "FeedbackQuestaoPlagio" DROP CONSTRAINT "FeedbackQuestaoPlagio_alunoEnvolvidoId_fkey";

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackQuestaoPlagio" ADD CONSTRAINT "FeedbackQuestaoPlagio_alunoEnvolvidoId_fkey" FOREIGN KEY ("alunoEnvolvidoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
