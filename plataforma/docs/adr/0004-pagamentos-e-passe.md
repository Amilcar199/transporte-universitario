# ADR 0004 — Pagamentos confirmados pelo servidor e passe com QR de curta duração

- **Estado**: aceite
- **Data**: 2026-10-29

## Pagamentos

- Uma subscrição só fica activa quando o servidor confirma o pagamento:
  - por acção do financeiro, no caso da transferência bancária;
  - por evento do fornecedor, registado em `payment_events` com unicidade por `(método, id externo)`.
- A confirmação (`services/billing.ts › confirmPayment`) bloqueia o pagamento e é idempotente: repetir a confirmação devolve `already_confirmed`, sem prolongar a subscrição nem emitir outro passe.
- O cliente envia uma chave de idempotência por intenção de pagamento. Repetir o pedido devolve o mesmo pagamento.
- **Multicaixa Express e PayPay ficam indisponíveis** até existir contrato com um fornecedor autorizado, credenciais de teste oficiais e documentação da API. Não foi inventada nenhuma API.
- O método `sandbox` existe apenas para testes. Exige `PAYMENTS_SANDBOX_ENABLED=true`, é recusado em produção e aparece sempre identificado como teste.

## Passe digital

- O passe tem um código público opaco; a validade vem da subscrição, avaliada no momento da validação.
- O QR contém um JWT HS256, assinado com `PASS_TOKEN_SECRET` e válido 60 segundos, com apenas `pid` (identificador do passe) e `jti`.
- A validação é feita pelo servidor e o `jti` de cada validação autorizada é único. Por isso, uma captura de ecrã reutilizada é recusada.
- A resposta de validação devolve apenas o resultado, o primeiro nome com a inicial do apelido e o lugar reservado, sem histórico nem dados financeiros.
- **Limitação**: a validação exige ligação à API. A validação offline exigiria assinatura assimétrica e listas de revogação no dispositivo e fica para uma fase posterior.
