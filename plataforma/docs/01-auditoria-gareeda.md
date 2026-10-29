# Fase 1 — Auditoria técnica do XAPK da Gareeda

> Documento de análise interna. É o único sítio do projecto onde a marca Gareeda é referida.
> A aplicação final não reutiliza código, recursos visuais, textos nem serviços da Gareeda.

## 1. Inventário de ficheiros

| Ficheiro | Tamanho | Observação |
| --- | --- | --- |
| `Gareeda_1.0.1_APKPure.xapk` | 74 864 533 B | Original, intacto. SHA-256 `C13743866CC761424775D51978717C2D5C404925E685B444B1F730A7B79931E2` |

Não existia código-fonte, projecto descompilado nem backend na pasta. Os ficheiros de análise foram
extraídos para uma cópia em `analise/` (o XAPK original não foi alterado).

### Conteúdo do XAPK (contentor ZIP, `xapk_version` 2)

| APK | Tamanho | Conteúdo |
| --- | --- | --- |
| `com.gareeda.mobile.apk` (base) | 57 142 038 B | 5 ficheiros DEX, `assets/index.android.bundle`, configuração Expo, modelos ML Kit |
| `config.armeabi_v7a.apk` | 17 484 274 B | 27 bibliotecas nativas ARMv7 |
| `config.en.apk` | 82 329 B | Recursos de idioma inglês |
| `config.mdpi.apk` | 100 491 B | Recursos de densidade mdpi |

## 2. Factos confirmados (observados directamente nos ficheiros)

| Facto | Evidência |
| --- | --- |
| Identificador `com.gareeda.mobile`, versão 1.0.1 (code 27), minSdk 24, targetSdk 36 | `manifest.json` do XAPK e `assets/app.config` |
| **React Native com Expo SDK 54**, nova arquitectura activa, React Compiler | `app.config`: `sdkVersion 54.0.0`, `newArchEnabled`, `reactCompiler`; bibliotecas `libreactnative.so`, `libexpo-modules-core.so` |
| Motor **Hermes**, bytecode versão 96 | Cabeçalho `c6 1f bc 03 c1 03 19 1f`, versão 96 em `index.android.bundle` |
| Navegação **expo-router** (rotas por ficheiros) | Strings `(auth)/…`, `(driver)/…`, `(tabs)/…`, `(onboarding)/…` |
| Backend próprio REST em `https://api.gareeda.app/api/v1` | String no bundle |
| Actualizações OTA via Expo Updates (EAS) | `updates.url` = `u.expo.dev/…`, canal `production` |
| Google Maps (Directions, Places Autocomplete/Details) | `maps.googleapis.com`, `/api/directions/json`, `/api/place/autocomplete/json` |
| Socket.IO (tempo real) | String `socket.io` |
| Sentry (erros) | `o447951.ingest.sentry.io`, `libsentry.so` |
| Firebase Cloud Messaging / notificações Expo | `google-services.json`, permissão `c2dm.RECEIVE`, plugin `expo-notifications` |
| Leitura de QR por câmara (ML Kit barcode) | `libbarhopper_v3.so`, `assets/mlkit_barcode_models/`, permissão de câmara «scan booking QR codes» |
| Armazenamento seguro, biometria, image picker, localização só em primeiro plano | Plugins `expo-secure-store`, `expo-image-picker`, `expo-location` (sem localização em segundo plano) |
| Contacto por WhatsApp | `https://wa.me` |
| Papéis `passenger`, `driver`, `admin`, `customer` | Strings do bundle |

### Ecrãs observados (rotas expo-router)

- Autenticação: `(auth)/index`, `signup`, `otp`, `forgot-password`, `reset-password`, `role`
- Onboarding: `(onboarding)/index`
- Passageiro (separadores): `(tabs)/index`, `search`, `create`, `profile`, `settings`
- Motorista: `(driver)/trips`, `trip`, `route`, `booking-detail`, `create-booking`, `my-covers`, `trips-history`

### Endpoints REST observados (prefixo `/api/v1`, amostra)

