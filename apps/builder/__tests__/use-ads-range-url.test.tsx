// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useAdsRangeUrl } from "@/features/ads/hooks/use-ads-range-url"

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/dashboard/ads/whatsapp",
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () =>
    new URLSearchParams({
      channel: "whatsapp",
      channelAccount: "iw-1",
      from: "2026-08-01",
      to: "2026-08-10",
    }),
}))

function HookHost({ range }: { range: { from: Date; to: Date } }) {
  const pushAdsRange = useAdsRangeUrl()
  return (
    <button onClick={() => pushAdsRange(range)} type="button">
      push
    </button>
  )
}

describe("useAdsRangeUrl", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mockPush.mockClear()
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

  test("pushes ?from=&to= as the picked LOCAL calendar days while preserving other params", async () => {
    await act(async () => {
      root.render(
        <HookHost
          range={{
            // Local day boundaries, exactly as `DateRangePresetFilter` emits.
            from: new Date(2026, 7, 12, 0, 0, 0),
            to: new Date(2026, 7, 19, 23, 59, 59),
          }}
        />,
      )
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
    })

    expect(mockPush).toHaveBeenCalledTimes(1)
    const pushedUrl = mockPush.mock.calls[0]?.[0] as string
    const [pathname, query] = pushedUrl.split("?")
    const params = new URLSearchParams(query)

    expect(pathname).toBe("/space/ws-1/dashboard/ads/whatsapp")
    expect(params.get("from")).toBe("2026-08-12")
    expect(params.get("to")).toBe("2026-08-19")
    // Every other existing search param is preserved.
    expect(params.get("channel")).toBe("whatsapp")
    expect(params.get("channelAccount")).toBe("iw-1")
  })

  test("keys the local calendar day, never a UTC-shifted day, for a local midnight boundary", async () => {
    await act(async () => {
      root.render(
        <HookHost
          range={{
            // Local midnight — under a positive UTC offset this instant is the
            // previous UTC day, but the URL must carry the day the user picked.
            from: new Date(2026, 7, 12, 0, 0, 0),
            to: new Date(2026, 7, 12, 23, 59, 59),
          }}
        />,
      )
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
    })

    const pushedUrl = mockPush.mock.calls[0]?.[0] as string
    const params = new URLSearchParams(pushedUrl.split("?")[1])

    expect(params.get("from")).toBe("2026-08-12")
    expect(params.get("to")).toBe("2026-08-12")
  })
})
