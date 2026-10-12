# Plano: conta, compra e sincronização com estados coerentes

Data: 2026-10-03
Estado: implementação local concluída; login Google e sincronização real web confirmados. Checagem de tipos e 51 testes passaram. Instalador de desenvolvimento gerado e aberto no emulador, com ícones e biblioteca carregados. Validação no Redmi e compra real no teste interno ainda pendentes.

## Objetivo

Uma única configuração inicial conecta uma conta Google e autoriza o Drive. O app reutiliza essa autorização, confirma o acesso comprado no servidor e sincroniza sem pedir novamente a conta a cada ação. Cada tela deve oferecer uma ação que possa realmente executar e mostrar a causa quando faltar um pré-requisito.

## Diagnóstico do código atual

- `useCloudSync.ts` deriva acesso de `serverEntitlement?.active === true`. Assim, ausência de resposta e acesso confirmado como inativo recebem o mesmo tratamento.
- `googleDriveSync.isDriveReady()` verifica existência de sessão e ausência de `localTestOnly`. Não confirma autorização válida do Drive no servidor.
- `syncConflict` persiste nos metadados locais. Pode existir após sair, expirar a sessão ou reiniciar o app; não prova que uma comparação remota acabou de acontecer.
- O modal usa o desenho da lista como fotografia antiga. Pode mostrar um título, revisão ou conflito que já mudou.
- O login de teste cria `local-test:<email>`; o login Google real usa o identificador Google. Mesmo e-mail não significa mesma identidade ou mesmo acesso concedido.
- Sessão web atualmente está em `sessionStorage`; fechar a aba pode exigir novo login no app, apesar de o servidor ainda ter autorização do Drive.
- Há método `signOut()` no serviço, mas a tela não oferece sair da conta.
- A restauração web apresenta mensagem sobre compra na Play sem consultar as compras do aplicativo Android.
- Salvamento ao carregar e comparação de câmera já receberam correções locais, mas ainda precisam de validação do fluxo completo.
- `docs/GOOGLE_DRIVE_SYNC.md` descreve a arquitetura antiga de acesso direto e pasta oculta. Atualizar a documentação ao implementar este plano.

## 1. Estado único com dimensões independentes

Criar um controlador de conta e sincronização, fora do ciclo de montagem da Biblioteca/Ajustes. Componentes consomem seu estado; não inventam prontidão a partir da presença de token.

| Dimensão | Estados |
| --- | --- |
| Sessão do app | verificando, desconectada, autenticando, conectada, expirada |
| Acesso à compra única | desconhecido, verificando, ativo, inativo confirmado, compra pendente, falha de consulta |
| Autorização do Drive | desconhecida, verificando, válida, reconexão necessária |
| Operação de sync | ociosa, executando, offline, falhou |
| Pendência do desenho | upload pendente, sincronizado, falha, conflito verificado, conflito antigo a conferir |

Invariantes:

- Paywall só abre depois de o servidor confirmar acesso inativo para a conta autenticada.
- Falha de rede, sessão ausente e verificação em andamento nunca significam ausência de compra.
- A conta exibida vem da sessão validada pelo servidor. E-mail serve para apresentação; o vínculo usa identidade Google estável.
- Um conflito antigo pode permanecer visível como pendência, mas não como diagnóstico remoto atual.
- Uma operação por vez controla progresso e término. Toda promessa termina, falha ou atinge um prazo; não há retorno silencioso ao clicar.

## 2. Fluxo da primeira conexão

1. Sem conta: mostrar **Conectar conta Google**, sem paywall antecipado.
2. Ao clicar: abrir um único fluxo Google para identificar a conta e conceder acesso ao Drive. Cancelamento volta ao estado anterior.
3. Servidor troca o código, guarda autorização do Drive e cria a sessão do app.
4. App exibe o e-mail e **Verificando acesso…**; servidor retorna acesso e situação do Drive.
5. Acesso ativo + Drive autorizado: sincronizar automaticamente uma vez.
6. Acesso confirmado inativo: apresentar compra no Android. Na web, explicar que a compra é feita no app Android e oferecer **Verificar acesso novamente**.
7. Pagamento pendente: mostrar esse estado, sem liberar sync nem oferecer comprar novamente.
8. Compra concluída: validar no servidor, vincular à identidade Google do app e continuar a sincronização sem outro seletor de conta.

A conta do app pode ser diferente da conta de cobrança da Play. Antes da compra, indicar em qual conta do app o acesso será ativado. Restaurar uma compra vinculada a outra identidade não transfere sua propriedade silenciosamente.

## 3. Voltar ao app e reutilizar autorização

