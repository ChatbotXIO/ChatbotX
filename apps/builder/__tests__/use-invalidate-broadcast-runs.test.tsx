import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const invalidateQueries = vi.hoisted(() => vi.fn())
vi.mock("@/lib/query/query-client", () => ({
  getQueryClient: () => ({ invalidateQueries }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    broadcastAPIs: {
      privateListBroadcastRunGroupsAPI: { key: () => ["run-groups"] },
      privateListBroadcastOccurrencesAPI: { key: () => ["occurrences"] },
    },
  },
}))

import { useInvalidateBroadcastRuns } from "@/features/broadcasts/hooks/use-invalidate-broadcast-runs"

describe("useInvalidateBroadcastRuns", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    invalidateQueries.mockReset()
    invalidateQueries.mockResolvedValue(undefined)
  })

  test("refreshes both the groups and the slots of every runs page", async () => {
    let invalidate: (() => Promise<unknown>) | undefined
    function Probe() {
      invalidate = useInvalidateBroadcastRuns()
      return null
    }
    const container = document.createElement("div")
    const root = createRoot(container)
    act(() => {
      root.render(<Probe />)
    })

    await invalidate?.()

    expect(invalidateQueries).toHaveBeenCalledTimes(2)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["run-groups"] })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["occurrences"],
    })
    act(() => {
      root.unmount()
    })
  })
})
