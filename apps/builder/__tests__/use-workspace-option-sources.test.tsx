// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockUseParams,
  privateListBroadcastOptionsAPI,
  listRefLinkOptionsAuthenticatedAPI,
} = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
  privateListBroadcastOptionsAPI: vi.fn(),
  listRefLinkOptionsAuthenticatedAPI: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useParams: mockUseParams,
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    broadcastAPIs: {
      privateListBroadcastOptionsAPI,
    },
    refLinksAPI: {
      listRefLinkOptionsAuthenticatedAPI,
    },
  },
}))

const { useBroadcastSelectOptions, useReflinkSelectOptions } = await import(
  "../src/features/contact-filter/components/use-workspace-option-sources"
)

function BroadcastProbe({
  onRender,
}: {
  onRender: (options: unknown) => void
}) {
  onRender(useBroadcastSelectOptions())
  return null
}

function ReflinkProbe({ onRender }: { onRender: (options: unknown) => void }) {
  onRender(useReflinkSelectOptions())
  return null
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

describe("useWorkspaceOptionEndpoint (via useBroadcastSelectOptions/useReflinkSelectOptions)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    // Distinct workspace id per test run (all module-level caches are keyed
    // by workspaceId:source:searchParams) so tests never share a cache entry.
    mockUseParams.mockReturnValue({ workspaceId: `ws-${Math.random()}` })
    privateListBroadcastOptionsAPI.mockResolvedValue({
      data: [{ id: "b1", name: "Broadcast One" }],
    })
    listRefLinkOptionsAuthenticatedAPI.mockResolvedValue({
      data: [{ id: "r1", name: "Reflink One" }],
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("useBroadcastSelectOptions calls privateListBroadcastOptionsAPI with the whatsapp channel default", async () => {
    let latest: unknown
    act(() => {
      root.render(<BroadcastProbe onRender={(options) => (latest = options)} />)
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
    expect(privateListBroadcastOptionsAPI.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ channel: "whatsapp" }),
    )
    expect(latest).toEqual([{ value: "b1", label: "Broadcast One" }])
    expect(listRefLinkOptionsAuthenticatedAPI).not.toHaveBeenCalled()
  })

  test("useReflinkSelectOptions calls listRefLinkOptionsAuthenticatedAPI, not the broadcasts endpoint", async () => {
    let latest: unknown
    act(() => {
      root.render(<ReflinkProbe onRender={(options) => (latest = options)} />)
    })
    await flush()

    expect(listRefLinkOptionsAuthenticatedAPI).toHaveBeenCalledTimes(1)
    expect(latest).toEqual([{ value: "r1", label: "Reflink One" }])
    expect(privateListBroadcastOptionsAPI).not.toHaveBeenCalled()
  })

  test("re-rendering with the same workspace serves the cache instead of refetching", async () => {
    const workspaceId = `ws-${Math.random()}`
    mockUseParams.mockReturnValue({ workspaceId })

    act(() => {
      root.render(<BroadcastProbe onRender={() => undefined} />)
    })
    await flush()
    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(<BroadcastProbe onRender={() => undefined} />)
    })
    await flush()

    // Same workspaceId:source:searchParams cache key — no second call.
    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
  })

  test("broadcasts and reflinks for the same workspace hit distinct cache keys (different source)", async () => {
    const workspaceId = `ws-${Math.random()}`
    mockUseParams.mockReturnValue({ workspaceId })

    act(() => {
      root.render(
        <>
          <BroadcastProbe onRender={() => undefined} />
          <ReflinkProbe onRender={() => undefined} />
        </>,
      )
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
    expect(listRefLinkOptionsAuthenticatedAPI).toHaveBeenCalledTimes(1)
  })
})
