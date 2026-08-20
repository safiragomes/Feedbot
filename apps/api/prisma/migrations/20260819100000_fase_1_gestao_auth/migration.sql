-- CreateTable
CREATE TABLE "ContaChefe" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaChefe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoChefe" (
    "id" TEXT NOT NULL,
    "contaChefeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoChefe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaChefe_monitorId_key" ON "ContaChefe"("monitorId");
CREATE UNIQUE INDEX "ContaChefe_email_key" ON "ContaChefe"("email");
CREATE UNIQUE INDEX "SessaoChefe_tokenHash_key" ON "SessaoChefe"("tokenHash");
CREATE INDEX "SessaoChefe_contaChefeId_idx" ON "SessaoChefe"("contaChefeId");
CREATE INDEX "SessaoChefe_expiraEm_idx" ON "SessaoChefe"("expiraEm");

-- AddForeignKey
ALTER TABLE "ContaChefe" ADD CONSTRAINT "ContaChefe_monitorId_fkey"
  FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessaoChefe" ADD CONSTRAINT "SessaoChefe_contaChefeId_fkey"
  FOREIGN KEY ("contaChefeId") REFERENCES "ContaChefe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
