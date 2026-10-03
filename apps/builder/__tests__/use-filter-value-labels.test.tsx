// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { mockUseQuery, queryOptions } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  queryOptions: vi.fn((options: unknown) => options),
}))

vi.mock("@tanstack/react-query", () => ({ useQuery: mockUseQuery }))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactFilterAPI: {
      resolveFilterValueLabelsAPI: { queryOptions },
    },
  },
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))

const { MAX_FILTER_VALUE_LABEL_IDS } = await import(
  "@/features/contact-filter/schema/value-labels"
)
const { useFilterValueLabels } = await import(
  "@/features/contact-filter/components/use-filter-value-labels"
)

type Conditions = Parameters<typeof useFilterValueLabels>[0]

const Probe = ({
  conditions,
  onData,
}: {
  conditions: Conditions
  onData: (data: unknown) => void
}) => {
  onData(useFilterValueLabels(conditions))
  return null
}

describe("useFilterValueLabels", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mockUseQuery.mockReturnValue({ data: undefined })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  const render = (conditions: Conditions, onData = vi.fn()) => {
    act(() => {
      root.render(<Probe conditions={conditions} onData={onData} />)
    })
    return onData
  }

  test("looks up the ids a filter references in one request", () => {
    render([
      { field: "tags", value: ["1", "2"] },
      { field: "conversationAssigned", value: ["u_7", "unassigned"] },
    ])

    expect(queryOptions).toHaveBeenCalledWith({
      input: { workspaceId: "ws-1", tags: ["1", "2"], members: ["7"] },
      enabled: true,
      staleTime: 0,
    })
  })

  test("does not request anything when the filter has no id-backed values", () => {
    render([{ field: "fullName", value: "titan" }])

    expect(queryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  test("does not request when a type holds more ids than one request allows", () => {
    render([
      {
        field: "tags",
        value: Array.from(
          { length: MAX_FILTER_VALUE_LABEL_IDS + 1 },
          (_, index) => String(index + 1),
        ),
      },
    ])

    expect(queryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  test("returns nothing until the lookup has data and keeps data after a failed refetch", () => {
    const onData = render([{ field: "tags", value: ["1"] }])
    expect(onData).toHaveBeenLastCalledWith(undefined)

    const labels = { tags: [{ id: "1", name: "VIP" }] }
    // TanStack keeps `data` while a background refetch is in the error state.
    mockUseQuery.mockReturnValue({ data: labels, isError: true })
    render([{ field: "tags", value: ["1"] }], onData)

    expect(onData).toHaveBeenLastCalledWith(labels)
  })
})
