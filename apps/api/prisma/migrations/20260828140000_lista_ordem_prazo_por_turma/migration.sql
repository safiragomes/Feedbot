-- Lista deixa de ter um único prazoEntregaFeedback por (periodo, lista) — o mesmo
-- conjunto de listas agora vale para todas as turmas do período, mas cada turma pode
-- ter um prazo diferente para a mesma lista (PrazoLista). A ordem que antes vinha de
-- prazoEntregaFeedback (usada para decidir semana A/B) passa a morar em Lista.ordem,
-- turma-independente, já que o prazo deixou de ser único por lista.

-- CreateTable
CREATE TABLE "PrazoLista" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "prazoEntregaFeedback" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrazoLista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrazoLista_listaId_turmaId_key" ON "PrazoLista"("listaId", "turmaId");

-- AddForeignKey
ALTER TABLE "PrazoLista" ADD CONSTRAINT "PrazoLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrazoLista" ADD CONSTRAINT "PrazoLista_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn (nullable até o backfill terminar)
ALTER TABLE "Lista" ADD COLUMN "ordem" INTEGER;

-- Backfill Lista.ordem a partir da ordem antiga por prazo (turma-independente,
-- já que hoje só existe um prazo por lista)
UPDATE "Lista" AS l
SET "ordem" = sub."ordem"
FROM (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "periodoId" ORDER BY "prazoEntregaFeedback" ASC, "id" ASC
  ) AS "ordem"
  FROM "Lista"
) AS sub
WHERE l."id" = sub."id";

-- Backfill PrazoLista: uma linha por (lista, turma do mesmo período), reaproveitando
-- o prazo único que a lista tinha antes — preserva o comportamento atual (mesmo
-- prazo pra todas as turmas) até o chefe ajustar por turma. Períodos sem turma ainda
-- cadastrada simplesmente não geram nenhuma linha aqui (não há turma pra ter prazo).
INSERT INTO "PrazoLista" ("id", "listaId", "turmaId", "prazoEntregaFeedback")
SELECT gen_random_uuid()::text, l."id", t."id", l."prazoEntregaFeedback"
FROM "Lista" l
JOIN "Turma" t ON t."periodoId" = l."periodoId";

-- ordem passa a ser obrigatória e única por período
ALTER TABLE "Lista" ALTER COLUMN "ordem" SET NOT NULL;
CREATE UNIQUE INDEX "Lista_periodoId_ordem_key" ON "Lista"("periodoId", "ordem");

-- DropColumn
ALTER TABLE "Lista" DROP COLUMN "prazoEntregaFeedback";
