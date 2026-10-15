"use client"

import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useDefaultText } from "../lib/use-default-text"
import { type DragSource, type DropTarget, findDropTarget } from "./dnd"
import { useMiniAppEditor } from "./editor-context"

/**
 * Drag and drop on the canvas: a palette item adds a component, a canvas
 * node moves; the drop target is tracked for the highlight while dragging.
 */
export function useCanvasDnd() {
  const t = useTranslations("miniApps.editor")
  const defaultText = useDefaultText()
  const definition = useMiniAppEditor((state) => state.definition)
  const addNode = useMiniAppEditor((state) => state.addNode)
  const moveNode = useMiniAppEditor((state) => state.moveNode)
  const [dragSource, setDragSource] = useState<DragSource | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const reset = () => {
    setDragSource(null)
    setDropTarget(null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const source = event.active.data.current as DragSource | undefined
    const target = findDropTarget(definition, event)
    reset()
    if (!(source && target)) {
      if (source && event.over) {
        toast.error(t("cannotDropHere"))
      }
      return
    }
    if (source.kind === "palette") {
      addNode(source.type, defaultText, {
        address: target.address,
        index: target.index,
      })
    } else {
      moveNode(source.nodeId, target.address, target.index)
    }
  }

  return {
    dragSource,
    dropTarget,
    dndContextProps: {
      sensors,
      onDragStart: (event: DragStartEvent) =>
        setDragSource((event.active.data.current as DragSource) ?? null),
      onDragMove: (event: DragMoveEvent) =>
        setDropTarget(findDropTarget(definition, event)),
      onDragEnd,
      onDragCancel: reset,
    },
  }
}
