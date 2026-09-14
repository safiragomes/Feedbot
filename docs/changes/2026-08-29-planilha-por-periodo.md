# Planilha online por período

## Objetivo

Permitir que cada período letivo tenha sua própria planilha Google vinculada pela interface, sem
depender de um ID global no ambiente da API.

## Fluxo

- O chefe abre **Gestão → Planilha**, conecta uma conta Google por OAuth e cola o link.
- A autorização solicita acesso offline; o refresh token fica criptografado no banco e pode ser
  revogado pela própria interface.
- A API valida o acesso, as abas internas das turmas, a coluna de matrícula e as colunas
  `Questões corretas` das seis listas antes de salvar o vínculo.
- Ao trocar a planilha, o cache de colunas é apagado e reconstruído automaticamente.
- O vínculo também pode ser removido pela interface.

## Escrita segura

- O período do feedback determina a planilha; não existe mais ID global para todos os períodos.
- A turma determina a aba `Notas Interno <turma>`.
- O aluno é encontrado por matrícula, com normalização de valores numéricos retornados pelo Google.
- Somente o valor de `Feedback.qtdQuestoesPontuadas` é escrito em `Questões corretas`.
- A coluna adjacente `Nota` permanece intocada e continua calculada pela fórmula da planilha.
- O bot aguarda o resultado da sincronização e informa quando o feedback foi salvo, mas a planilha
  não pôde ser atualizada.
