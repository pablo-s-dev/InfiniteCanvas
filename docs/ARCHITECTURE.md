# Arquitetura do Infinite Canvas

O projeto usa organização por funcionalidade (feature based). Cada funcionalidade
mantém seus componentes, regras e hooks próximos. Não usamos todas as camadas de
Feature-Sliced Design nem pastas vazias apenas para reproduzir esse padrão.

## Entrada e composição

- `AppEntry.js` registra `src/shell/InfiniteCanvasApp.tsx` no Expo.
- `shell/InfiniteCanvasApp.tsx` compõe as telas, navegação e fluxos entre elas.
- `App.tsx` reexporta o editor para manter compatibilidade com imports existentes.
  A implementação do editor fica em `features/canvas`.

## Responsabilidades

| Local | Responsabilidade |
| --- | --- |
| `features/canvas/CanvasEditor.tsx` | Conectar o controlador à cena visual |
| `features/canvas/hooks/useCanvasController.ts` | Coordenar estado, entrada de ponteiros, viewport e histórico do editor |
| `features/canvas/hooks/useCanvasSelectionInteractions.ts` | Arrastar e redimensionar seleção; controlar o ciclo da interação |
| `features/canvas/hooks/useScribbleEraseFreeze.ts` | Controlar a pausa e a tolerância de movimento do scribble |
| `features/canvas/components/CanvasScene.tsx` | Renderizar o canvas e conectar os eventos aos handlers |
| `features/canvas/components/` | Barras, seleção visual, menus, imagens e diálogos do editor |
| `features/canvas/document.ts` | Contrato e validação do documento persistido |
| `features/canvas/pathGeometry.ts` | Construção, amostragem e medição dos traços |
| `features/canvas/selectionGeometry.ts` | Interseção dos traços com a seleção |
| `features/canvas/pathTransforms.ts` | Translação e escala dos traços |
| `features/canvas/scribbleGesture.ts` | Reconhecimento do rabisco, sem temporizador ou interface |
| `features/canvas/canvasHistory.ts` | Operações sobre itens e representações do histórico |
| `features/canvas/canvasTypes.ts` | Tipos internos do editor |
| `features/canvas/canvasConstants.ts` | Valores configuráveis do editor |
| `features/documents/` | Repositório e diálogos de criação, detalhes e saída sem salvar |
| `features/home/` | Biblioteca, seleção de desenhos, filtros, configurações e apresentação dos conflitos |
| `features/sync/hooks/useCloudSync.ts` | Conexão, entitlement, compra, restauração, fila e resolução de conflitos |
| `features/sync/components/CloudSyncPaywall.tsx` | Apresentação da compra e de seu estado |
| `features/sync/googleDriveSync.ts` | Cliente do serviço de sincronização |
| `features/sharing/` | Importação, exportação, rasterização e compartilhamento |
| `features/tags/` | Modelo das tags e componentes de edição |
| `shared/` | Temas, ícones, traduções, armazenamento e recursos de interface reutilizáveis |
| `platform/` | Integrações específicas de plataforma |
| `worker/` | Serviço independente de autenticação, compra e acesso ao Drive |

## Como escolher onde colocar código

1. Uma regra que recebe dados e devolve dados deve ficar em um módulo comum de
   TypeScript. Por exemplo: testar interseção ou reconhecer um scribble.
2. Estado, temporizadores, efeitos e o ciclo de uma interação ficam em um hook.
3. Layout e elementos visuais ficam em componentes. Recebem dados e callbacks;
   não devem executar compra ou acesso ao Drive diretamente.
4. O shell coordena ações entre telas. Features não importam o shell.
5. Código só vai para `shared` quando representa uma responsabilidade compartilhada.
   Uma regra específica de seleção continua no canvas.
6. Componentes devem ser declarados fora da função de outro componente. Isso
   mantém sua identidade entre renderizações e evita remontagens de botões.

O controlador do canvas ainda concentra a coordenação entre desenho, ponteiros e
viewport. Novas extrações devem seguir responsabilidades e contratos explícitos,
evitando hooks com listas de argumentos sem relação entre si.

## Exemplo: ajustar scribble to erase

- Mudar o reconhecimento: `scribbleGesture.ts`.
- Mudar o intervalo ou a tolerância: `canvasConstants.ts`.
- Mudar o ciclo de pausa/cancelamento: `hooks/useScribbleEraseFreeze.ts`.
- Mudar como os alvos são apagados do documento: `hooks/useCanvasController.ts`.

## Glossário

- **Hook:** função React que encapsula estado, efeitos ou comportamento reutilizável.
- **Entitlement:** direito de acesso confirmado pelo serviço.
- **Viewport:** posição e zoom da região visível do desenho.
- **Handler:** função que responde a um evento, como mover ou soltar um ponteiro.
- **Callback:** função passada a outro componente ou módulo para responder a uma ação.
