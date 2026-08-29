-- Cada monitor-chefe pode responder por somente um grupo em cada período.
CREATE UNIQUE INDEX "GrupoRevisao_periodoId_chefeId_key"
ON "GrupoRevisao"("periodoId", "chefeId");
