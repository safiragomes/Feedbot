# Specs (Spec-Driven Development)

Este projeto é desenvolvido no modelo **SDD (Spec-Driven Development)**: nenhuma feature é implementada sem uma spec escrita antes, e os testes (TDD) são derivados diretamente dessa spec.

## Hierarquia de specs

1. **Spec mestra** — `monitoria-especificacao.md` (raiz do repositório). Define o domínio completo: modelo de dados, fluxo do bot, permissões, integração com a planilha, dashboards e stack. É a fonte da verdade sobre _o que o sistema faz_.
2. **Specs de feature** — arquivos neste diretório (`docs/specs/`), um por feature ou fatia vertical de uma fase do `plano-desenvolvimento.md` (ex: `feedback-registro-bot.md`, `gestao-crud-grupos.md`, `sheets-resolucao-mapeamento.md`). Cada uma detalha, no nível de comportamento observável, o suficiente para escrever os testes antes do código: entradas, saídas esperadas, regras de negócio envolvidas (citando a seção correspondente da spec mestra) e casos de borda.
3. **ADRs** (`docs/adr/`) — decisões arquiteturais que não são comportamento de feature, mas afetam como o sistema é construído.

## Fluxo de trabalho esperado

Para cada fatia de trabalho (tipicamente um item de uma fase do `plano-desenvolvimento.md`):

1. **Spec** — escrever/atualizar a spec de feature em `docs/specs/`, detalhando comportamento e casos de borda a partir da spec mestra.
2. **Red** — escrever os testes (unitários/integração) derivados da spec, e confirmar que falham (nada foi implementado ainda).
3. **Green** — implementar o mínimo necessário para os testes passarem.
4. **Refactor** — limpar a implementação mantendo os testes verdes.
5. **Change record** — registrar a entrega em `docs/changes/`, referenciando a spec e, se aplicável, o ADR relacionado.

## Template de spec de feature

```markdown
# Nome da feature

Ref: monitoria-especificacao.md § N.N

## Comportamento esperado

...

## Regras de negócio envolvidas

...

## Casos de borda

...

## Fora de escopo

...
```
