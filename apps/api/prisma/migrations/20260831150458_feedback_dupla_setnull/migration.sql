-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_duplaId_fkey";

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_duplaId_fkey" FOREIGN KEY ("duplaId") REFERENCES "Dupla"("id") ON DELETE SET NULL ON UPDATE CASCADE;
