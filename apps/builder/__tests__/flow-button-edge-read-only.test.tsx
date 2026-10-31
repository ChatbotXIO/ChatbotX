// @vitest-environment jsdom

import type { EdgeProps } from "@xyflow/react"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import ButtonEdge from "@/features/flows/react-flow/edges/button-edge"
import {
  type FlowMutationContextValue,
  FlowMutationProvider,
} from "@/features/flows/react-flow/flow-mutation-context"

// The edge only needs React Flow for geometry and the toolbar's visibility;
// this test is about whether the delete action is offered.
vi.mock("@xyflow/react", () => ({
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => children,
  EdgeToolbar: ({
    children,
    isVisible,
  }: {
    children: ReactNode
    isVisible: boolean
  }) => (isVisible ? children : null),
  getBezierPath: () => ["M0,0", 0, 0],
  useReactFlow: () => ({ deleteElements: vi.fn() }),
}))
vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => (
    <button type="button" {...props} />
  ),
}))

const mutation = (isReadOnly: boolean): FlowMutationContextValue => ({
  isFlowMutating: false,
  isReadOnly,
  duplicateNode: vi.fn(),
  deleteNode: vi.fn(),
})

let root: Root | undefined
let container: HTMLDivElement | undefined

const renderEdge = (isReadOnly: boolean | "no-provider") => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const edgeProps = {
    id: "e1",
    sourceX: 0,
    sourceY: 0,
    targetX: 10,
    targetY: 10,
    sourcePosition: "right",
    targetPosition: "left",
    data: { isHovered: true },
  } as unknown as EdgeProps
  const edge = <ButtonEdge {...edgeProps} />
  act(() => {
    root?.render(
      isReadOnly === "no-provider" ? (
        edge
      ) : (
        <FlowMutationProvider value={mutation(isReadOnly)}>
          {edge}
        </FlowMutationProvider>
      ),
    )
  })
  return container.querySelector('[aria-label="Delete edge"]') !== null
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("ButtonEdge delete action", () => {
  test("is offered on a hovered edge of an editable flow", () => {
    expect(renderEdge(false)).toBe(true)
  })

  test("is not offered for a flow installed from a view-only template", () => {
    expect(renderEdge(true)).toBe(false)
  })

  test("is not offered outside the editor (the analytics viewer has no provider)", () => {
    expect(renderEdge("no-provider")).toBe(false)
  })
})
