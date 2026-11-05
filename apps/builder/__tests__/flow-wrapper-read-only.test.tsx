// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProps = {
  edges: unknown[]
  onConnect: (params: unknown) => void
  onConnectEnd: (event: unknown, state: unknown) => void
}

const mocks = vi.hoisted(() => ({
  props: undefined as unknown,
  addNodes: vi.fn(),
}))

// React Flow itself is replaced: this test is about what the wrapper does with
// a connection gesture, so the component only hands its props back.
vi.mock("@xyflow/react", async () => {
  const { useState } = await import("react")
  const useListState = <T,>(initial: T[]) => {
    const [items, setItems] = useState(initial)
    return [items, setItems, vi.fn()] as const
  }
  return {
    Background: () => null,
    Controls: () => null,
    Panel: () => null,
    MarkerType: { ArrowClosed: "arrowclosed" },
    addEdge: (edge: { source: string; target: string }, edges: unknown[]) => [
      ...edges,
      { id: `${edge.source}-${edge.target}`, ...edge },
    ],
    ReactFlow: (props: unknown) => {
      mocks.props = props
      return null
    },
    useNodesState: useListState,
    useEdgesState: useListState,
    useReactFlow: () => ({
      addNodes: mocks.addNodes,
      getNodes: () => [],
      getIntersectingNodes: () => [],
      updateNodeData: vi.fn(),
      updateEdge: vi.fn(),
      getEdges: () => [],
      deleteElements: vi.fn(),
      screenToFlowPosition: () => ({ x: 10, y: 10 }),
    }),
  }
})
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next-safe-action/hooks", () => ({
  useOptimisticAction: () => ({ execute: vi.fn(), executeAsync: vi.fn() }),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/features/flows/actions/update-draft-flow-version-action", () => ({
  updateDraftFlowVersionAction: { bind: () => vi.fn() },
}))
vi.mock(
  "@/features/flows/react-flow/stores/flow-history-store-provider",
  () => ({
    useFlowHistoryStoreApi: () => ({
      getState: () => ({
        takeSnapshot: vi.fn(),
        setRestoreHandlers: vi.fn(),
        clearRestoreHandlers: vi.fn(),
      }),
      subscribe: () => () => undefined,
    }),
  }),
)
vi.mock("@/features/flows/react-flow/stores/use-flow-history", () => ({
  useFlowHistory: () => ({ takeSnapshot: vi.fn() }),
}))
vi.mock("@/features/flows/react-flow/nodes/viewer", () => ({
  NodeViewer: () => null,
}))
vi.mock("@/features/flows/react-flow/panel-buttons/add-node-button", () => ({
  default: () => null,
}))
vi.mock("@/features/flows/react-flow/panel-buttons/focus-button", () => ({
  default: () => null,
}))
vi.mock("@/features/flows/react-flow/panel-buttons/zoom-in-button", () => ({
  default: () => null,
}))
vi.mock("@/features/flows/react-flow/panel-buttons/zoom-out-button", () => ({
  default: () => null,
}))
vi.mock("@/features/flows/react-flow/edges/button-edge", () => ({
  default: () => null,
}))

const { ReactFlowWrapper } = await import(
  "@/features/flows/react-flow/react-flow-wrapper"
)

const flowVersion = {
  id: "fv1",
  workspaceId: "ws1",
  nodes: [],
  edges: [],
}

let root: Root | undefined
let container: HTMLDivElement | undefined

const renderWrapper = (isReadOnly: boolean): CapturedProps => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <ReactFlowWrapper
        flowVersion={flowVersion as never}
        isReadOnly={isReadOnly}
        onAutosaveCancelChange={vi.fn()}
        onAutosaveFlushChange={vi.fn()}
        onDraftDirtiedChange={vi.fn()}
        onMarkSavedChange={vi.fn()}
        setOpenNodeDetailSheet={vi.fn()}
      />,
    )
  })
  return mocks.props as CapturedProps
}

const dropOnPane = (props: CapturedProps) =>
  act(() => {
    props.onConnectEnd(new MouseEvent("mouseup", { clientX: 5, clientY: 5 }), {
      fromHandle: { id: "success", type: "source" },
      fromNode: { id: "n1" },
      toHandle: null,
      toNode: null,
    })
  })

beforeEach(() => {
  mocks.addNodes.mockClear()
  mocks.props = undefined
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("ReactFlowWrapper connection gestures", () => {
  test("a view-only flow creates neither an edge nor a node", () => {
    const props = renderWrapper(true)

    act(() =>
      props.onConnect({
        source: "a",
        target: "b",
        sourceHandle: "success",
        targetHandle: "b",
      }),
    )
    dropOnPane(props)

    expect((mocks.props as CapturedProps).edges).toHaveLength(0)
    expect(mocks.addNodes).not.toHaveBeenCalled()
  })

  test("an editable flow connects, and a drop on empty canvas adds a node", () => {
    const props = renderWrapper(false)

    act(() =>
      props.onConnect({
        source: "a",
        target: "b",
        sourceHandle: "success",
        targetHandle: "b",
      }),
    )
    expect((mocks.props as CapturedProps).edges).toHaveLength(1)

    dropOnPane(props)
    expect(mocks.addNodes).toHaveBeenCalledTimes(1)
  })
})
