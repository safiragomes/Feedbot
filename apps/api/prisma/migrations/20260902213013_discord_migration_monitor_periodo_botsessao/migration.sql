-- DropIndex
DROP INDEX "Periodo_whatsappAvisosId_key";

-- AlterTable
ALTER TABLE "BotSessao" DROP COLUMN "numeroConectado",
ADD COLUMN     "discordBotTag" TEXT,
ADD COLUMN     "guildNome" TEXT;

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "discordAvatarUrl" TEXT,
ADD COLUMN     "discordDisplayName" TEXT,
ADD COLUMN     "discordUserId" TEXT,
ADD COLUMN     "discordUsername" TEXT,
ADD COLUMN     "discordVinculadoEm" TIMESTAMP(3),
ALTER COLUMN "whatsappNumero" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Periodo" DROP COLUMN "whatsappAvisosId",
DROP COLUMN "whatsappComunidadeNome",
ADD COLUMN     "discordAvisosCanalId" TEXT,
ADD COLUMN     "discordAvisosCanalNome" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Monitor_discordUserId_key" ON "Monitor"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_discordAvisosCanalId_key" ON "Periodo"("discordAvisosCanalId");
