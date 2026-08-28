-- Completa períodos existentes sem alterar turmas que já possuam alunos ou
-- configurações. Novos períodos passam a criar estas três turmas pela API.
INSERT INTO "Turma" ("id", "periodoId", "nome", "nomeAbaPlanilha")
SELECT md5(p."id" || ':' || t.nome), p."id", t.nome, t.nome
FROM "Periodo" p
CROSS JOIN (VALUES ('CC/IA'), ('SI'), ('EC')) AS t(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM "Turma" existente
  WHERE existente."periodoId" = p."id" AND existente."nome" = t.nome
);
