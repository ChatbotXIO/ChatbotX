import { QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"
import { concernsContact } from "@/features/pipelines/lib/contact-panel-refresh"
import { usePipelineRealtimeRefetch } from "@/features/pipelines/lib/use-pipeline-realtime-refetch"
import { orpc } from "@/lib/orpc/query"
import { makeQueryClient } from "./query-test-utils"

type Handler = (event: {
  data: { pipelineId: string; change: string; itemId?: string }
}) => void

const realtime = vi.hoisted(() => ({ handler: null as Handler | null }))
vi.mock("@/features/realtime/use-workspace-realtime-events", () => ({
  useWorkspaceRealtimeEvents: (handlers: { pipelineItemChanged: Handler }) => {
    realtime.handler = handlers.pipelineItemChanged
  },
}))
// Run the debounced refetch at once, so each event flushes immediately.
vi.mock("@chatbotx.io/ui/hooks/use-debounced-callback", () => ({
  useDebouncedCallback: (callback: () => void) => callback,
}))

function Probe() {
  usePipelineRealtimeRefetch((event) => event.data.pipelineId === "p1")
  return null
}

const mount = () => {
  const queryClient = makeQueryClient()
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")
  const root = createRoot(document.createElement("div"))
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    )
  })
  const invalidatedKeys = () =>
    invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
  return { invalidate, invalidatedKeys, unmount: () => root.unmount() }
}

const detailKey = JSON.stringify(orpc.pipelinesAPI.privateGetPipelineAPI.key())
const boardKey = JSON.stringify(orpc.pipelinesAPI.privateGetBoardAPI.key())

describe("usePipelineRealtimeRefetch", () => {
  test("an item event refetches item reads but not the pipeline structure", () => {
    const { invalidatedKeys, unmount } = mount()

    realtime.handler?.({
      data: { pipelineId: "p1", change: "moved", itemId: "i1" },
    })

    expect(invalidatedKeys()).toContain(boardKey)
    expect(invalidatedKeys()).not.toContain(detailKey)
    unmount()
  })

  test("a pipeline-wide event also refetches stages and fields, once", () => {
    const { invalidate, invalidatedKeys, unmount } = mount()

    realtime.handler?.({ data: { pipelineId: "p1", change: "bulk" } })
    expect(invalidatedKeys()).toContain(detailKey)

    invalidate.mockClear()
    realtime.handler?.({
      data: { pipelineId: "p1", change: "updated", itemId: "i1" },
    })
    expect(invalidatedKeys()).not.toContain(detailKey)
    unmount()
  })

  // What a workspace currency change publishes for each pipeline without an
  // override: an update with a pipeline id and neither an item nor a contact.
  test("a currency change event refetches the board and the pipeline reads", () => {
    const { invalidatedKeys, unmount } = mount()

    realtime.handler?.({ data: { pipelineId: "p1", change: "updated" } })

    expect(invalidatedKeys()).toContain(boardKey)
    expect(invalidatedKeys()).toContain(detailKey)
    unmount()
  })

  test("the inbox panel of any contact also reacts to an event without a contact", () => {
    expect(concernsContact({}, "contact-1")).toBe(true)
    expect(concernsContact({ contactId: "contact-1" }, "contact-1")).toBe(true)
    expect(concernsContact({ contactId: "contact-2" }, "contact-1")).toBe(false)
  })

  test("an event of another pipeline refetches nothing", () => {
    const { invalidate, unmount } = mount()

    realtime.handler?.({ data: { pipelineId: "p2", change: "bulk" } })

    expect(invalidate).not.toHaveBeenCalled()
    unmount()
  })
})
