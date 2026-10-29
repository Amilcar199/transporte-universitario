# ADR 0003 — PostgreSQL em produção, PGlite em desenvolvimento e testes

- **Estado**: aceite
- **Data**: 2026-10-29

## Contexto

O ambiente de desenvolvimento actual não tem PostgreSQL nem Docker. Os invariantes críticos (lugares, pagamentos, QR) dependem de índices únicos parciais e de `SELECT … FOR UPDATE`, que só existem em PostgreSQL.

## Decisão

- `DATABASE_URL=postgres://…` usa PostgreSQL através de `node-postgres`.
- `DATABASE_URL=pglite:./data/dev` usa o PGlite (PostgreSQL compilado para WASM) guardado em disco; `pglite:memory` usa-o em memória nos testes.
- O mesmo esquema e as mesmas migrações servem os dois.
- Em produção, a API recusa arrancar com PGlite.

## Consequências

- Qualquer pessoa corre a API e os testes só com Node.js.
- O PGlite executa as transacções em série, por isso a concorrência real não é testada localmente. Antes de produção, os testes devem ser repetidos contra PostgreSQL.
