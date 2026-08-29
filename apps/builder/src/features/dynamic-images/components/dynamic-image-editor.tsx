"use client"

import type {
  DynamicImageDocument,
  DynamicImageElement,
} from "@chatbotx.io/database/partials"
import { useCallback, useState } from "react"
import { DynamicImageCanvas } from "./canvas"
import {
  createDefaultDynamicImageElement,
  type DynamicImageElementType,
} from "./element-defaults"
import { DynamicImageLayerPanel } from "./layer-panel"
import { DynamicImageEditorToolbar } from "./toolbar"
import type { DynamicImageElementPatch } from "./types"

export type DynamicImageEditorProps = {
  workspaceId: string
  value: DynamicImageDocument
  onChange: (document: DynamicImageDocument) => void
}

const NEW_ELEMENT_OFFSET_STEP = 24
const NEW_ELEMENT_OFFSET_CYCLE = 6

/**
 * Every new element defaults to the same width/height at (0, 0) — stacking
 * new elements directly on top of whatever was added before and hiding it
 * completely. Staggering the spawn position keeps each new element visible
 * as soon as it's added, so users don't mistake an occluded element for one
 * that failed to render.
 */
function getStaggeredPosition(
  document: DynamicImageDocument,
  elementWidth: number,
  elementHeight: number,
) {
  const step = document.elements.length % NEW_ELEMENT_OFFSET_CYCLE
  const offset = step * NEW_ELEMENT_OFFSET_STEP
  return {
    x: Math.max(0, Math.min(offset, document.width - elementWidth)),
    y: Math.max(0, Math.min(offset, document.height - elementHeight)),
  }
}

export function DynamicImageEditor(props: DynamicImageEditorProps) {
  const { workspaceId, value, onChange } = props

  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  )

  const handleAddElement = useCallback(
    (type: DynamicImageElementType) => {
      const base = createDefaultDynamicImageElement(type)
      const newElement = {
        ...base,
        ...getStaggeredPosition(value, base.width, base.height),
      }
      onChange({ ...value, elements: [...value.elements, newElement] })
      setSelectedElementId(newElement.id)
    },
    [value, onChange],
  )

  const handleUpdateElement = useCallback(
    (id: string, patch: DynamicImageElementPatch) => {
      onChange({
        ...value,
        elements: value.elements.map((element) =>
          element.id === id
            ? ({
                ...element,
                ...patch,
                type: element.type,
              } as DynamicImageElement)
            : element,
        ),
      })
    },
    [value, onChange],
  )

  const handleRemoveElement = useCallback(
    (id: string) => {
      onChange({
        ...value,
        elements: value.elements.filter((element) => element.id !== id),
      })
      setSelectedElementId((current) => (current === id ? null : current))
    },
    [value, onChange],
  )

  const handleReorderElements = useCallback(
    (elements: DynamicImageDocument["elements"]) => {
      onChange({ ...value, elements })
    },
    [value, onChange],
  )

  const handleResizeCanvas = useCallback(
    (size: { width: number; height: number }) => {
      onChange({ ...value, ...size })
    },
    [value, onChange],
  )

  return (
    <div
      className="flex h-full min-h-0 w-full gap-4"
      style={{ minHeight: value.height + 50 }}
    >
      <div className="flex min-h-0 w-80 shrink-0 flex-col gap-4">
        <DynamicImageEditorToolbar onAddElement={handleAddElement} />
        <DynamicImageLayerPanel
          elements={value.elements}
          onRemove={handleRemoveElement}
          onReorder={handleReorderElements}
          onSelectElement={setSelectedElementId}
          onUpdateElement={handleUpdateElement}
          selectedElementId={selectedElementId}
          workspaceId={workspaceId}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <DynamicImageCanvas
          onResizeCanvas={handleResizeCanvas}
          onSelectElement={setSelectedElementId}
          onUpdateElement={handleUpdateElement}
          selectedElementId={selectedElementId}
          value={value}
        />
      </div>
    </div>
  )
}
