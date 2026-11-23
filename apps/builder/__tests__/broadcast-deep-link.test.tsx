import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setCurrentId: vi.fn(),
  currentId: { value: null as string | null },
  toastError: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("nuqs", () => ({
  useQueryState: () => [mocks.currentId.value, mocks.setCurrentId],
}))
vi.mock("@/features/broadcasts/schema/search-parsers", () => ({
  broadcastsSearchParsers: { broadcastId: {} },
}))
vi.mock("@/features/broadcasts/broadcast-detail-dialog", () => ({
  BroadcastDetailDialog: ({
    broadcast,
    open,
    onOpenChange,
  }: {
    broadcast: { name: string } | null
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => (
    <div data-open={String(open)} data-testid="detail-dialog">
      {broadcast?.name}
      <button onClick={() => onOpenChange(false)} type="button">
        close
      </button>
    </div>
  ),
}))

import { BroadcastDeepLink } from "@/features/broadcasts/components/broadcast-deep-link"

const broadcast = { id: "55", name: "Black Friday" } as never

describe("BroadcastDeepLink", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (
    props: Partial<Parameters<typeof BroadcastDeepLink>[0]> = {},
  ) => {
    act(() => {
      root.render(
        <BroadcastDeepLink broadcast={broadcast} broadcastId="55" {...props} />,
      )
    })
  }
  const dialog = () =>
    container.querySelector<HTMLElement>('[data-testid="detail-dialog"]')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.currentId.value = "55"
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  // The toast is sent one tick after the commit, once the Toaster is listening.
  const flushToast = () => {
    act(() => {
      vi.runAllTimers()
    })
  }

  test("opens the broadcast's detail while the URL still asks for it", () => {
    render()

    expect(dialog()?.dataset.open).toBe("true")
    expect(dialog()?.textContent).toContain("Black Friday")
  })

  test("is closed once the param is gone, so a closed dialog does not reopen by itself", () => {
    mocks.currentId.value = null

    render()

    expect(dialog()?.dataset.open).toBe("false")
  })

  test("closing the dialog removes the param", () => {
    render()

    act(() => {
      container.querySelector("button")?.click()
    })

    expect(mocks.setCurrentId).toHaveBeenCalledWith(null)
  })

  test("an id that resolves to nothing renders no dialog, says so once and drops the param", () => {
    render({ broadcast: null })
    render({ broadcast: null })
    flushToast()

    expect(dialog()).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith("linkNotFound")
    expect(mocks.setCurrentId).toHaveBeenCalledTimes(1)
    expect(mocks.setCurrentId).toHaveBeenCalledWith(null)
  })

  test("following the same unknown link again says so again", () => {
    render({ broadcast: null })
    // The param was dropped, then the user followed the same link once more.
    mocks.currentId.value = null
    render({ broadcast: null })
    mocks.currentId.value = "55"
    render({ broadcast: null })
    flushToast()

    expect(mocks.toastError).toHaveBeenCalledTimes(2)
    expect(mocks.setCurrentId).toHaveBeenCalledTimes(2)
  })

  test("sends the toast only after the commit, so a Toaster that mounts later still receives it", () => {
    render({ broadcast: null })

    expect(mocks.toastError).not.toHaveBeenCalled()
    flushToast()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })

  test("says nothing for a broadcast that resolved", () => {
    render()
    flushToast()

    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.setCurrentId).not.toHaveBeenCalled()
  })
})
