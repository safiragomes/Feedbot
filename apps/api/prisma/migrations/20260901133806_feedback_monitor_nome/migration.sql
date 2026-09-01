-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "monitorNome" TEXT;

-- Backfill: retrato do nome do monitor que já existia em cada feedback, ou um
-- rótulo genérico para feedback cujo monitor já tinha sido excluído antes desta
-- coluna existir (monitorId já null, sem como recuperar o nome original).
UPDATE "Feedback" f
SET "monitorNome" = COALESCE(m."nome", 'Monitor removido')
FROM "Monitor" m
WHERE m.id = f."monitorId";

UPDATE "Feedback"
SET "monitorNome" = 'Monitor removido'
WHERE "monitorNome" IS NULL;

ALTER TABLE "Feedback" ALTER COLUMN "monitorNome" SET NOT NULL;
