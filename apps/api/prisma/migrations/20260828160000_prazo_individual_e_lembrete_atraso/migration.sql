CREATE TABLE "PrazoAlunoLista" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "prazoEntregaFeedback" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrazoAlunoLista_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LembreteAtraso" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LembreteAtraso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrazoAlunoLista_alunoId_listaId_key" ON "PrazoAlunoLista"("alunoId", "listaId");
CREATE UNIQUE INDEX "LembreteAtraso_alunoId_listaId_key" ON "LembreteAtraso"("alunoId", "listaId");
ALTER TABLE "PrazoAlunoLista" ADD CONSTRAINT "PrazoAlunoLista_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrazoAlunoLista" ADD CONSTRAINT "PrazoAlunoLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LembreteAtraso" ADD CONSTRAINT "LembreteAtraso_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LembreteAtraso" ADD CONSTRAINT "LembreteAtraso_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
