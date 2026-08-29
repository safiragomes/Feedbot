# Importação de alunos do Google Sheets

## Objetivo

Ao vincular ou revalidar a planilha de um período, o chefe deve poder importar os nomes e as
matrículas das abas das turmas, evitando um segundo cadastro manual.

## Comportamento

1. Depois de validar a estrutura da planilha, a API lê em cada aba as colunas cujos cabeçalhos
   sejam `Nome` e `Matrícula` (ignorando caixa e acentos).
2. Linhas cuja matrícula não tenha exatamente 11 dígitos são descartadas e não aparecem na
   prévia. Linhas com matrícula válida, mas sem nome, aparecem como inválidas e não são importadas.
3. Matrículas repetidas na planilha são exibidas como duplicadas e não são importadas.
4. A prévia classifica cada linha válida como nova ou já cadastrada.
5. Um aluno já cadastrado no mesmo período não é alterado pela importação e conserva todos os
   seus dados no Feedbot.
6. Uma matrícula já usada em outro período é conflito e não pode ser importada, pois matrícula é
   globalmente única no modelo.
7. Alunos novos são pré-cadastrados sem dupla. A dupla pode ser atribuída depois pelo drawer do
   aluno, antes que ele participe do fluxo de feedback.
8. A confirmação relê a planilha para não confiar em dados de prévia enviados pelo navegador e
   cria somente alunos novos e explicitamente selecionados em uma transação.
9. Alunos ausentes da planilha nunca são removidos ou desativados automaticamente.
10. O limite é de 2.000 linhas de alunos por planilha.

## Contrato HTTP

- `GET /periodos/:id/planilha/alunos/previa`: retorna a prévia da planilha já vinculada.
- `POST /periodos/:id/planilha/alunos/importar`: confirma a importação.

## Casos de borda

- Cabeçalho ausente em qualquer aba impede a prévia e informa a aba problemática.
- Linhas totalmente vazias são ignoradas.
- Matrículas numéricas retornadas pelo Sheets são normalizadas sem `.0`.
- Um aluno sem dupla não pode receber monitor da semana nem ter feedback registrado.
- Novos alunos vêm selecionados por padrão, mas o chefe pode desmarcar indivíduos ou todos antes
  da confirmação.
