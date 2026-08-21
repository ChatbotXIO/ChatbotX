import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockKyPost } = vi.hoisted(() => ({
  mockKyPost: vi.fn(),
}))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("ky", () => ({
  default: { post: mockKyPost },
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@/lib/errors/client-handler", () => ({
  clientErrorHandler: vi.fn(),
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}))

// jsdom ships no ResizeObserver, and Radix measures the switch thumb through it.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

// jsdom ships no PointerEvent constructor; the Switch's click handler
// re-dispatches one to drive its underlying <input type="checkbox">.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

const { CoexistPopup } = await import("@/features/shared/coexist-popup")

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CoexistPopup", () => {
  let container: HTMLDivElement
  let root: Root
  const onDone = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    mockKyPost.mockReturnValue({
      json: vi.fn().mockResolvedValue({ success: true }),
    })

    act(() => {
      root.render(
        <CoexistPopup
          channel="whatsapp"
          integrationId="int-1"
          onDone={onDone}
          workspaceId="ws-1"
        />,
      )
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const switchEl = () =>
    container.querySelector<HTMLButtonElement>('[role="switch"]')
  const enableButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("coexist.enable"),
    )
  const declineButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("coexist.decline"),
    )

  test("renders the AI-reads-synced-history switch defaulted OFF (AI ignores synced history by default)", () => {
    expect(switchEl()).not.toBeNull()
    expect(switchEl()?.getAttribute("aria-checked")).toBe("false")
  })

  test("POSTs aiReadsSyncedHistory: false by default when confirming enable", async () => {
    await act(async () => {
      enableButton()?.click()
      await Promise.resolve()
    })

    expect(mockKyPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        json: expect.objectContaining({
          workspaceId: "ws-1",
          integrationId: "int-1",
          enabled: true,
          aiReadsSyncedHistory: false,
        }),
      }),
    )
  })

  test("POSTs aiReadsSyncedHistory: true after toggling the switch on", async () => {
    act(() => {
      switchEl()?.click()
    })
    expect(switchEl()?.getAttribute("aria-checked")).toBe("true")

    await act(async () => {
      enableButton()?.click()
      await Promise.resolve()
    })

    expect(mockKyPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        json: expect.objectContaining({ aiReadsSyncedHistory: true }),
      }),
    )
  })

  test("POSTs aiReadsSyncedHistory in the decline body too (enabled: false)", async () => {
    act(() => {
      switchEl()?.click()
    })

    await act(async () => {
      declineButton()?.click()
      await Promise.resolve()
    })

    expect(mockKyPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        json: expect.objectContaining({
          enabled: false,
          aiReadsSyncedHistory: true,
        }),
      }),
    )
  })
})