- Inicialização restaura e valida a sessão antes de decidir o que mostrar.
- Web: sessão persistente em cookie HttpOnly; produção com Secure e API na mesma origem, por encaminhamento ao Worker. Desenvolvimento usa encaminhamento local equivalente. Aplicar validação de origem e proteção contra requisições forjadas nas operações de escrita.
- Android: sessão/credencial de renovação no armazenamento seguro. Renovação do serviço mantém a identidade; credenciais de renovação do Google permanecem no servidor.
- Renovar a sessão do nosso app e o acesso do Drive são operações distintas.
- Sessão válida é renovada sem popup Google. Se a sessão já não puder ser restaurada, oferecer login explícito na conta anterior; não reconectar automaticamente outra conta.
- Só solicitar autorização do Drive novamente quando o servidor informar que ela foi revogada ou não pode ser renovada. Reconexão usa a conta anterior como indicação e o servidor rejeita identidade diferente durante esse fluxo.
- Não prometer autorização eterna: o Google pode invalidar a credencial. Em projeto OAuth externo em Testing, permissões do Drive podem produzir credenciais de renovação com validade de sete dias. Conferir a configuração real do projeto antes de atribuir um novo popup a bug.

## 4. Card de sincronização nos Ajustes

Ordem fixa:

1. Ícone e título.
2. Conta conectada, ou estado desconectado.
3. Estado atual em uma área de altura estável.
4. Resumo das pendências.
5. Ação principal.
6. Ação secundária **Sair da conta**, quando autenticado.

| Situação | Ação principal |
| --- | --- |
| Sem sessão | Conectar conta Google |
| Verificando sessão/acesso | Indicador de progresso, sem compra disponível |
| Falha ao consultar acesso | Tentar novamente |
| Acesso inativo confirmado no Android | Desbloquear sincronização |
| Acesso inativo confirmado na web | Orientação para comprar no Android + Verificar acesso novamente |
| Drive precisa de nova autorização | Reconectar Drive da conta exibida |
| Tudo pronto | Sincronizar agora |
| Offline | Estado offline; fila preservada |
| Há conflitos verificados | Resolver conflitos |

Não duplicar estado em toast. Erro da operação aparece onde ela foi iniciada. “Precisa de atenção” abre uma lista acionável de conflitos e falhas, em vez de apenas contadores.

## 5. Sair e trocar de conta

- **Sair da conta** interrompe novos trabalhos, invalida a sessão, limpa identidade/acesso em memória e armazenamento e fecha modais ligados à conta.
- Desenhos locais ficam preservados; a fila fica pausada.
- Trabalho remoto já enviado pode terminar: identificar operações por conta e geração da sessão, e descartar respostas antigas na interface após sair. Não prometer desfazer uma gravação já aceita pelo servidor.
- Não revogar autorização Google nem apagar arquivos do Drive ao sair. São ações diferentes.
- Ao voltar à mesma conta, recuperar vínculos e revalidar pendências.
- Para trocar, sair e conectar outra conta. Não adicionar um seletor inesperado dentro da resolução de conflitos.
- Vínculos com arquivos, revisão base, conflitos e fila pertencem à conta. Uma conta nova não recebe automaticamente uploads ou exclusões destinados à anterior.
- Desenhos nunca sincronizados podem ser associados na configuração inicial. Copiar desenhos já vinculados para outra conta exige ação explícita; não sobrescrever o vínculo anterior.

## 6. Regra de update e conflito

Manter, por conta/desenho, a revisão remota da última sincronização concluída, a assinatura do conteúdo dessa base e a geração de edição local.

A assinatura inclui título, tags, traços/imagens e histórico relevante. Exclui câmera/zoom, miniatura derivada, datas de transporte, status e vínculos do Drive. Datas não decidem quem vence.

| Mudança desde a base comum | Resultado |
| --- | --- |
| Nenhuma | Nada a enviar |
| Só local | Upload normal sobre a revisão base |
| Só remota | Download normal, preservando câmera local |
| Ambos produziram conteúdo equivalente | Atualizar vínculo e marcar sincronizado |
| Ambos produziram conteúdo diferente | Conflito real |

- Não substituir a revisão base pela revisão remota recém-listada antes de resolver a divergência.
- Primeira sincronização sem arquivo remoto: criar arquivo, sem conflito.
- Primeira sincronização com arquivo equivalente: associar, sem conflito.
- Mesmo identificador com conteúdo diferente, sem base comprovada: tratar como **Duas cópias diferentes**, explicar que não há histórico comum confirmado e oferecer as três escolhas. Não afirmar que ambas foram editadas desde a última sync.
- Arquivo inválido é falha de leitura, não uma versão concorrente válida. Preservar cópia local e bloquear sobrescrita automática.
- Upload usa uma fotografia do conteúdo. Se houver edição local durante a requisição, a confirmação atualiza a base do conteúdo enviado e mantém a edição nova na fila.
- Revalidar a revisão no servidor antes de gravar. Conferir a proteção de concorrência do caminho Drive na implementação; uma consulta seguida de escrita sem proteção não basta para assegurar ausência de perda em edições simultâneas.

## 7. Resolução de conflitos

