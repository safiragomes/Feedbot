-- AlterTable
ALTER TABLE "Periodo" ADD COLUMN     "discordGuildId" TEXT,
ADD COLUMN     "discordMonitoresRoleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_discordGuildId_key" ON "Periodo"("discordGuildId");
