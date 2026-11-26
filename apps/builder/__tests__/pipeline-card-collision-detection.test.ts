import type { ClientRect, DroppableContainer } from "@dnd-kit/core"
import { describe, expect, test } from "vitest"
import { cardCollisionDetection } from "../src/features/pipelines/lib/card-collision-detection"

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }) as ClientRect

const column = (id: string): DroppableContainer =>
  ({ id, data: { current: undefined }, disabled: false }) as never

const card = (id: string, containerId: string): DroppableContainer =>
  ({
    id,
    data: { current: { sortable: { containerId, index: 0, items: [] } } },
    disabled: false,
  }) as never

// Two columns: "a" holds one short card at the top, "b" is empty.
const layout = () => {
  const containers = [column("a"), card("1", "a"), column("b")]
  const droppableRects = new Map<string, ClientRect>([
    ["a", rect(0, 0, 300, 700)],
    ["1", rect(10, 10, 280, 100)],
    ["b", rect(320, 0, 300, 700)],
  ])
  return { containers, droppableRects }
}

const detect = (
  pointer: { x: number; y: number } | null,
  collisionRect: ClientRect,
) => {
  const { containers, droppableRects } = layout()
  return cardCollisionDetection({
    active: { id: "9" } as never,
    collisionRect,
    droppableRects: droppableRects as never,
    droppableContainers: containers,
    pointerCoordinates: pointer,
  }).map((collision) => collision.id)
}

describe("cardCollisionDetection", () => {
  test("a pointer over a card targets that card", () => {
    expect(detect({ x: 100, y: 50 }, rect(50, 20, 280, 100))).toEqual(["1"])
  })

  test("a pointer in the space below the last card targets the nearest card of that column", () => {
    expect(detect({ x: 100, y: 500 }, rect(50, 450, 280, 100))).toEqual(["1"])
  })

  test("a pointer in an empty column targets the column, not a card of its neighbour", () => {
    // The dragged card overhangs column "a" (its corners are near card "1").
    expect(detect({ x: 450, y: 400 }, rect(300, 350, 280, 100))).toEqual(["b"])
  })

  test("without a pointer (keyboard) the closest droppable by corners wins", () => {
    expect(detect(null, rect(10, 10, 280, 100))[0]).toBe("1")
  })
})
