-- DropForeignKey
ALTER TABLE "Lista" DROP CONSTRAINT "Lista_periodoId_fkey";

-- DropForeignKey
ALTER TABLE "MapeamentoPlanilhaLista" DROP CONSTRAINT "MapeamentoPlanilhaLista_listaId_fkey";

-- DropForeignKey
ALTER TABLE "MapeamentoPlanilhaLista" DROP CONSTRAINT "MapeamentoPlanilhaLista_turmaId_fkey";

-- DropForeignKey
ALTER TABLE "Turma" DROP CONSTRAINT "Turma_periodoId_fkey";

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lista" ADD CONSTRAINT "Lista_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoPlanilhaLista" ADD CONSTRAINT "MapeamentoPlanilhaLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoPlanilhaLista" ADD CONSTRAINT "MapeamentoPlanilhaLista_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;
