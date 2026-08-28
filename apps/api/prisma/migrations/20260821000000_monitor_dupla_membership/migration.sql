-- Um monitor pertence a no máximo uma dupla (a dupla de monitores que atende os
-- alunos dela). Para cada aluno, escolhe-se qual dos até 2 monitores da dupla é o
-- da semana A (Aluno.monitorSemanaAId); o outro é implicitamente o da semana B — por
-- isso a coluna monitorSemanaBId deixa de existir.

-- AddColumn
ALTER TABLE "Monitor" ADD COLUMN "duplaId" TEXT;

-- Backfill: infere a dupla de cada monitor a partir de onde ele já aparecia como
-- monitor A ou B de algum aluno (o par costuma ser uniforme dentro da dupla).
UPDATE "Monitor" AS m
SET "duplaId" = sub."duplaId"
FROM (
  SELECT "monitorSemanaAId" AS "monitorId", "duplaId" FROM "Aluno" WHERE "monitorSemanaAId" IS NOT NULL
  UNION
  SELECT "monitorSemanaBId" AS "monitorId", "duplaId" FROM "Aluno" WHERE "monitorSemanaBId" IS NOT NULL
) AS sub
WHERE m.id = sub."monitorId";

-- AddForeignKey
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_duplaId_fkey" FOREIGN KEY ("duplaId") REFERENCES "Dupla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Aluno" DROP CONSTRAINT "Aluno_monitorSemanaBId_fkey";

-- DropColumn
ALTER TABLE "Aluno" DROP COLUMN "monitorSemanaBId";
