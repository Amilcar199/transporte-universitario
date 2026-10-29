# Arquitectura

## Visão geral

Três interfaces partilham uma API e uma base de dados:

| Interface | Tecnologia | Utilizadores |
| --- | --- | --- |
| Painel administrativo (`apps/admin`) | React 19 + Vite, SPA | Administrador geral, operador, gestor de universidade, financeiro |
| App móvel (`apps/mobile`) | Expo SDK 54 (React Native), modos estudante e motorista | Estudantes, motoristas |
| API (`apps/api`) | Node.js 22+, Fastify 5, Drizzle ORM | Consumida pelas duas interfaces |

O pacote `packages/shared` contém a marca provisória, os perfis e permissões, os valores de domínio e as etiquetas em português. A API, o painel e a app importam os mesmos valores, por isso um estado novo é adicionado num único sítio.

```
apps/admin ─┐
            ├── HTTPS /api/v1 ──► apps/api ──► PostgreSQL (produção) | PGlite (desenvolvimento/testes)
apps/mobile ┘                       │
                                    └── packages/shared (marca, perfis, domínio)
```

## API

- **Prefixo**: `/api/v1`. Verificação de estado em `/health`.
- **Composição**: `src/app.ts` regista os módulos de rotas; `src/server.ts` valida o ambiente, abre a base, aplica migrações e arranca. O relógio (`ctx.now`) é injectável para testar expirações.
- **Módulos**:
  - `auth.ts`: registo de estudante, início de sessão, renovação, sessões por dispositivo, recuperação de palavra-passe.
  - `admin-network.ts`: universidades, paragens, rotas, paragens ordenadas e horários.
  - `admin-fleet.ts`: veículos e motoristas.
  - `admin-trips.ts`: viagens, atribuições e cancelamentos.
  - `admin-people.ts`: equipa, estudantes e verificações universitárias.
  - `admin-misc.ts`: visão geral, auditoria e definições.
  - `student.ts`: catálogo público, verificação, reservas e acompanhamento.
  - `driver.ts`: viagens atribuídas, iniciar/terminar, GPS e embarque.
  - `billing-student.ts` e `billing-admin.ts`: planos, subscrições, pagamentos e reembolsos.
  - `passes.ts`: passe digital, token QR e validação, com o âmbito de cada validador (`validatorTripScope`).
  - `admin-partners.ts`: transportadoras parceiras.
  - `admin-reports.ts`: relatórios de ocupação, validações, ocorrências e subscrições; os totais de pagamentos só aparecem a perfis com `payments.read`.
  - `incidents.ts`: ocorrências e notificações na aplicação.
- **Serviços partilhados**: `services/coverage.ts` é o único dono da regra «este plano cobre esta rota?» (universidades da subscrição, rota fixa do plano, modelos de intercidades e respectivo limite). A reserva e a validação do passe usam-no; nenhuma das duas reinterpreta o plano.
- **Subconsultas correlacionadas**: em selects sem joins o Drizzle escreve as colunas sem nome de tabela. As referências à tabela exterior usam `qualified()` (`src/lib.ts`), caso contrário um `id` dentro da subconsulta referiria a tabela interior.
- **Erros**: respostas `{ error: { code, message, details } }` com mensagens em português. As violações de restrições da base (unicidade, chaves estrangeiras, verificações) são traduzidas por nome de restrição.

## Segurança e autorização

- Palavras-passe com scrypt. Token de acesso JWT HS256 de 15 minutos. Refresh token opaco guardado como hash SHA-256 e rodado a cada renovação.
- **Cada pedido autenticado confirma na base** que a sessão não foi revogada e que a conta está activa. Desactivar uma conta ou terminar uma sessão tem efeito imediato.
- **Autorização no servidor**: `can(...permissões)` em cada rota, com o mapa de permissões por perfil em `packages/shared/src/roles.ts`. O painel só esconde secções por conveniência. As recusas ficam registadas na auditoria (`access.denied`).
- O gestor de universidade só vê estudantes e verificações das universidades que lhe foram atribuídas.
- O motorista só vê, inicia e termina as suas viagens e não tem permissões financeiras nem de gestão de utilizadores. Só valida passes nas suas viagens.
- O validador de uma transportadora parceira só vê e valida viagens em curso feitas com veículos de transportadoras **activas** a que está associado. Desactivar a transportadora retira-lhe o acesso de imediato.
- Limite de pedidos por IP nos endpoints de autenticação. Os registos do servidor ocultam cabeçalhos de autorização e palavras-passe. A auditoria nunca guarda segredos.

