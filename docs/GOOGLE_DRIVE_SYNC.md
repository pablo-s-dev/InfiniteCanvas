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

No Android remoto, cada operação também exige Play Integrity. O acesso comprado é confirmado pelo servidor, não por um booleano local. A liberação de desenvolvimento exige identidade Google real verificada e uma concessão registrada no banco local; não representa compra na Play.

## Desenvolvimento

Veja [configuração do Worker](../worker/README.md). Expo permanece em `http://localhost:8081`; o Worker local usa a porta 8788. Para o Android de desenvolvimento conectado por cabo, configure `EXPO_PUBLIC_CLOUD_SYNC_API_URL=http://127.0.0.1:8788` e encaminhe as portas 8081 e 8788 com `adb reverse` para o dispositivo escolhido.

Em produção web, configure a rota `/api/*` na mesma origem para o Worker. Configure o banco e os secrets reais antes de qualquer publicação. Este trabalho não publica em produção.

## Glossário

- **API:** interface de programação de aplicações.
- **D1:** banco de dados da Cloudflare.
- **HttpOnly:** atributo que impede JavaScript de ler o cookie de sessão.
- **OAuth:** protocolo de autorização utilizado pelo Google.
- **ADB:** Android Debug Bridge, ferramenta de conexão e depuração do Android.
