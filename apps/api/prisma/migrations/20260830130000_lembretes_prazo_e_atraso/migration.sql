ALTER TABLE "LembreteAtraso" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'ATRASO';

DROP INDEX "LembreteAtraso_alunoId_listaId_key";

CREATE UNIQUE INDEX "LembreteAtraso_alunoId_listaId_tipo_key"
ON "LembreteAtraso"("alunoId", "listaId", "tipo");
