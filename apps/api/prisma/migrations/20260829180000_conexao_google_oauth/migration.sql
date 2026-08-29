CREATE TABLE "ConexaoGoogle" (
  "id" TEXT NOT NULL DEFAULT 'principal',
  "email" TEXT NOT NULL,
  "refreshTokenCriptografado" TEXT NOT NULL,
  "conectadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConexaoGoogle_pkey" PRIMARY KEY ("id")
);
