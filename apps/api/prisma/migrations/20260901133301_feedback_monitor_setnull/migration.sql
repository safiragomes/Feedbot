-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_monitorId_fkey";

-- AlterTable
ALTER TABLE "Feedback" ALTER COLUMN "monitorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
