# Cloud Sync local setup

O app conversa com este Worker; o Worker é que acessa a API do Google Drive e valida o Google Play. O segredo de OAuth, a conta de serviço do Play e a chave de criptografia ficam no ambiente do Worker. O Android conserva uma sessão revogável no SecureStore; a web usa cookie HttpOnly e não recebe o token em JavaScript.

## Rodar localmente

1. Instale as dependências com `npm install`.
2. O arquivo ignorado `.dev.vars` contém os valores de desenvolvimento. A chave `TOKEN_ENCRYPTION_KEY` local foi gerada aleatoriamente e é diferente de qualquer chave de produção.
3. Aplique o esquema no banco D1 local: `npm run worker:migrate:local`.
4. Inicie o serviço: `npm run worker:dev`. O endereço local é `http://localhost:8788`; `GET /health` verifica se ele está vivo.
5. A web chama `/api` na mesma origem; o Metro encaminha ao Worker local na porta 8788. Para Android debug conectado por cabo, configure `EXPO_PUBLIC_CLOUD_SYNC_API_URL=http://127.0.0.1:8788` e execute `adb -s SERIAL reverse tcp:8788 tcp:8788` e `adb -s SERIAL reverse tcp:8081 tcp:8081`. Reinicie Expo após mudar as variáveis.

Sem credenciais externas, `/health` e o esquema local funcionam, mas login, Drive, compras e Integrity retornam erro de configuração. Não coloque valores reais em `.dev.vars.example`, arquivos versionados, logs ou no bundle do app.

### Liberar a tela de Cloud Sync em desenvolvimento

Para testar com a identidade Google real sem criar uma transação, inicie o Worker localmente com:

```powershell
npx wrangler dev --local --port 8788 --var "LOCAL_DEV_MODE:true" --var "ALLOWED_WEB_ORIGINS:http://localhost:8081,http://127.0.0.1:8081" --var "LOCAL_TEST_ENTITLEMENT_EMAILS:piblio10@gmail.com"
```

O usuário precisa concluir o login Google real. O servidor registra uma concessão de desenvolvimento para a identidade verificada, apenas se o e-mail estiver na lista permitida e a requisição for local. Essa concessão permite testar o Drive real; não é compra na Play e não libera acesso em um Worker remoto.

## Credenciais para habilitar os fluxos

- **OAuth do Google:** configure um cliente OAuth Web com o URI/origem local `http://localhost:8081`. O `EXPO_PUBLIC_GOOGLE_CLIENT_ID` do app e `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` no Worker precisam corresponder ao mesmo cliente Web. Configure também o cliente Android com o pacote `com.PabloS.InfiniteCanvas` e as impressões digitais de assinatura de desenvolvimento e Play.
- **Drive:** habilite a Google Drive API e peça os escopos `drive.file` e `drive.appdata`. O primeiro atende os arquivos que o app cria na pasta visível `Meu Drive/InfiniteCanvas`; o segundo serve apenas para copiar os arquivos antigos da área de dados do app. O Worker mantém os originais ocultos e grava o resultado verificado na pasta visível.
- **Google Play:** habilite a Google Play Developer API, crie uma conta de serviço e conceda acesso ao app. Armazene o JSON dessa conta como `PLAY_SERVICE_ACCOUNT_JSON` no Worker. O backend consulta cada token de compra, só então reconhece o acesso e faz o acknowledge da compra.
- **Preço:** ative o produto único `cloud_sync_unlock` na Play Console e configure BRL 30 para o Brasil e aproximadamente USD 10 nos demais mercados pretendidos. O app só exibe o preço localizado retornado pela Play Billing Library; o código não fixa nem compara preços.
- **Play Integrity:** vincule o app e a API Integrity ao projeto Cloud usado pela Play. Configure o número do projeto em `EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER` no build Android e permita à conta de serviço do Worker decodificar os tokens. O app calcula um hash da chamada; o Worker pede à Google a validação do token e verifica pacote, hash, reconhecimento da instalação e integridade do dispositivo.
- **Reembolsos:** configure notificações em tempo real do Google Play (RTDN) para Pub/Sub, com autenticação OIDC. Cadastre o tópico/audiência em `PLAY_RTDN_OIDC_AUDIENCE` e a conta de serviço em `PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`. O Worker também revalida compras por tarefa agendada.

Use `wrangler secret put NOME` para cadastrar segredos em um ambiente remoto somente quando a conta e o ambiente estiverem preparados. Este trabalho não publica o Worker nem altera a Play Console.

## O que os arquivos sincronizados aceitam

Os arquivos de desenho são validados tanto no app quanto no Worker. A validação confere versão, chaves conhecidas, limites de tamanho/itens/pontos, números finitos, datas, tags, cores e URIs. Não aceita HTML, JavaScript, SVG arbitrário nem URI `file:`/`content:` na cópia da nuvem. O identificador do arquivo do Drive nunca vem do conteúdo do desenho: o Worker resolve o ID pela conta autenticada e pelo vínculo persistido no D1.

O app só enumera os arquivos que foram criados na pasta própria e marcados com os metadados do app/conta. Arquivos adicionados manualmente não são importados automaticamente. Um arquivo inválido ou truncado é ignorado, permanece no Drive para recuperação manual e não substitui uma cópia local válida.

## Glossário

- **API**: interface de programação de aplicações.
- **D1**: banco de dados SQL gerenciado da Cloudflare.
- **JSON**: formato de texto JavaScript Object Notation usado para representar os desenhos e credenciais.
- **OAuth**: protocolo de autorização do Google.
- **OIDC**: OpenID Connect, usado para autenticar a chamada Pub/Sub ao webhook.
- **RTDN**: notificações em tempo real do Google Play.
- **URI**: identificador de recurso, como um endereço de arquivo.

