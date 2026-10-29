# ADR 0001 — Reconstruir em vez de reutilizar o código do XAPK

- **Estado**: aceite
- **Data**: 2026-10-29

## Contexto

O ficheiro `Gareeda_1.0.1_APKPure.xapk` contém uma app React Native/Expo compilada para bytecode Hermes v96. Não contém o código-fonte original (ver `docs/01-auditoria-gareeda.md`). O backend da Gareeda não está no ficheiro e não temos autorização para o usar.

## Decisão

Usar o XAPK apenas como referência funcional: ecrãs, fluxos e nomes de endpoints observados. Todo o código é escrito de raiz, com marca própria e provisória, sem copiar recursos gráficos, textos de marca nem chaves encontradas no pacote.

## Consequências

- Não há dependência de um backend de terceiros nem risco de reutilizar credenciais embutidas.
- Os fluxos foram redesenhados para Angola: AOA, verificação universitária, pagamentos locais e passe com protecção contra reutilização.
