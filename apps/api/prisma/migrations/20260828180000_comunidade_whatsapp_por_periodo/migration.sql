ALTER TABLE "Periodo" ADD COLUMN "whatsappAvisosId" TEXT;
ALTER TABLE "Periodo" ADD COLUMN "whatsappComunidadeNome" TEXT;
CREATE UNIQUE INDEX "Periodo_whatsappAvisosId_key" ON "Periodo"("whatsappAvisosId");
