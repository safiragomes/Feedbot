CREATE TABLE "RecuperacaoSenha" (
    "id" TEXT NOT NULL,
    "contaChefeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecuperacaoSenha_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecuperacaoSenha_tokenHash_key" ON "RecuperacaoSenha"("tokenHash");
CREATE INDEX "RecuperacaoSenha_contaChefeId_idx" ON "RecuperacaoSenha"("contaChefeId");
CREATE INDEX "RecuperacaoSenha_expiraEm_idx" ON "RecuperacaoSenha"("expiraEm");
ALTER TABLE "RecuperacaoSenha" ADD CONSTRAINT "RecuperacaoSenha_contaChefeId_fkey" FOREIGN KEY ("contaChefeId") REFERENCES "ContaChefe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
