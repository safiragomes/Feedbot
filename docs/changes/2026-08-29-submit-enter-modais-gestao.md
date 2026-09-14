# Confirmação por Enter nos modais de gestão

Data: 2026-08-29

## Mudança

Os modais de criação e edição da gestão agora usam formulários HTML. Pressionar `Enter` em um
campo executa a mesma validação e ação do botão principal. Quando a operação termina com sucesso,
o modal é fechado pelo fluxo já existente.

O comportamento foi aplicado a grupo, dupla, aluno, atribuição e cadastro de monitor, edição de
lista e criação de login. Os botões de cancelamento foram marcados explicitamente para não
submeter o formulário.

## Verificação

- Typecheck e build do frontend.
- ESLint do monorepo.
