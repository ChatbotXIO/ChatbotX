// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  replace: vi.fn(),
  search: { value: "" },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search.value),
}))
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))

const { useCapiConnectResult } = await import("@/hooks/use-capi-connect-result")

function Probe() {
  useCapiConnectResult()
  return null
}

describe("useCapiConnectResult", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    vi.clearAllMocks()
    window.history.replaceState({}, "", "/space/ws-1/messengers/7/ads")
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  function mount(search: string) {
    mocks.search.value = search
    act(() => {
      root.render(<Probe />)
    })
    act(() => {
      vi.runAllTimers()
    })
  }

  test("does nothing on a page that was not reached from a connect", () => {
    mount("tab=capi")

    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  test("confirms a successful connect and cleans the URL", () => {
    mount("capiConnect=success&tab=capi")

    expect(mocks.toastSuccess).toHaveBeenCalledWith("connect.success")
    expect(mocks.replace).toHaveBeenCalledWith(
      "/space/ws-1/messengers/7/ads?tab=capi",
      { scroll: false },
    )
  })

  test.each([
    "cancelled",
    "notFound",
    "pageNotFound",
    "accountNotFound",
    "datasetFailed",
    "sessionExpired",
    "failed",
  ])("explains a %s failure", (reason) => {
    mount(`capiConnect=error&capiReason=${reason}`)

    expect(mocks.toastError).toHaveBeenCalledWith(
      `connectResult.errors.${reason}`,
    )
    expect(mocks.replace).toHaveBeenCalledWith("/space/ws-1/messengers/7/ads", {
      scroll: false,
    })
  })

  test("degrades an unknown reason to a generic failure", () => {
    mount("capiConnect=error&capiReason=whatever")

    expect(mocks.toastError).toHaveBeenCalledWith("connectResult.errors.failed")
  })
})
