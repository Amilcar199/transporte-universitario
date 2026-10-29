# UniRota — plataforma de transportes universitários (Angola)

> «UniRota» é uma marca **provisória**. Nome, cores e contactos estão em `packages/shared/src/brand.ts`.

A plataforma liga estudantes, motoristas e a equipa de operação. Os destinos são universidades e os preços são em kwanzas (AOA).

| Componente | Pasta | Estado |
| --- | --- | --- |
| API + base de dados | `apps/api` | Funcional e coberta por testes de integração |
| Painel administrativo web | `apps/admin` | Funcional, ligado à API |
| App móvel (estudante, motorista e validador de parceiro) | `apps/mobile` | Ver a secção «App móvel» |

Documentação:

- [`docs/01-auditoria-gareeda.md`](docs/01-auditoria-gareeda.md): auditoria do XAPK de referência.
- [`docs/02-arquitectura.md`](docs/02-arquitectura.md): arquitectura, segurança e invariantes.
- [`docs/03-integracoes-e-bloqueios.md`](docs/03-integracoes-e-bloqueios.md): o que está e o que **não** está integrado.
- [`docs/adr/`](docs/adr): decisões de arquitectura.

## Requisitos

- Node.js 22.12 ou superior (testado com 24.22.1) e npm.
- Não é preciso PostgreSQL para desenvolvimento: por omissão é usado o PGlite, guardado em `apps/api/data/`.

## Arranque local

```powershell
npm install

# 1. Configuração da API (o ficheiro .env nunca é versionado)
Copy-Item apps/api/.env.example apps/api/.env
# Editar apps/api/.env e gerar segredos com, por exemplo:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# para JWT_SECRET e PASS_TOKEN_SECRET (valores diferentes, com pelo menos 32 caracteres).

# 2. Base de dados (as migrações também correm no arranque da API)
npm run db:migrate

# 3. Dados de demonstração (opcional, recusado em produção)
npm run db:seed:demo
#   Mostra a palavra-passe gerada para as contas *@demo.unirota.invalid.
#   Para uma palavra-passe fixa local, defina SEED_DEMO_PASSWORD antes de correr.

# 4. Servidores
npm run dev:api     # http://localhost:4000  (verificação de estado: /health)
npm run dev:admin   # http://localhost:5173  (proxy de /api para a porta 4000)
```

Contas de demonstração (depois do passo 3): `admin@`, `operador@`, `gestor.uor@`, `financeiro@`, `motorista1@`, `motorista2@`, `estudante@` e `novo.estudante@demo.unirota.invalid`. Todos os registos de demonstração aparecem no painel com a etiqueta **DEMO**.

Para recomeçar com uma base vazia, pare a API e apague `apps/api/data/dev`.

## Verificação

```powershell
npm test            # testes de integração da API (Vitest + Fastify inject + PGlite real)
npm run typecheck   # shared, API e painel
npm run build:admin # build de produção do painel
```

Os testes de integração (21, em 4 ficheiros) cobrem:

- autenticação, renovação e revogação de sessões e RBAC no servidor, incluindo pedidos recusados;
- o fluxo do administrador, de universidade até atribuição, com a persistência confirmada depois de reabrir a base;
- reservas com controlo de capacidade, duplicados e antecedência de cancelamento;
- o fluxo do motorista (iniciar, GPS só em viagem, terminar);
- pagamentos:
  - a transferência só é confirmada pelo financeiro;
  - a idempotência das chaves e dos eventos do fornecedor;
- o passe QR (estados, anti-reutilização, ausência de dados pessoais no token);
- intercidades (limite por período, modelos sem venda avulsa), âmbito dos validadores de parceiros e relatórios com RBAC.

### Testes de aceitação no browser

Com a API, o painel e a app web a correr e os dados de demonstração carregados, os scripts em `e2e/` conduzem o Chrome instalado no sistema (`playwright-core`, sem descarregar browsers). Só aceitam endereços `localhost` e criam registos de teste na base local. As credenciais vêm do ambiente:

```powershell
$env:E2E_ADMIN_EMAIL = "admin@demo.unirota.invalid"; $env:E2E_ADMIN_PASSWORD = "<palavra-passe do seed>"
$env:E2E_DRIVER_EMAIL = "motorista1@demo.unirota.invalid"; $env:E2E_DRIVER_PASSWORD = "<palavra-passe do seed>"
npm run e2e:admin   # universidade, paragens, rota ordenada, horário, activação, veículo, motorista, atribuição,
                    # persistência após recarregar, auditoria, duplicados recusados, 401/403 na API

$env:E2E_STUDENT_EMAIL = "estudante@demo.unirota.invalid"; $env:E2E_STUDENT_PASSWORD = "<palavra-passe do seed>"
npm run e2e:app     # plano com pagamento de teste, passe QR, reserva e duplicado recusado,
                    # motorista inicia a viagem de hoje, envia GPS, valida o passe e termina
```

O `e2e:app` altera o estado dos dados de demonstração: a viagem de hoje do motorista fica concluída e os passos do motorista são saltados (e assinalados como tal) numa segunda execução no mesmo dia.

## Produção (resumo)

- `NODE_ENV=production` exige `DATABASE_URL=postgres://…` e recusa o modo de pagamentos de teste e a exposição de códigos de recuperação.
- Os segredos vêm do ambiente do servidor (gestor de segredos ou variáveis do serviço) e nunca do repositório nem do painel.
- O painel é um build estático (`apps/admin/dist`). Sirva-o atrás do mesmo domínio que a API, ou configure `CORS_ORIGINS`.
- Antes de lançar:
  - repetir os testes contra PostgreSQL real;
  - configurar o IBAN oficial;
  - escolher um fornecedor de SMS/email;
  - contratar um fornecedor autorizado para Multicaixa Express/PayPay.

  Ver [`docs/03-integracoes-e-bloqueios.md`](docs/03-integracoes-e-bloqueios.md).

## App móvel

```powershell
npm run install:mobile   # dependências próprias da app (Expo SDK 54)
npm run dev:mobile       # http://localhost:8081 no browser
npm run typecheck:mobile
```

Detalhes, uso com Expo Go e limitações em [`apps/mobile/README.md`](apps/mobile/README.md).
