# App móvel (estudante, motorista e validador de parceiro)

Expo SDK 54 com expo-router. A mesma app serve três perfis; o servidor decide o perfil de cada conta.

| Perfil | Funcionalidades |
| --- | --- |
| Estudante | Registo; pedido de confirmação da inscrição universitária; rotas e pesquisa de paragens (por nome ou «perto de mim»); planos, subscrição e pagamento (transferência com referência; pagamento de teste só em desenvolvimento); reservas com lugar atribuído pelo servidor e cancelamento; passe digital com QR renovado a cada 60 s; acompanhamento da viagem; notificações; ocorrências. |
| Motorista | Viagens atribuídas; manifesto (nome, lugar, paragem); iniciar e terminar a viagem; partilha de GPS **apenas** enquanto a viagem está em curso e o ecrã aberto; validação do passe com a câmara (ou código introduzido manualmente); registo de embarque; ocorrências. |
| Validador de parceiro | Lista das viagens em curso feitas com veículos da sua transportadora e validação do passe nessas viagens (o mesmo ecrã de leitura do motorista). |

O estudante também vê rotas intercidades num filtro próprio; só pode reservá-las se o plano as incluir.

As contas da equipa (administração, operação, financeiro, gestão universitária) são encaminhadas para o painel web.

## Executar

A app tem dependências próprias, fora dos workspaces da raiz:

```powershell
cd apps/mobile
npm install
Copy-Item .env.example .env   # opcional; por omissão usa http://localhost:4000/api/v1
npm run web                   # browser em http://localhost:8081
npm start                     # QR para a app Expo Go num telemóvel
```

A API tem de estar a correr (`npm run dev:api` na raiz).

- No browser, a API já aceita a origem `http://localhost:8081` (`CORS_ORIGINS`).
- Num telemóvel com Expo Go, defina `EXPO_PUBLIC_API_URL` com o IP da máquina na rede local, por exemplo `http://192.168.1.20:4000/api/v1`. A API escuta em `0.0.0.0` por omissão.

## Verificação

```powershell
npm run typecheck
npx expo install --check                                     # versões compatíveis com o SDK 54
npx expo export --platform web --output-dir dist-web         # bundle web completo
```

## Limitações conhecidas

- **Builds nativos (APK/AAB/IPA) não foram gerados**: o ambiente não tem Android SDK. Use EAS Build (`eas build`) ou Android Studio.
- **A app não foi testada num telemóvel físico.** A câmara e o GPS foram implementados com `expo-camera` e `expo-location`, mas só foram exercitados no browser, onde o suporte depende do navegador. O teste `npm run e2e:app` (na raiz) percorre a versão web com o Chrome: estudante, motorista e envio de GPS com posição simulada. A leitura pela câmara e o modo validador não fazem parte desse teste.
- O GPS usa apenas localização em primeiro plano. Se o motorista sair da app, a partilha pára: é intencional, para não recolher localização fora do ecrã da viagem. Uma versão com o ecrã bloqueado exigiria localização em segundo plano e uma revisão de privacidade.
- Sem notificações push: as notificações ficam na app (ecrã «Notificações").
- Sem mapa interactivo: é mostrada a distância à paragem, com uma ligação para abrir a posição no OpenStreetMap.
- O refresh token fica no armazenamento seguro do sistema (Keychain/Keystore). No browser fica em `sessionStorage`.
