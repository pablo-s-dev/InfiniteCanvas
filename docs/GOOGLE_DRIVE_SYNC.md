# Sincronização com o Google Drive

## Arquitetura

O app salva primeiro no dispositivo. Um controlador compartilhado mantém separados a sessão, o acesso à compra, a autorização do Drive e a operação em andamento. Biblioteca, canvas e tarefa de segundo plano usam o mesmo motor de sincronização.

O app acessa nosso Worker, que verifica a conta e o acesso em cada operação. Só o Worker acessa o Drive e valida compras no Google Play. Segredos ficam no servidor; tokens individuais do Drive ficam criptografados no D1. No navegador, a sessão usa um cookie HttpOnly e chamadas pela mesma origem em `/api`. No Android, a sessão fica no SecureStore.

## Conta e arquivos

Os desenhos ficam em `Meu Drive/InfiniteCanvas`. O escopo `drive.file` permite trabalhar com arquivos criados ou explicitamente compartilhados com o app. Arquivos manuais desconhecidos não são importados. A migração copia e valida os desenhos antigos da pasta oculta, preservando os originais.

Cada vínculo e item da fila pertence a uma conta. Trocar de conta não envia nem apaga os desenhos da conta anterior. A interface permite criar uma cópia para a conta atual explicitamente. Sair revoga a sessão do serviço e preserva os desenhos locais e a autorização do Drive no servidor.

## Como decidir entre atualizar e resolver conflito

O motor guarda o hash do conteúdo da última versão compartilhada. Câmera, zoom, timestamps e metadados de transporte não fazem parte desse hash.

| Comparação | Ação |
| --- | --- |
| Local e nuvem iguais | Marcar como sincronizado |
| Apenas local mudou desde a base | Enviar atualização |
| Apenas nuvem mudou desde a base | Baixar atualização |
| As duas mudaram e são diferentes | Pedir escolha com previews |
| Diferentes, sem base conhecida | Pedir escolha sem afirmar edição simultânea |

O servidor verifica a revisão e usa uma escrita condicional no Drive. Resolver conflito aplica a escolha às versões mostradas; se elas mudarem, o usuário precisa revisar novamente. A confirmação de upload preserva qualquer edição feita enquanto a requisição estava em andamento.

## Segurança e recuperação

Worker e app validam profundamente o documento antes de usá-lo. Arquivos inválidos não substituem a última cópia local válida nem são marcados como sincronizados. Identificadores de arquivos no conteúdo nunca autorizam acesso ou exclusão: o servidor usa os vínculos da conta autenticada.

No Android remoto, cada operação também exige Play Integrity. O acesso comprado é confirmado pelo servidor, não por um booleano local. Não há liberação por e-mail, concessão de desenvolvimento ou sessão fictícia. Uma compra pendente não libera o acesso; uma compra válida precisa corresponder à conta Google autenticada.

## Desenvolvimento

Veja [configuração do Worker](../worker/README.md). `npm run dev:local` inicia Expo em `http://localhost:8081` e o Worker local na porta 47329. A web chama `/api` e o Metro encaminha ao Worker. Para Android, `npm run dev:local -- android` configura o endereço do Worker e encaminha as portas automaticamente para uma instalação de desenvolvimento conectada.

`npm run dev:cloud -- web` carrega a URL remota de `.env.cloud` como destino do proxy do Metro. O frontend e o Worker podem estar em hosts diferentes: `/api` é somente a origem do navegador, enquanto o proxy resolve o destino real. O Worker de staging precisa autorizar a origem local e manter CORS, cookie e checagem OAuth configurados. Android usa a URL remota diretamente.

## Release de teste interno

`config/staging.env` contém somente as três configurações públicas da release. `npm run build:web` e `npm run build:android:aab` carregam esse arquivo antes de o Expo incorporar os valores no JavaScript. Configuração incompleta, URL local ou credenciais dentro desse arquivo interrompem o build. Valores herdados do terminal não substituem o arquivo de release.

`npm run deploy:staging` publica o site e o Worker juntos em `https://infinitecanvas-sync-staging.piblio10.workers.dev`. Os assets atendem as páginas e `/api/*`, `/v1/*` e `/health` são processados pelo Worker. O D1 e os secrets pertencem a esse ambiente separado. A origem precisa constar no cliente OAuth Web; o cliente Android deve corresponder ao certificado de assinatura da Play.

Notificações RTDN ainda não estão configuradas nesse ambiente. Compras são verificadas imediatamente no envio do token; o cron revalida compras registradas a cada hora, e consultas de acesso também renovam verificações antigas. Isso significa que reembolsos podem levar até a próxima revalidação para remover acesso. Não trate `/health` como prova de compra ou sincronização: teste compra, restauração e envio de desenho com a instalação da Play.

## Glossário

- **API:** interface de programação de aplicações.
- **D1:** banco de dados da Cloudflare.
- **HttpOnly:** atributo que impede JavaScript de ler o cookie de sessão.
- **OAuth:** protocolo de autorização utilizado pelo Google.
- **ADB:** Android Debug Bridge, ferramenta de conexão e depuração do Android.
