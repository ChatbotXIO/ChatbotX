import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}))
vi.mock("next-safe-action/hooks", () => ({ useAction: vi.fn() }))
vi.mock("@/features/template-store/template-store.action", () => ({}))

import { clearSelectionWhenStale } from "@/features/template-store/components/bulk-listing-actions"
import { useTemplateStoreOutcome } from "@/features/template-store/use-template-store-outcome"

type HandleOutcome = ReturnType<typeof useTemplateStoreOutcome>

const renderOutcome = (): HandleOutcome => {
  let handle: HandleOutcome | undefined
  function Probe() {
    handle = useTemplateStoreOutcome()
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() => root.render(<Probe />))
  if (!handle) {
    throw new Error("hook not rendered")
  }
  return handle
}

beforeEach(() => vi.clearAllMocks())

describe("useTemplateStoreOutcome", () => {
  test("a refusal shows its reason, calls onRejected with it and refreshes", () => {
    const onDone = vi.fn()
    const onRejected = vi.fn()

    renderOutcome()(
      { status: "rejected", reason: "listingUnavailable" },
      { successMessage: "ok", onDone, onRejected },
    )

    expect(mocks.error).toHaveBeenCalledWith(
      "templateStore.errors.listingUnavailable",
    )
    expect(onRejected).toHaveBeenCalledWith("listingUnavailable")
    expect(onDone).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  test("success runs onDone, never onRejected", () => {
    const onDone = vi.fn()
    const onRejected = vi.fn()

    renderOutcome()(
      { status: "done" },
      { successMessage: "ok", onDone, onRejected },
    )

    expect(mocks.success).toHaveBeenCalledWith("ok")
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onRejected).not.toHaveBeenCalled()
  })
})

describe("clearSelectionWhenStale", () => {
  test("clears the selection only when a checked listing no longer exists", () => {
    const finish = vi.fn()
    const handle = clearSelectionWhenStale(finish)

    handle("categoryUnavailable")
    expect(finish).not.toHaveBeenCalled()
    handle("listingUnavailable")
    expect(finish).toHaveBeenCalledTimes(1)
  })
})
