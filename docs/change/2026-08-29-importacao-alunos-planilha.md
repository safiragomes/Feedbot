# Importação de alunos a partir da planilha

## Contexto

Depois de conectar o Google Sheets, nomes e matrículas ainda precisavam ser cadastrados uma
segunda vez no Feedbot. A mudança implementa a spec
[`importacao-alunos-google-sheets.md`](../specs/importacao-alunos-google-sheets.md).

## O que mudou

- A validação do vínculo agora também exige uma coluna `Nome` ou `Aluno` em cada aba de turma.
- A API lê até 2.000 alunos, normaliza matrículas e produz uma prévia com novos, atualizações,
  itens inalterados, duplicados, inválidos e conflitos entre períodos.
- Somente matrículas com exatamente 11 dígitos entram na prévia; rodapés e demais linhas fora
  desse padrão são descartados antes da importação.
- A confirmação relê o Sheets e cria somente matrículas novas em uma transação; alunos existentes
  aparecem como `já cadastrado` e não são alterados.
- Novos alunos são pré-cadastrados sem dupla e podem ser atribuídos depois no drawer do aluno.
- Alunos existentes preservam dupla, PCD, meta e monitor da semana A.
- O vínculo `Aluno → Dupla` passou a ser opcional; excluir uma dupla preserva o cadastro do aluno
  como não atribuído.
- A página de Planilha ganhou resumo, tabela de prévia e confirmação explícita.
- A tabela de prévia pode ser filtrada por turma e por situação, incluindo uma visão somente dos
  alunos novos.
- A prévia exibe todas as linhas da seleção, mantendo rolagem interna sem truncar em 100 itens.
- Após a confirmação, o próprio painel exibe uma resposta visual persistente com a quantidade de
  alunos cadastrados, e o botão indica quando não há novos alunos pendentes.
- Cada aluno novo pode ser marcado ou desmarcado antes da confirmação; o backend relê a planilha e
  aceita somente as matrículas explicitamente selecionadas.

## Verificação

- `pnpm test`: 81 testes aprovados (76 API + 5 web).
- `pnpm lint`: aprovado.
- `pnpm typecheck`: aprovado.
- Testes de domínio cobrem cabeçalho fora da primeira linha, acentos, matrículas numéricas,
  linhas vazias e linhas inválidas.
