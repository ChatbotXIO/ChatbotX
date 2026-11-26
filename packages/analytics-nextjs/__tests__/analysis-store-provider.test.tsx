import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  AnalysisStoreProvider,
  type AnalysisStoreProviderProps,
  useAnalysisStore,
} from "../src/provider/analysis-store-context"
import {
  type AnalyticsApi,
  AnalyticsApiProvider,
} from "../src/provider/analytics-api-context"

type Calls = Map<string, ReturnType<typeof vi.fn>>

/** An api whose every procedure resolves to an empty result and is recorded. */
const buildApi = (calls: Calls): AnalyticsApi =>
  new Proxy(
    {},
    {
      get: (_target, key: string) => {
        const existing = calls.get(key)
        if (existing) {
          return existing
        }
        const fn = vi.fn().mockResolvedValue({ data: [] })
        calls.set(key, fn)
        return fn
      },
    },
  ) as AnalyticsApi

describe("AnalysisStoreProvider initial filters", () => {
  let container: HTMLDivElement
  let root: Root
  let calls: Calls
  let seen: { channels: string[]; inboxIds: string[] } | undefined

  const Probe = () => {
    const channels = useAnalysisStore((state) => state.channels)
    const inboxIds = useAnalysisStore((state) => state.inboxIds)
    seen = { channels, inboxIds }
    return null
  }

  const render = async (
    initialFilters?: AnalysisStoreProviderProps["initialFilters"],
    autoInitialize = false,
  ) => {
    await act(async () => {
      root.render(
        <AnalyticsApiProvider api={buildApi(calls)}>
          <AnalysisStoreProvider
            autoInitialize={autoInitialize}
            defaultSearchParams={{ workspaceId: "ws-1" }}
            initialFilters={initialFilters}
            type="contacts"
          >
            <Probe />
          </AnalysisStoreProvider>
        </AnalyticsApiProvider>,
      )
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    calls = new Map()
    seen = undefined
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

  test("seeds the store with the supplied filters before it initializes", async () => {
    await render({ channels: ["messenger"], inboxIds: ["7"] })

    expect(seen).toEqual({ channels: ["messenger"], inboxIds: ["7"] })
    expect(calls.size).toBe(0)
  })

  test("the first load already carries the supplied filters", async () => {
    await render({ channels: ["messenger"], inboxIds: ["7"] }, true)

    const params = [...calls.values()].flatMap((fn) =>
      fn.mock.calls.map((call) => call[0] as Record<string, unknown>),
    )
    expect(params.length).toBeGreaterThan(0)
    for (const param of params) {
      expect(param.channels).toEqual(["messenger"])
      expect(param.inboxIds).toEqual(["7"])
    }
  })

  test("omitting them keeps the legacy unfiltered store and requests", async () => {
    await render(undefined, true)

    expect(seen).toEqual({ channels: [], inboxIds: [] })
    const params = [...calls.values()].flatMap((fn) =>
      fn.mock.calls.map((call) => call[0] as Record<string, unknown>),
    )
    expect(params.length).toBeGreaterThan(0)
    for (const param of params) {
      expect(param).not.toHaveProperty("channels")
      expect(param).not.toHaveProperty("inboxIds")
    }
  })
})
