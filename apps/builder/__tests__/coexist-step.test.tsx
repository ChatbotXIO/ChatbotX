import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  setCoexistMessengerAPI,
  setCoexistInstagramAPI,
  setCoexistWhatsappAPI,
} = vi.hoisted(() => ({
  setCoexistMessengerAPI: vi.fn(),
  setCoexistInstagramAPI: vi.fn(),
  setCoexistWhatsappAPI: vi.fn(),
}))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

// `CoexistStep` calls through `lib/coexist-client.ts`'s `setCoexist`, which
// is where these two module mocks take effect — the observable body and
// failure precedence are unchanged, so these tests still pin them. The
// transport is the typed oRPC client, since `/api` serves `publicRouter` only.
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationMessengerAPIs: { setCoexistMessengerAPI },
    integrationInstagramAPIs: { setCoexistInstagramAPI },
    integrationWhatsappAPIs: { setCoexistWhatsappAPI },
  },
}))

const coexistMocks = [
  setCoexistMessengerAPI,
  setCoexistInstagramAPI,
  setCoexistWhatsappAPI,
]

/** Arms every channel's procedure, so a test asserting WHICH one ran still can. */
function respondWith(response: unknown) {
  for (const mock of coexistMocks) {
    mock.mockResolvedValue(response)
  }
}

function rejectWith(error: unknown) {
  for (const mock of coexistMocks) {
    mock.mockRejectedValue(error)
  }
}

const toastMock = { error: vi.fn(), success: vi.fn() }
vi.mock("sonner", () => ({ toast: toastMock }))

vi.mock("@/lib/errors/client-handler", () => ({
  clientErrorHandler: vi.fn(),
}))

// jsdom ships no ResizeObserver, and Base UI measures the switch thumb through it.
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

const { CoexistStep } = await import(
  "@/features/channel-connect/components/coexist-step"
)
const { CoexistPopup } = await import("@/features/shared/coexist-popup")
const { Dialog, DialogContent } = await import(
  "@chatbotx.io/ui/components/ui/dialog"
)

const singleTarget = { integrationId: "int-1", name: "Page One" }

/** `DialogContent` portals into `document.body`, not the render container. */
const switches = () =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[role="switch"]'))
const buttonWith = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  )
const enableButton = () => buttonWith("coexist.enable")
const declineButton = () => buttonWith("coexist.decline")