- Autenticação: `/auth/send-otp`, `/auth/change-password`, `/auth/change-role`, `/auth/logout`, `/auth/register`, `/auth/upload-picture`
- Reservas: `/bookings/add-booking`, `get-bookings`, `cancel-booking`, `search-nearby`, `search-by-code`, `pickup-times`, `price-decision`, `customer-approval`, `confirm-finish`, `passenger-edit`
- Pedidos de adesão e extensões: `/booking-join-requests/*`, `/booking-extensions/{quote,offer,cancel,request}`
- Motorista: `/driver/create-booking`, `/driver/route`, `/driver/save-route`, `/driver/location`, `/driver/trip/finish`, `/driver/trips/history`, `/driver/request-booking`, `/driver/withdraw-request`
- Ausências e substituições de motorista: `/driver-absences/{report,cancel,my-covers,respond-cover}`
- Pagamentos: `/passenger-invoices/{booking-summary,collect-booking,pay-from-wallet,use-wallet}`, `/user-wallets/me/entries`, `/driver-payouts/my-cash_to_driver`
- Dias sem viagem do passageiro: `/passenger-off-days/{get-off-days,acknowledge}`
- Moradas, notificações e mensagens: `/user-addresses/*`, `/notifications/*` (incl. `save-push-token`), `/chat-inbox`, `/messages`

Estados observados: `pending`, `confirmed`, `in_progress`, `completed`, `cancelled`.
Termos de negócio observados: `monthly`, `recurring`, `daily`, `subscription`, `off days`, `school`, `college`, moeda `IQD`.

## 3. Hipóteses (não confirmadas)

- O serviço parece ser de **boleias/transporte recorrente mensal** (escola/trabalho), negociado entre passageiro e
  motorista (preço proposto, aprovação do cliente), com carteira, faturas e pagamento em dinheiro ao motorista.
- O mercado de origem parece ser o Iraque/Curdistão (moeda IQD, dono do projecto EAS); não confirmado.
- A lógica de negócio (preços, capacidade, regras) reside no backend, que não está acessível.

## 4. O que é (e não é) reutilizável

| Elemento | Reutilizável? | Motivo |
| --- | --- | --- |
| Código-fonte JS/TS | **Não** | Não existe no pacote; só bytecode Hermes compilado. A descompilação daria código ilegível e protegido por direitos de autor |
| Código nativo / DEX | **Não** | Bibliotecas de terceiros (React Native, Expo, Sentry), obtidas legitimamente pelos seus próprios pacotes |
| Backend `api.gareeda.app` | **Não** | Serviço proprietário de terceiros; usá-lo seria acesso não autorizado |
| Recursos visuais, marca, textos | **Não** | Propriedade da Gareeda |
| Fluxos funcionais e padrões de UX | **Sim, como referência** | Ideias e fluxos não são código; foram reinterpretados para o modelo universitário angolano |

## 5. Dependências externas da referência

Google Maps Platform (chave de API), Firebase/FCM e Expo Push, Expo EAS Updates, Sentry, Socket.IO
(servidor próprio), WhatsApp (ligações `wa.me`).

## 6. Limitações da análise

- O bundle é bytecode Hermes v96; as strings foram extraídas, mas o fluxo de controlo não foi descompilado
  (nem é necessário para o objectivo).
- Não foram executados a app nem o backend (sem dispositivo/emulador; o backend é de terceiros).
- O Android SDK, Java, JADX e Apktool não estão instalados nesta máquina; a análise foi estática, sobre o ZIP,
  os ficheiros de configuração Expo e a tabela de strings do bundle.

## 7. Estratégia recomendada

**Reconstrução numa base de código nova**, com tecnologia equivalente (React Native/Expo) nas apps móveis,
porque é a única opção legal e tecnicamente viável, e porque o modelo de negócio pretendido (mensalidade
universitária com rotas e paragens fixas) é diferente do modelo de boleias negociadas da referência.

Diferenças deliberadas face à referência:

1. Rotas e paragens **fixas e administradas**, em vez de recolhas negociadas por reserva.
2. Mensalidade com plano, e não preço negociado com o motorista.
3. Passe digital com QR assinado, validável por parceiros.
4. Painel administrativo web próprio (a referência só expõe o papel `admin` no backend).
5. Moeda AOA e pagamentos angolanos (transferência IBAN, Multicaixa Express e PayPay através de prestador autorizado).
