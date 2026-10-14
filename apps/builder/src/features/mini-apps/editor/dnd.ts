import {
  canPlaceInSlot,
  getSlotOwnerType,
  isDescendantOf,
  type MiniAppComponentType,
  type MiniAppDefinition,
  type MiniAppSlotAddress,
} from "@chatbotx.io/mini-app"
import {
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
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

/** Where the pointer is now: where the drag started, plus how far it moved. */
const pointerY = (event: DragMoveEvent | DragEndEvent) => {
  const activator = event.activatorEvent as PointerEvent | MouseEvent
  return ("clientY" in activator ? activator.clientY : 0) + event.delta.y
}

/**
 * Where the dragged component would land, or null when it may not go there:
 * the container does not accept it, or a container is dropped into itself.
 */
export const findDropTarget = (
  definition: MiniAppDefinition,
  event: DragMoveEvent | DragEndEvent,
): DropTarget | null => {
  const source = event.active.data.current as DragSource | undefined
  const zone = event.over?.data.current as DropZone | undefined
  if (!(source && zone && event.over)) {
    return null
  }
  const target = resolveDropTarget(zone, event.over.rect, pointerY(event))
  const owner = getSlotOwnerType(definition, target.address)
  if (!(owner && canPlaceInSlot(owner, source.type))) {
    return null
  }
  const parentId = target.address.parentId
  if (
    source.kind === "node" &&
    parentId &&
    (parentId === source.nodeId ||
      isDescendantOf(definition, source.nodeId, parentId))
  ) {
    return null
  }
  return target
}