/** Lets the coexist POST's promise chain settle inside a single act() tick. */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe("CoexistStep", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    respondWith({ success: true })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  // `CoexistStep` renders `DialogHeader`/`DialogTitle`/`DialogFooter`, which
  // require a real Base UI Dialog root above them — mirrors how it is always
  // used (as the body of `CoexistPopup`'s Dialog).
  function renderStep(onDone = vi.fn()) {
    act(() => {
      root.render(
        <Dialog open>
          <DialogContent showCloseButton={false}>
            <CoexistStep
              channel="messenger"
              onDone={onDone}
              target={singleTarget}
              workspaceId="ws-1"
            />
          </DialogContent>
        </Dialog>,
      )
    })
    return onDone
  }

  test("renders the single-account layout: title, description, billing note and the two footer actions", () => {
    renderStep()
    const dialogContent = document.body.querySelector(
      '[data-slot="dialog-content"]',
    )

    expect(dialogContent?.textContent).toContain("coexist.title")
    expect(dialogContent?.textContent).toContain("coexist.descriptionMessenger")
    expect(dialogContent?.textContent).toContain("coexist.billingNote")
    expect(enableButton()).toBeDefined()
    expect(declineButton()).toBeDefined()
    // No "Sync all", no per-account row list, no row helper any more.
    expect(dialogContent?.textContent).not.toContain("coexist.syncAll")
    expect(dialogContent?.textContent).not.toContain("coexist.rowHelper")
    expect(dialogContent?.textContent).not.toContain("coexist.confirm")
  })

  test("the AI-reads-synced-history switch is the only switch, and defaults OFF", () => {
    renderStep()
    expect(switches()).toHaveLength(1)
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("false")
  })

  test("Enable posts enabled:true once and toasts the enabled success", async () => {
    const onDone = renderStep()

    await act(async () => {
      enableButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flush()
    })

    expect(setCoexistMessengerAPI).toHaveBeenCalledTimes(1)
    expect(setCoexistMessengerAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      enabled: true,
      aiReadsSyncedHistory: false,
    })
    // Messenger's own procedure, never another channel's.
    expect(setCoexistWhatsappAPI).not.toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalledWith("coexist.success.enabled")
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test("Decline posts enabled:false once and toasts the disabled success", async () => {
    const onDone = renderStep()

    await act(async () => {
      declineButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flush()
    })

    expect(setCoexistMessengerAPI).toHaveBeenCalledTimes(1)
    expect(setCoexistMessengerAPI.mock.calls[0]?.[0]).toMatchObject({
      integrationId: "int-1",
      enabled: false,
    })
    expect(toastMock.success).toHaveBeenCalledWith("coexist.success.disabled")
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test("the AI toggle is reflected in the posted body", async () => {
    renderStep()

    act(() => {
      switches()[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("true")

    await act(async () => {
      enableButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flush()
    })

    expect(setCoexistMessengerAPI.mock.calls[0]?.[0]).toMatchObject({
      aiReadsSyncedHistory: true,
    })
  })

  test("a failed post toasts its translated reason and never claims success", async () => {
    respondWith({ success: false, reason: "window_expired" })
    const onDone = renderStep()

    await act(async () => {
      enableButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flush()
    })

    expect(toastMock.error).toHaveBeenCalledWith("coexist.errors.windowExpired")
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test("prefers result.msg over the reason key when both are present", async () => {
    respondWith({
      success: false,
      reason: "window_expired",
      msg: "Custom provider message",
    })
    renderStep()

    await act(async () => {
      enableButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flush()
    })

    expect(toastMock.error).toHaveBeenCalledWith("Custom provider message")
    expect(toastMock.error).not.toHaveBeenCalledWith(
      "coexist.errors.windowExpired",
    )
  })

  test("a thrown/network error is left to clientErrorHandler's own toast — no duplicate — and still calls onDone once", async () => {
    rejectWith(new Error("network down"))
    const onDone = renderStep()

    await act(async () => {
      enableButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flush()
    })

    expect(toastMock.error).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test("both buttons and the AI switch are disabled while a choice is in flight", async () => {
    let settle: (value: { success: true }) => void = () => {
      // replaced synchronously by the promise executor below
    }
    setCoexistMessengerAPI.mockReturnValue(
      new Promise<{ success: true }>((resolve) => {
        settle = resolve
      }),
    )
    renderStep()

    act(() => {
      enableButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(enableButton()?.disabled).toBe(true)
    expect(declineButton()?.disabled).toBe(true)
    expect(switches()[0]?.getAttribute("data-disabled")).not.toBeNull()

    await act(async () => {
      settle({ success: true })
      await flush()
    })

    expect(enableButton()?.disabled).toBe(false)
  })
})

describe("CoexistPopup (standalone wrapper)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    respondWith({ success: true })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    for (const node of Array.from(
      document.querySelectorAll("[data-slot='dialog-overlay']"),
    )) {
      node.remove()
    }
  })

  function renderPopup(onDone = vi.fn()) {
    act(() => {
      root.render(
        <CoexistPopup
          channel="whatsapp"
          onDone={onDone}
          target={{ integrationId: "int-1", name: "My Number" }}
          workspaceId="ws-1"
        />,
      )
    })
    return onDone
  }

  test("renders CoexistStep inside a real, non-dismissable Dialog (Escape leaves it open)", () => {
    renderPopup()

    expect(document.body.textContent).toContain("coexist.title")

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      )
    })

    // Still mounted / visible — the dialog cancelled the close attempt.
    expect(document.body.textContent).toContain("coexist.title")
  })

  test("Enable posts for the single target and calls onDone once", async () => {
    const onDone = renderPopup()

    await act(async () => {
      enableButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await flush()
    })

    expect(setCoexistWhatsappAPI).toHaveBeenCalledTimes(1)
    expect(setCoexistWhatsappAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      enabled: true,
      aiReadsSyncedHistory: false,
    })
    // WhatsApp's own procedure, never another channel's.
    expect(setCoexistMessengerAPI).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
