# ADR 0002 — TypeScript em todo o lado, monorepo npm e app móvel separada

- **Estado**: aceite
- **Data**: 2026-10-29

## Decisão

- **Monorepo npm workspaces** com `packages/shared`, `apps/api` e `apps/admin`. Não há ferramentas de monorepo adicionais.
- **API**: Fastify 5 + Zod + Drizzle ORM. O SQL fica explícito, as migrações são geradas e versionadas, e há poucas dependências.
- **Painel**: React + Vite + React Router. Sem biblioteca de componentes: o CSS usa as variáveis da marca.
- **App**: Expo SDK 54 (a mesma família tecnológica observada no XAPK), num projecto npm próprio (`apps/mobile`). Fica fora dos workspaces para que o Metro e as versões nativas do React Native não colidam com o React do painel. Consome `packages/shared` por dependência `file:`.
- O código partilhado é importado como TypeScript (`.ts`) directamente; `tsx`, Vite e Metro compilam-no sem passo de build.

## Alternativas consideradas

- NestJS: mais estrutura do que o necessário nesta fase.
- Prisma: gera cliente binário e esconde o SQL. Drizzle é mais leve e funciona com PGlite e PostgreSQL com o mesmo esquema.
