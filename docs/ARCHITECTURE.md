# InfiniteCanvas Architecture

InfiniteCanvas has two app surfaces:

- Standalone app: home/library first, then opens the existing drawing canvas.
- Embedded app: when loaded inside an iframe, it goes straight to the canvas for Memory Copilot.

The current drawing implementation still lives in the root `App.tsx`. New canvas behavior should move into feature slices as the app is modularized.

## Feature Slices

```txt
src/
  shell/
  features/
    canvas/
    documents/
    home/
    sync/
    tags/
  shared/
    icons/
    storage/
```

## Embed Boundary

Memory Copilot embeds the web build through:

```txt
/InfiniteCanvas/index.html
```

The embed contract is `postMessage` based:

- host sends `INIT`
- host sends `CONFIG`
- canvas sends `UPDATES`

See `docs/EMBED_CONTRACT.md` for the full message contract and examples.

The payload contract is v2 only:

```ts
{
  version: 2,
  items,
  historyCursor,
  viewport
}
```

`items` is the ordered canvas operation list. Path items carry their own `color` and `width`; image items carry their own `uri` and placement data. `historyCursor` points at the last active item in that ordered list. Local library documents wrap this drawing data with `metadata`; embedded Memory Copilot fields can store the drawing data directly.

## Versioning

App releases follow semantic versioning. The current roadmap implementation starts at:

```txt
1.1.0-alpha.0
```

Canvas documents have their own schema version in `CANVAS_DOCUMENT_VERSION`.
