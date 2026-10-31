// @vitest-environment jsdom
import { act, type ReactNode, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { FlowHistoryStoreProvider } from "../stores/flow-history-store-provider"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  takeSnapshot: vi.fn(),
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  applyRouteUpdatesInNodes: (nodes: unknown[]) => nodes,
  nodeTypeSchema: {
    enum: {
      addNotes: "addNotes",
      condition: "condition",
      followUp: "followUp",
      landingPage: "landingPage",
      performAction: "performAction",
      sendMail: "sendMail",
      sendMessage: "sendMessage",
      splitTraffic: "splitTraffic",
      startFlow: "startFlow",
      wait: "wait",
    },
  },
  sendMessageNodeDefaultFn: vi.fn(),
}))

vi.mock("@xyflow/react", () => ({
  Background: () => null,
  Controls: ({ children }: { children: ReactNode }) => <>{children}</>,
  MarkerType: { ArrowClosed: "arrowclosed" },
  Panel: ({ children }: { children: ReactNode }) => <>{children}</>,
  ReactFlow: ({
    children,
    onNodesChange,
  }: {
    children: ReactNode
    onNodesChange: (changes: unknown[]) => void
  }) => (
    <>
      <button
        onClick={() =>
          onNodesChange([
            {
              item: {
                data: { name: "Added node" },
                id: "node-1",
                position: { x: 0, y: 0 },
                type: "sendMessage",
              },
              type: "add",
            },
          ])
        }
        type="button"
      >
        Add node
      </button>
      {children}
    </>
  ),
  useEdgesState: (initialEdges: unknown[]) => {
    const [edges, setEdges] = useState(initialEdges)
    return [edges, setEdges, vi.fn()]
  },
  useNodesState: (initialNodes: unknown[]) => {
    const [nodes, setNodes] = useState(initialNodes)
    const onNodesChange = (changes: Array<{ item: unknown; type: string }>) => {
      for (const change of changes) {
        if (change.type === "add") {
          setNodes((currentNodes: unknown[]) =>
            currentNodes.concat(change.item),
          )
        }
      }
    }

    return [nodes, setNodes, onNodesChange]
  },
  useReactFlow: () => ({
    addNodes: vi.fn(),
    deleteElements: vi.fn(),
    getEdges: () => [],
    getIntersectingNodes: () => [],
    getNodes: () => [],
    screenToFlowPosition: () => ({ x: 0, y: 0 }),
    updateEdge: vi.fn(),
    updateNodeData: vi.fn(),
  }),
}))

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("next-safe-action/hooks", () => ({
  useOptimisticAction: () => ({
    execute: mocks.execute,
    executeAsync: vi.fn(),
  }),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/features/flows/actions/update-draft-flow-version-action", () => ({
  updateDraftFlowVersionAction: vi.fn(),
}))
vi.mock("../edges/button-edge", () => ({ default: () => null }))
vi.mock("../flow-mutation-context", () => ({
  FlowMutationProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock("../nodes/viewer", () => ({ NodeViewer: () => null }))
vi.mock("../panel-buttons/add-node-button", () => ({ default: () => null }))
vi.mock("../panel-buttons/focus-button", () => ({ default: () => null }))
vi.mock("../panel-buttons/zoom-in-button", () => ({ default: () => null }))
vi.mock("../panel-buttons/zoom-out-button", () => ({ default: () => null }))
vi.mock("../stores/use-flow-history", () => ({
  useFlowHistory: () => ({ takeSnapshot: mocks.takeSnapshot }),
}))

import { ReactFlowWrapper } from "../react-flow-wrapper"

const flowVersion = {
  edges: [],
  id: "1",
  nodes: [],
  workspaceId: "1",
} as unknown as FlowVersionResource

describe("ReactFlowWrapper", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    mocks.execute.mockReset()
    mocks.takeSnapshot.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  test("saves a pending node change when the editor unmounts", () => {
    act(() => {
      root.render(
        <FlowHistoryStoreProvider>
          <ReactFlowWrapper
            flowVersion={flowVersion}
            isReadOnly={false}
            onAutosaveCancelChange={vi.fn()}
            onAutosaveFlushChange={vi.fn()}
            onDraftDirtiedChange={vi.fn()}
            onMarkSavedChange={vi.fn()}
            setOpenNodeDetailSheet={vi.fn()}
          />
        </FlowHistoryStoreProvider>,
      )
    })

    act(() => {
      container.querySelector("button")?.click()
    })
    act(() => {
      root.unmount()
    })

    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.execute).toHaveBeenCalledWith({
      edges: [],
      nodes: [
        {
          data: { name: "Added node" },
          id: "node-1",
          position: { x: 0, y: 0 },
          type: "sendMessage",
        },
      ],
    })
  })
})