1. Ao abrir, carregar a pendência atual pelo identificador, sem reutilizar a fotografia antiga do card.
2. Validar sessão, acesso e Drive antes de habilitar escolhas destrutivas.
3. Sem sessão: mostrar **Entre novamente em <conta> para conferir esta pendência**, com ação real de login. Não oferecer “Manter local” como se pudesse funcionar.
4. Falha de consulta: mostrar erro e **Tentar novamente**, sem abrir paywall.
5. Com acesso válido: baixar a versão atual e reavaliar. Se só local mudou, concluir como update e remover o falso conflito.
6. Conflito real: mostrar versões com prévias e as ações **Manter local**, **Usar nuvem**, **Guardar as duas**.
7. Ao decidir: desabilitar ações, mostrar progresso e executar com a identidade já validada. Se uma nova revisão aparecer, atualizar a comparação antes de sobrescrever a cópia que o usuário não viu.
8. Sucesso remove a pendência e avança para a próxima. Falha permanece no modal com tentativa novamente. Nenhum seletor de conta, paywall oculto ou toast atrás do modal.

## 8. Compra e ambiente de teste

- Separar disponibilidade do produto Play, acesso confirmado pelo servidor e autorização do Drive.
- Web não usa “Restaurar compra da Play” para uma ação que apenas consulta o servidor. Usar **Verificar acesso**.
- Android restaura compras da Play e envia seus tokens ao servidor. Mensagens distinguem nenhuma compra encontrada, compra de outra identidade, pagamento pendente e falha de verificação.
- Produto indisponível não desativa sync de quem já tem acesso ativo.
- Remover login fictício automático do fluxo normal. Conta de teste real autentica pelo Google; concessão de teste é registrada no servidor para essa identidade, com ambiente e motivo explícitos.
- Conferir especificamente o acesso de `piblio10@gmail.com` após login real. Não transportar a concessão de `local-test:<email>` como se fosse prova de compra.

## 9. Etapas de implementação

1. Modelo de estado e resposta consolidada de conta no servidor: sessão, identidade, acesso e autorização Drive. Migrar concessão de teste de modo auditável.
2. Persistência/renovação de sessão, login inicial, reconexão da mesma identidade e logout. Vincular fila e metadados à conta; migrar vínculos antigos com verificação, sem adivinhar o proprietário.
3. Motor de sync com base comprovada, assinatura de conteúdo e controle de operação/geração local. Não reutilizar status visual como trava de concorrência.
4. Ajustes, paywall por plataforma e central de pendências. Mensagens traduzidas, botões com tooltip web, foco/teclado e contraste nos dois temas.
5. Revalidação e resolução de conflitos, com resposta visível para cada clique.
6. Validação real na web e Android, documentação atualizada e servidores locais mantidos abertos. Publicação fica fora deste plano.

## 10. Aceitação e validação prevista

- Abrir desenho sincronizado, fechar e voltar: mesma data de edição, nenhuma fila nova ou conflito.
- Pan/zoom: câmera preservada localmente, sem conflito.
- Editar a partir da base remota atual: upload automático normal.
- Editar só no outro dispositivo: download normal.
- Editar nos dois dispositivos a partir da mesma base: uma pendência real, com escolha funcional.
- Editar enquanto upload ocorre: edição recente continua pendente, não é marcada como enviada.
- Conflitos antigos do bug atual: revalidados e removidos quando não há divergência real; nunca apagados cegamente.
- Sessão ausente + conflito salvo: pede reconexão antes de resolver; não afirma comparação recente.
- “Manter local” conclui ou mostra erro dentro do modal; nunca fica inerte.
- Compra desconhecida/falha de rede: não aparece “não comprou”.
- Conta de teste real: acesso ativo confirmado sem substituir a identidade por login fictício.
- Recarregar/fechar e reabrir o navegador: sessão recuperada conforme a política escolhida, sem novo consentimento Drive válido.
- Sair durante upload e entrar em outra conta: nenhuma resposta/fila da conta anterior altera a nova.
- JSON remoto inválido, rede offline e prazo de requisição excedido: cópia válida preservada e progresso termina.
- Conferir compra/restauração no Android interno e acesso já comprado na web; não simular compras Play na web.

## Referências e glossário

- [OAuth Google e expiração de credenciais](https://developers.google.com/identity/protocols/oauth2).
- [Fluxo Google no servidor e renovação](https://developers.google.com/identity/protocols/oauth2/web-server).
- [Compra Play e verificação no servidor](https://developer.android.com/google/play/billing/integrate).
- API: interface de programação de aplicações.
- OAuth: protocolo de autorização usado para conceder acesso ao Google Drive.
- JSON: formato de dados usado nos documentos do desenho.
- HttpOnly: cookie que o código da página não consegue ler.
- Secure: atributo que exige conexão HTTPS para transmitir o cookie em produção.
- HTTPS: protocolo HTTP com transporte criptografado.



