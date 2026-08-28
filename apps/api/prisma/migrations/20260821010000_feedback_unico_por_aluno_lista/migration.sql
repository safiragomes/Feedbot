-- Impede feedback duplicado: um monitor (ou dois monitores diferentes, por engano)
-- registrando mais de uma vez o mesmo aluno na mesma lista. criarFeedback (services/
-- feedback.ts) traduz a violação dessa constraint numa mensagem amigável.

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_alunoId_listaId_key" ON "Feedback"("alunoId", "listaId");
