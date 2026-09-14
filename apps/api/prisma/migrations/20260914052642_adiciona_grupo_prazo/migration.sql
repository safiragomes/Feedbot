-- AlterTable
ALTER TABLE "Aluno" ADD COLUMN     "grupoPrazoId" TEXT;

-- CreateTable
CREATE TABLE "GrupoPrazo" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "GrupoPrazo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrazoGrupoLista" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "grupoPrazoId" TEXT NOT NULL,
    "prazoEntregaFeedback" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrazoGrupoLista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrupoPrazo_periodoId_nome_key" ON "GrupoPrazo"("periodoId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "PrazoGrupoLista_listaId_grupoPrazoId_key" ON "PrazoGrupoLista"("listaId", "grupoPrazoId");

-- AddForeignKey
ALTER TABLE "GrupoPrazo" ADD CONSTRAINT "GrupoPrazo_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_grupoPrazoId_fkey" FOREIGN KEY ("grupoPrazoId") REFERENCES "GrupoPrazo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrazoGrupoLista" ADD CONSTRAINT "PrazoGrupoLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrazoGrupoLista" ADD CONSTRAINT "PrazoGrupoLista_grupoPrazoId_fkey" FOREIGN KEY ("grupoPrazoId") REFERENCES "GrupoPrazo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
