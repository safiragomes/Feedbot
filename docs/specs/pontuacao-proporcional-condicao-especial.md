# Pontuação proporcional para PCD/ND

## Objetivo

Alunos marcados manualmente pelo chefe como PCD/ND atingem a pontuação máxima realizando 2/3 da
lista. A planilha não informa essa condição e nunca deve ser usada para inferi-la.

## Regras

1. O feedback conserva no banco a quantidade real de questões corretas.
2. Para aluno comum, o valor enviado ao Sheets é a quantidade real.
3. Para aluno PCD/ND, o equivalente enviado é `min(total da lista, acertos / (2/3))`, arredondado
   para duas casas decimais.
4. Acertos acima de 2/3 não geram valor acima do total da lista.
5. O chefe pode ativar ou desativar a condição especial no perfil do aluno depois da importação.
6. Alterar a condição não modifica feedbacks históricos; o novo equivalente é usado na próxima
   sincronização desse feedback com o Sheets.

## Exemplos para lista de 6 questões

| Acertos reais | Comum | PCD/ND |
| ------------- | ----- | ------ |
| 0             | 0     | 0      |
| 3             | 3     | 4,5    |
| 4             | 4     | 6      |
| 5             | 5     | 6      |
| 6             | 6     | 6      |