## Base de dados

O esquema está em `apps/api/src/db/schema.ts` e as migrações SQL em `apps/api/drizzle/`, geradas por `drizzle-kit`. As migrações são aplicadas no arranque.

Os invariantes críticos são garantidos pela base, não só pelo código:

| Invariante | Mecanismo |
| --- | --- |
| Um lugar não é vendido duas vezes | Índice único parcial `(trip_id, seat_number)` para reservas confirmadas ou embarcadas |
| Um estudante não reserva a mesma viagem duas vezes | Índice único parcial `(trip_id, student_id)` |
| Motorista e veículo não têm duas viagens à mesma hora | Índices únicos parciais por data e hora, excluindo canceladas |
| Uma subscrição aberta por estudante | Índice único parcial sobre `pending_payment`, `active` e `suspended` |
| Pagamentos sem duplicados | Índice único `(student_id, idempotency_key)` e referência única por método |
| Eventos de fornecedor processados uma vez | Índice único `(method, external_event_id)` |
| O mesmo QR não é aceite duas vezes | Índice único parcial sobre o `jti` das validações autorizadas |
| Notificações sem duplicados | Índice único parcial `(user_id, dedupe_key)` |
| Destino pertence a uma universidade; coordenadas e capacidades válidas | Restrições `CHECK` |

As reservas bloqueiam a viagem (`SELECT … FOR UPDATE`) antes de contar os lugares. Por isso, pedidos concorrentes são serializados por viagem.

A preferência é desactivar, não eliminar: universidades, paragens, veículos, contas e planos têm estado activo/inactivo, e as viagens são canceladas com motivo.

## Fluxos principais

1. **Rede**: a rota é criada como rascunho. Só pode ser activada com pelo menos uma universidade, duas paragens, o destino na posição correcta e um horário activo.
2. **Atribuição**: viagem = rota activa + horário válido para o dia + veículo operacional + motorista activo. A capacidade vendável é a do veículo e fica fixada na viagem.
3. **Estudante**:
   1. Regista-se e pede a verificação universitária; um gestor aprova.
   2. Subscreve um plano e paga.
   3. Depois da confirmação do pagamento pelo servidor, reserva lugar.
4. **Pagamento**: só fica confirmado por acção do financeiro (transferência) ou por evento idempotente do fornecedor. Nesse momento a subscrição é activada e o passe é emitido.
5. **Motorista**:
   1. Vê as viagens atribuídas e inicia-as (até 60 minutos antes da hora).
   2. Envia GPS apenas enquanto a viagem está em curso.
   3. Valida passes ou marca embarques e termina a viagem; quem tinha reserva e não embarcou fica como «não compareceu».
6. **Passe digital**:
   - O QR contém um JWT de 60 segundos com o identificador do passe e um `jti` único. Não contém nome, email, dados financeiros nem credenciais.
   - A validação devolve o estado (autorizado, expirado, suspenso, revogado, não abrangido, reserva necessária, inválido), o primeiro nome com a inicial do apelido e o lugar.
   - O `jti` é consumido: reutilizar o mesmo QR é recusado.
7. **Intercidades**: rotas com `service_type = intercity`, sem universidades nem sentido. Exigem sempre reserva e só são cobertas pelos modelos de plano «incluídas» e «créditos». O limite de viagens por período da subscrição é contado com a subscrição bloqueada (`FOR UPDATE`). Um plano mensal nunca concede intercidades ilimitadas.

## Marca provisória

O nome «UniRota», as cores e o monograma estão em `packages/shared/src/brand.ts`. O painel aplica-os como variáveis CSS e a app lê o mesmo objecto. Trocar a marca é alterar esse ficheiro (e os ícones da app em `apps/mobile/assets`).

## Limitações conhecidas

- **PGlite** (PostgreSQL compilado para WASM) é usado em desenvolvimento e nos testes porque o ambiente não tem PostgreSQL nem Docker. O PGlite executa as transacções em série, por isso os testes não exercitam concorrência real. Em produção os índices únicos parciais e o `FOR UPDATE` funcionam em PostgreSQL, mas esse cenário ainda não foi testado contra um servidor PostgreSQL.
- As tarefas periódicas (expirar subscrições) correm no processo da API, de hora a hora. Com várias instâncias, deve passar para um agendador externo.
