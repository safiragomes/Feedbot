-- O v3nculo de monitor da semana A/B passa de Dupla para Aluno: um monitor pode ser
-- responsavel pela semana A de um aluno e pela semana B de outro (possivelmente em
-- duplas diferentes). Antes de remover as colunas antigas, migra os dados existentes.

-- AddColumn
ALTER TABLE "Aluno" ADD COLUMN "monitorSemanaAId" TEXT;
ALTER TABLE "Aluno" ADD COLUMN "monitorSemanaBId" TEXT;

-- Backfill: cada aluno herda o monitor A/B da dupla em que estava.
UPDATE "Aluno" AS a
SET "monitorSemanaAId" = d."monitorSemanaAId",
    "monitorSemanaBId" = d."monitorSemanaBId"
FROM "Dupla" AS d
WHERE a."duplaId" = d.id;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_monitorSemanaAId_fkey" FOREIGN KEY ("monitorSemanaAId") REFERENCES "Monitor"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_monitorSemanaBId_fkey" FOREIGN KEY ("monitorSemanaBId") REFERENCES "Monitor"(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Dupla" DROP CONSTRAINT "Dupla_monitorSemanaAId_fkey";
ALTER TABLE "Dupla" DROP CONSTRAINT "Dupla_monitorSemanaBId_fkey";
ALTER TABLE "Monitor" DROP CONSTRAINT "Monitor_duplaId_fkey";

-- DropIndex
DROP INDEX "Dupla_monitorSemanaAId_key";
DROP INDEX "Dupla_monitorSemanaBId_key";

-- DropColumn
ALTER TABLE "Dupla" DROP COLUMN "monitorSemanaAId";
ALTER TABLE "Dupla" DROP COLUMN "monitorSemanaBId";
ALTER TABLE "Monitor" DROP COLUMN "duplaId";
