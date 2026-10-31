// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  type FlowMutationContextValue,
  FlowMutationProvider,
} from "@/features/flows/react-flow/flow-mutation-context"
import { FlowNodeToolbar } from "@/features/flows/react-flow/toolbar/node-toolbar"

// Each action reads React Flow's store and the flow history; this test is only
// about which of them the toolbar offers, so they are replaced by markers.
vi.mock("@/features/flows/react-flow/toolbar/set-start-node", () => ({
  SetStartNode: () => <span data-testid="set-start" />,
}))
vi.mock("@/features/flows/react-flow/toolbar/get-node-id", () => ({
  GetNodeId: () => <span data-testid="get-id" />,
}))
vi.mock("@/features/flows/react-flow/toolbar/duplicate-node", () => ({
  DuplicateNode: () => <span data-testid="duplicate" />,
}))
vi.mock("@/features/flows/react-flow/toolbar/delete-node", () => ({
  DeleteNode: () => <span data-testid="delete" />,
}))

const mutation = (isReadOnly: boolean): FlowMutationContextValue => ({
  isFlowMutating: false,
  isReadOnly,
  duplicateNode: vi.fn(),
  deleteNode: vi.fn(),
})

let root: Root | undefined
let container: HTMLDivElement | undefined

const renderToolbar = (input: {
  isReadOnly: boolean
  isStartNode: boolean
}) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <FlowMutationProvider value={mutation(input.isReadOnly)}>
        <FlowNodeToolbar isStartNode={input.isStartNode} nodeId="n1" />
      </FlowMutationProvider>,
    )
  })
  const offered = (id: string) =>
    container?.querySelector(`[data-testid="${id}"]`) !== null
  return {
    setStart: offered("set-start"),
    getId: offered("get-id"),
    duplicate: offered("duplicate"),
    remove: offered("delete"),
  }
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("FlowNodeToolbar", () => {
  test("a flow installed from a view-only template offers only the harmless copy-id action", () => {
    expect(renderToolbar({ isReadOnly: true, isStartNode: false })).toEqual({
      setStart: false,
      getId: true,
      duplicate: false,
      remove: false,
    })
  })

  test("an editable flow offers every action, and never deletes its start node", () => {
    expect(renderToolbar({ isReadOnly: false, isStartNode: false })).toEqual({
      setStart: true,
      getId: true,
      duplicate: true,
      remove: true,
    })
  })

  test("an editable flow's start node cannot be deleted", () => {
    expect(renderToolbar({ isReadOnly: false, isStartNode: true }).remove).toBe(
      false,
    )
  })
})
