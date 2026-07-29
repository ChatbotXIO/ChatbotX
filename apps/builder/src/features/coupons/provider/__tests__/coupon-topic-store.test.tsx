// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { fakeTopicStoreState, mockListCouponTopicOptionsAPI } = vi.hoisted(
  () => ({
    fakeTopicStoreState: {
      workspaceId: "workspace-1",
      topics: [
        { id: "topic-active", name: "Active topic", expiresAt: null },
        {
          id: "topic-future",
          name: "Future topic",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        {
          id: "topic-expired",
          name: "Expired topic",
          expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ],
      isInitialized: true,
      isLoading: false,
      error: null,
      initialize: vi.fn(),
      refresh: vi.fn(),
    },
    mockListCouponTopicOptionsAPI: vi.fn(),
  }),
)

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    couponsAPI: {
      listCouponTopicOptionsAPI: mockListCouponTopicOptionsAPI,
    },
  },
}))

const { createCouponTopicStore } = await import("../coupon-topic-store")
const { CouponTopicStoreContext } = await import(
  "../coupon-topic-store-context"
)
const { useCouponTopicOptions } = await import("../use-coupon-topic-options")

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  mockListCouponTopicOptionsAPI.mockReset()
  fakeTopicStoreState.initialize.mockReset()
  fakeTopicStoreState.refresh.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe("createCouponTopicStore", () => {
  test("loads once per workspace and caches the topics", async () => {
    mockListCouponTopicOptionsAPI.mockResolvedValueOnce([
      { id: "topic-1", name: "Summer", expiresAt: null },
    ])

    const store = createCouponTopicStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mockListCouponTopicOptionsAPI).toHaveBeenCalledTimes(1)
    expect(mockListCouponTopicOptionsAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      issueableOnly: false,
    })
    expect(store.getState().topics).toEqual([
      { id: "topic-1", name: "Summer", expiresAt: null },
    ])
    expect(store.getState().isInitialized).toBe(true)
    expect(store.getState().error).toBeNull()
  })

  test("refresh forces a reload after mutations", async () => {
    mockListCouponTopicOptionsAPI
      .mockResolvedValueOnce([
        { id: "topic-1", name: "Summer", expiresAt: null },
      ])
      .mockResolvedValueOnce([
        { id: "topic-2", name: "Autumn", expiresAt: null },
      ])

    const store = createCouponTopicStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().refresh()

    expect(mockListCouponTopicOptionsAPI).toHaveBeenCalledTimes(2)
    expect(store.getState().topics).toEqual([
      { id: "topic-2", name: "Autumn", expiresAt: null },
    ])
  })
})

describe("useCouponTopicOptions", () => {
  test("returns options and labelById with issueable filtering", () => {
    let result: ReturnType<typeof useCouponTopicOptions> | undefined
    const store = createCouponTopicStore(fakeTopicStoreState)

    const Harness = ({ issueableOnly }: { issueableOnly?: boolean }) => {
      result = useCouponTopicOptions({ issueableOnly })
      return null
    }

    act(() => {
      root.render(
        <CouponTopicStoreContext.Provider value={store}>
          <Harness issueableOnly={true} />
        </CouponTopicStoreContext.Provider>,
      )
    })

    expect(result?.options).toEqual([
      { label: "Active topic", value: "topic-active" },
      { label: "Future topic", value: "topic-future" },
    ])
    expect(result?.labelById.get("topic-active")).toBe("Active topic")
    expect(result?.labelById.get("topic-expired")).toBeUndefined()
    expect(result?.refresh).toBe(store.getState().refresh)

    act(() => {
      root.render(
        <CouponTopicStoreContext.Provider value={store}>
          <Harness issueableOnly={false} />
        </CouponTopicStoreContext.Provider>,
      )
    })

    expect(result?.options).toEqual([
      { label: "Active topic", value: "topic-active" },
      { label: "Future topic", value: "topic-future" },
      { label: "Expired topic", value: "topic-expired" },
    ])
    expect(result?.labelById.get("topic-expired")).toBe("Expired topic")
  })

  test("returns empty options without initializing when disabled", () => {
    let result: ReturnType<typeof useCouponTopicOptions> | undefined
    const store = createCouponTopicStore({
      ...fakeTopicStoreState,
      isInitialized: false,
    })

    const Harness = () => {
      result = useCouponTopicOptions({ enabled: false })
      return null
    }

    act(() => {
      root.render(
        <CouponTopicStoreContext.Provider value={store}>
          <Harness />
        </CouponTopicStoreContext.Provider>,
      )
    })

    expect(result?.options).toEqual([])
    expect(result?.labelById.size).toBe(0)
    expect(fakeTopicStoreState.initialize).not.toHaveBeenCalled()
  })
})
