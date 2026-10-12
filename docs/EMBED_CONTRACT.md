# Memory Copilot Embed Contract

Memory Copilot embeds the web canvas in an iframe. The current web entry point is:

```txt
/InfiniteCanvas/index.html
```

The protocol is `postMessage` based and is versioned independently from the
canvas document schema.

## Constants

```ts
CANVAS_EMBED_PROTOCOL_VERSION = 1;
CANVAS_DOCUMENT_VERSION = 2;
```

## Host To Canvas

### `INIT`

Loads initial canvas data.

```ts
window.postMessage({
  type: "INIT",
  initData: {
    version: 2,
    items: [],
    historyCursor: -1,
    viewport: { x: 0, y: 0, scale: 1 },
  },
});
```

`initData` can be either raw `CanvasDrawingData` or a full `CanvasDocument`.
The current canvas applies `items`, `historyCursor`, and `viewport`.

### `CONFIG`

Updates embedded drawing preferences.

```ts
window.postMessage({
  type: "CONFIG",
  config: {
    pencilDrawsFingerPans: false,
    scribbleEraseEnabled: true,
    scribbleEraseSensitivity: 1,
  },
});
```

`scribbleEraseSensitivity` is clamped by the canvas. Omitted config fields keep
their previous value.

### `OPEN_DOCUMENT`

Declared in the protocol for host-driven document routing:

```ts
window.postMessage({
  type: "OPEN_DOCUMENT",
  documentId: "drawing_...",
});
```

The current embedded canvas accepts the message shape, but standalone document
opening is still owned by the app shell.

## Canvas To Host

### `READY`

Sent after the web canvas mounts and registers browser event listeners.

```ts
{
  type: "READY",
  protocolVersion: 1
}
```

### `UPDATES`

Sent whenever canvas items, history cursor, pan, or zoom changes.

```ts
{
  type: "UPDATES",
  updatedData: {
    version: 2,
    items: [],
    historyCursor: -1,
    viewport: { x: 0, y: 0, scale: 1 }
  }
}
```

Hosts should treat this as the live drawing state and debounce their own durable
writes if needed.

### `DOCUMENT_SAVED`

Sent only when the canvas is opened from the standalone local library. Local
saves are debounced by 250 ms.

```ts
{
  type: "DOCUMENT_SAVED",
  document: {
    version: 2,
    metadata: {
      id: "drawing_...",
      title: "Sketch",
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
      tags: [],
      flatTags: []
    },
    items: [],
    historyCursor: -1,
    viewport: { x: 0, y: 0, scale: 1 }
  }
}
```

Embedded hosts should not rely on `DOCUMENT_SAVED`; use `UPDATES` for the live
embed state.

## Security Note

The current canvas posts to `window.parent` with `"*"`. A production host should
validate message `origin` on its side and should avoid sending sensitive data in
embed messages.
