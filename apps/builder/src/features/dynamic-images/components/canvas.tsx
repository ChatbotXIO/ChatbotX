"use client"

import type {
  DynamicImageDocument,
  DynamicImageElement,
} from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Rnd } from "react-rnd"
import { DynamicImageImageLayerPreview } from "./elements/image-layer"
import { DynamicImageQrCodeLayerPreview } from "./elements/qr-code-layer"
import { DynamicImageTextLayerPreview } from "./elements/text-layer"
import type { DynamicImageElementPatch } from "./types"

const MIN_ELEMENT_SIZE = 16
const MIN_CANVAS_SIZE = 100
const CANVAS_RESIZE_HANDLE_SIZE = 14
const CANVAS_RESIZE_HANDLE_OFFSET = 10
// Higher than any real element index, so the canvas frame overlay always
// paints above every layer — even a layer sized to cover the whole canvas.
const CANVAS_FRAME_Z_INDEX = 100_000

// Pushed outside the canvas bounds (negative inset) so it never sits on top
// of an in-canvas element's own corner — an element sized to match the
// canvas exactly would otherwise share the same pixel as this handle, and
// whichever one is later in the DOM (the canvas, being the outer Rnd) would
// swallow the drag meant for the element.
const CANVAS_RESIZE_HANDLE_STYLE = {
  bottomRight: {
    width: CANVAS_RESIZE_HANDLE_SIZE,
    height: CANVAS_RESIZE_HANDLE_SIZE,
    right: -CANVAS_RESIZE_HANDLE_OFFSET,
    bottom: -CANVAS_RESIZE_HANDLE_OFFSET,
    background: "var(--color-primary)",
    borderRadius: "9999px",
    cursor: "nwse-resize",
  },
}

type DynamicImageCanvasProps = {
  value: DynamicImageDocument
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onUpdateElement: (id: string, patch: DynamicImageElementPatch) => void
  onResizeCanvas: (size: { width: number; height: number }) => void
}

function DynamicImageElementPreview({
  element,
}: {
  element: DynamicImageElement
}) {
  if (element.type === "image") {
    return <DynamicImageImageLayerPreview element={element} />
  }

  if (element.type === "text") {
    return <DynamicImageTextLayerPreview element={element} />
  }

  return <DynamicImageQrCodeLayerPreview element={element} />
}

export function DynamicImageCanvas(props: DynamicImageCanvasProps) {
  const {
    value,
    selectedElementId,
    onSelectElement,
    onUpdateElement,
    onResizeCanvas,
  } = props

  return (
    <div
      className={cn(
        // `flex-1 min-h-0` alone only bounds this pane's height when every
        // ancestor up to a fixed-height/viewport root is *also* a properly
        // sized flex/grid container — one plain block ancestor (a form's
        // `space-y-*` stack, a Card body, ...) breaks that chain silently,
        // `overflow-auto` then never kicks in, and a canvas larger than the
        // viewport just grows the whole page instead of scrolling in place.
        // The explicit height is a floor that works with zero ancestor
        // cooperation; `flex-1` still lets it grow inside a layout that
        // *does* provide a bounded height.
        // `relative` makes this pane the positioning context for the
        // canvas's `<Rnd>` (which is `position: absolute` internally) — no
        // `relative`/`absolute` ancestor here means it anchors to whichever
        // ancestor further up the tree happens to have one instead, which
        // visually escapes this pane's bounds and its scroll/clip entirely.
        "relative h-150 min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-6",
        "bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] bg-size-[16px_16px]",
      )}
    >
      <Rnd
        className="bg-white shadow-sm dark:bg-neutral-900"
        disableDragging
        enableResizing={{ bottomRight: true }}
        minHeight={MIN_CANVAS_SIZE}
        minWidth={MIN_CANVAS_SIZE}
        onResizeStop={(_event, _direction, ref) => {
          onResizeCanvas({
            width: Number.parseInt(ref.style.width, 10),
            height: Number.parseInt(ref.style.height, 10),
          })
        }}
        position={{ x: 0, y: 0 }}
        resizeHandleStyles={CANVAS_RESIZE_HANDLE_STYLE}
        size={{ height: value.height, width: value.width }}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas background click deselects the current element; it is a design surface, not semantic content */}
        <div
          className="relative h-full w-full"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onSelectElement(null)
            }
          }}
          role="presentation"
        >
          {value.elements.map((element, index) => {
            const isSelected = element.id === selectedElementId
            const isSquareLocked = element.type === "qrCode"

            return (
              <Rnd
                bounds="parent"
                className={cn(
                  "outline outline-1 outline-transparent",
                  isSelected && "outline-2 outline-primary",
                )}
                key={element.id}
                lockAspectRatio={isSquareLocked}
                minHeight={MIN_ELEMENT_SIZE}
                minWidth={MIN_ELEMENT_SIZE}
                onDragStop={(_event, data) => {
                  onUpdateElement(element.id, {
                    x: Math.round(data.x),
                    y: Math.round(data.y),
                  })
                }}
                onMouseDown={(event) => {
                  event.stopPropagation()
                  onSelectElement(element.id)
                }}
                onResizeStop={(_event, _direction, ref, _delta, position) => {
                  const width = Number.parseInt(ref.style.width, 10)
                  const height = Number.parseInt(ref.style.height, 10)

                  onUpdateElement(element.id, {
                    height,
                    width,
                    x: Math.round(position.x),
                    y: Math.round(position.y),
                    ...(isSquareLocked ? { size: width } : {}),
                  })
                }}
                position={{ x: element.x, y: element.y }}
                size={{ height: element.height, width: element.width }}
                style={{ zIndex: index }}
              >
                <div className="h-full w-full">
                  <DynamicImageElementPreview element={element} />
                </div>
              </Rnd>
            )
          })}

          {/* Visual frame only — sits above every layer so the canvas edge
              stays visible even when a layer covers the whole canvas.
              `pointer-events-none` lets drag/resize/click pass through to
              whatever layer is actually underneath it. */}
          <div
            className="pointer-events-none absolute inset-0 border-2 border-primary"
            style={{ zIndex: CANVAS_FRAME_Z_INDEX }}
          />
        </div>
      </Rnd>
    </div>
  )
}
