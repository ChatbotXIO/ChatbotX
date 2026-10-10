import type {
  MiniAppComponentType,
  MiniAppSlotAddress,
} from "@chatbotx.io/mini-app"
import {
  type ClientRect,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core"

export type DragSource =
  | { kind: "palette"; type: MiniAppComponentType }
  | { kind: "node"; nodeId: string; type: MiniAppComponentType }

export type DropZone =
  | { kind: "node"; nodeId: string; address: MiniAppSlotAddress; index: number }
  | { kind: "slot"; address: MiniAppSlotAddress; length: number }

/** The resolved place a drop would land, plus what to highlight. */
export type DropTarget = {
  address: MiniAppSlotAddress
  index: number
  highlight:
    | { kind: "before" | "after"; nodeId: string }
    | { kind: "slot"; slotId: string }
}

export const slotDroppableId = (address: MiniAppSlotAddress) =>
  `slot:${address.screenKey}|${address.parentId ?? "root"}|${address.slot ?? ""}`

const area = (rect: ClientRect) => rect.width * rect.height

/**
 * Picks the innermost zone under the pointer, so dropping onto a nested
 * container's slot wins over the container itself.
 */
export const innermostCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  if (hits.length === 0) {
    return rectIntersection(args)
  }
  return [...hits].sort((first, second) => {
    const firstRect = args.droppableRects.get(first.id)
    const secondRect = args.droppableRects.get(second.id)
    return (
      (firstRect ? area(firstRect) : 0) - (secondRect ? area(secondRect) : 0)
    )
  })
}

export const resolveDropTarget = (
  zone: DropZone,
  rect: ClientRect,
  pointerY: number,
): DropTarget => {
  if (zone.kind === "slot") {
    return {
      address: zone.address,
      index: zone.length,
      highlight: { kind: "slot", slotId: slotDroppableId(zone.address) },
    }
  }
  const after = pointerY > rect.top + rect.height / 2
  return {
    address: zone.address,
    index: after ? zone.index + 1 : zone.index,
    highlight: { kind: after ? "after" : "before", nodeId: zone.nodeId },
  }
}
