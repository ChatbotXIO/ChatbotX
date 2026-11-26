import {
  type Collision,
  type CollisionDetection,
  closestCorners,
  type DroppableContainer,
  pointerWithin,
} from "@dnd-kit/core"
import { hasSortableData } from "@dnd-kit/sortable"

const isCard = (container: DroppableContainer) => hasSortableData(container)

/**
 * Collision for dragging a card between stage columns, wherever the pointer
 * is: over a card, that card; over a column's gap or its space below the last
 * card, the nearest card of that column (an empty column is the target
 * itself). `closestCorners` on the whole board alone would pick a card of a
 * neighbouring column for a drop in a tall, nearly empty column, so it is the
 * fallback for what the pointer is not over, and for the keyboard (no pointer).
 */
export const cardCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const hitCard = hits.find((hit) => {
    const container = args.droppableContainers.find(
      (entry) => entry.id === hit.id,
    )
    return container !== undefined && isCard(container)
  })
  if (hitCard) {
    return [hitCard]
  }
  const hitColumn: Collision | undefined = hits[0]
  if (!hitColumn) {
    return closestCorners(args)
  }
  const cardsOfColumn = args.droppableContainers.filter(
    (container) =>
      isCard(container) &&
      container.data.current?.sortable.containerId === hitColumn.id,
  )
  return cardsOfColumn.length > 0
    ? closestCorners({ ...args, droppableContainers: cardsOfColumn })
    : [hitColumn]
}
