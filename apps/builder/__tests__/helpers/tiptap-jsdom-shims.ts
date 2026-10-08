/**
 * jsdom lacks the layout APIs ProseMirror / tiptap call while mounting
 * (`elementFromPoint`, range rects) and the canvas the emoji picker probes.
 * Imported for its side effect, first, so it runs before those modules load.
 */
const installTiptapJsdomShims = () => {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  }
  document.elementFromPoint = () => null
  Range.prototype.getBoundingClientRect = () => rect as DOMRect
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      *[Symbol.iterator]() {
        // no rects: an empty iterable
      },
    }) as unknown as DOMRectList
  HTMLCanvasElement.prototype.getContext = (() => null) as never
}

installTiptapJsdomShims()
