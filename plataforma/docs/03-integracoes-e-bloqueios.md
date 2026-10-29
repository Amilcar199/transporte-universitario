# Integrações externas e bloqueios

Estado real de cada dependência externa. «Não configurado» significa que a plataforma não finge que funciona: a opção aparece indisponível com a explicação.

| Integração | Estado | O que falta |
| --- | --- | --- |
| Transferência bancária (IBAN) | Funcional, com confirmação manual pelo financeiro | Conta bancária oficial: preencher `BANK_TRANSFER_IBAN` e `BANK_TRANSFER_BENEFICIARY`. Sem estes valores, o método fica indisponível. |
| Multicaixa Express | **Não integrado** | Contrato com um agregador ou fornecedor autorizado (por exemplo, através da EMIS), credenciais de teste, documentação da API e do webhook. O ponto de integração é `apps/api/src/payments/providers.ts`, com eventos registados em `payment_events`. |
| PayPay | **Não integrado** | O mesmo que para o Multicaixa Express. |
| Pagamentos de teste (`sandbox`) | Funcional apenas em desenvolvimento | Simulação explícita; recusada em produção. |
| Envio de SMS/email (recuperação de palavra-passe, avisos) | **Não configurado** | Fornecedor de SMS em Angola ou serviço de email. Em desenvolvimento, `DEV_EXPOSE_RESET_CODES=true` devolve o código na resposta (recusado em produção). As notificações ficam guardadas na aplicação (`/notifications`). |
| Notificações push | **Não configurado** | Expo Push / FCM exige um projecto EAS e credenciais Firebase. |
| Mapas | Coordenadas e distâncias calculadas no servidor; sem mapa interactivo | Mosaicos de mapa (OpenStreetMap com política de utilização adequada, ou Google Maps com chave). A app mostra a posição em texto e a distância à paragem. |
| GPS do motorista | Recepção, validação e consulta testadas na API; envio testado na versão web da app com geolocalização simulada pelo Chrome (`npm run e2e:app`) | Teste em dispositivo físico com `expo-location`. Ainda não foi testado num telemóvel. |
| Builds nativos Android/iOS | Não feitos | O ambiente não tem Android SDK nem Java. Usar EAS Build ou uma máquina com Android Studio. A app corre em Expo Go e no browser. |
| Transportadoras parceiras | Gestão no painel, veículos associados e validadores com âmbito restrito às viagens desses veículos (testado na API) | Nenhuma transportadora real está registada e nenhuma é apresentada como parceira. Registar só empresas com acordo assinado. O modo validador da app não foi exercitado no browser por falta de uma conta de validador de demonstração. |
| Intercidades | Rotas do tipo «Intercidades», sempre com reserva, cobertas apenas pelos modelos de plano «incluídas» e «créditos», com limite por período verificado no servidor (testado na API) | A venda de bilhetes avulsos (modelos «desconto» e «pago à parte») exige um fluxo de pagamento por viagem que ainda não existe; até lá a reserva é recusada com essa explicação. |

## Dados de demonstração

O comando `npm run db:seed:demo` cria registos marcados com `is_demo = true`, identificados no painel com a etiqueta **DEMO**:

- **Reais, com dados aproximados**: as universidades (Óscar Ribas, ISPTEC, UAN) existem, mas as coordenadas são aproximadas.
- **Fictícios**: rotas, paragens, horários, veículos, motoristas, planos e preços.
- **Contas**: usam o domínio reservado `demo.unirota.invalid`, que não recebe email.
