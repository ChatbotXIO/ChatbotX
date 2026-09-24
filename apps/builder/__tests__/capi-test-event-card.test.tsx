// @vitest-environment jsdom

import type { ReactElement, ReactNode } from "react"
import { act, createContext } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CapiTestEventCard } from "@/features/meta-conversions/components/capi-test-event-card"

/** Echoes the key back so assertions never depend on translated copy. */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Server actions pull in server-only env at import time; the card only ever
// `.bind()`s them before handing them to `useAction` (mocked below).
vi.mock(
  "@/features/meta-conversions/actions/save-capi-test-event-code.action",
  () => ({ saveCapiTestEventCodeAction: { bind: () => vi.fn() } }),
)
vi.mock(
  "@/features/meta-conversions/actions/send-capi-test-event.action",
  () => ({
    sendCapiTestEventAction: { bind: () => vi.fn() },
  }),
)

// The card calls `useAction` twice, in order: save code then send. Each call
// gets its own `execute` spy so a test can assert which action ran.
const executes: ReturnType<typeof vi.fn>[] = []
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => {
    const execute = vi.fn()
    executes.push(execute)
    return { execute, isPending: false }
  },
}))

// Minimal controlled dialog stand-in: content stays mounted but hidden while
// closed, mirroring Base UI keeping the portal mounted through transitions.
type DialogCtxValue = { open: boolean; setOpen: (next: boolean) => void }
const DialogCtx = createContext<DialogCtxValue>({
  open: false,
  setOpen: () => undefined,
})

vi.mock("@chatbotx.io/ui/components/ui/dialog", async () => {
  const react = await import("react")
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: ReactNode
      open: boolean
      onOpenChange: (next: boolean) => void
    }) => (
      <DialogCtx.Provider value={{ open, setOpen: onOpenChange }}>
        {children}
      </DialogCtx.Provider>
    ),
    DialogClose: ({
      render,
    }: {
      render: ReactElement<{ onClick?: () => void }>
    }) => {
      const { setOpen } = react.useContext(DialogCtx)
      return react.cloneElement(render, { onClick: () => setOpen(false) })
    },
    DialogContent: ({ children }: { children: ReactNode }) => {
      const { open } = react.useContext(DialogCtx)
      return (
        <div data-testid="dialog-content" hidden={!open}>
          {children}
        </div>
      )
    },
    DialogHeader: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
  }
})

const SEND_LABEL = "metaConversions.testEvents.send"
const CONFIRM_LABEL = "metaConversions.testEvents.confirmSend"

describe("CapiTestEventCard", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    executes.length = 0
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render(props: {
    channel: "messenger" | "instagram" | "whatsapp"
    testEventCode: string | null
  }) {
    act(() => {
      root.render(
        <CapiTestEventCard
          channel={props.channel}
          datasetId="ds-1"
          integrationId="int-1"
          testEventCode={props.testEventCode}
          workspaceId="ws-1"
        />,
      )
    })
  }

  function buttonByText(text: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === text,
    )
    if (!found) {
      throw new Error(`button "${text}" not rendered`)
    }
    return found
  }

  function dialogContent(): HTMLElement {
    const found = container.querySelector<HTMLElement>(
      '[data-testid="dialog-content"]',
    )
    if (!found) {
      throw new Error("dialog not rendered")
    }
    return found
  }

  function typeMessagingId(value: string) {
    const input = dialogContent().querySelector("input")
    if (!input) {
      throw new Error("messaging id input not rendered")
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  test("send stays disabled until a test event code is saved", () => {
    render({ channel: "messenger", testEventCode: null })

    expect(buttonByText(SEND_LABEL).disabled).toBe(true)
  })

  test("send opens a dialog asking for the channel's messaging id", () => {
    render({ channel: "whatsapp", testEventCode: "TEST1" })

    expect(dialogContent().hidden).toBe(true)
    act(() => {
      buttonByText(SEND_LABEL).click()
    })

    expect(dialogContent().hidden).toBe(false)
    expect(dialogContent().textContent).toContain(
      "metaConversions.testEvents.messagingIdLabel.whatsapp",
    )
  })

  test("confirm stays disabled while the messaging id is blank", () => {
    render({ channel: "messenger", testEventCode: "TEST1" })
    act(() => {
      buttonByText(SEND_LABEL).click()
    })

    expect(buttonByText(CONFIRM_LABEL).disabled).toBe(true)
    typeMessagingId("   ")
    expect(buttonByText(CONFIRM_LABEL).disabled).toBe(true)
  })

  test("confirm stays disabled for characters Meta never issues in a sample id", () => {
    render({ channel: "messenger", testEventCode: "TEST1" })
    act(() => {
      buttonByText(SEND_LABEL).click()
    })

    typeMessagingId("psid 1;")
    expect(buttonByText(CONFIRM_LABEL).disabled).toBe(true)
  })

  test("reopening the dialog starts from an empty messaging id", () => {
    render({ channel: "messenger", testEventCode: "TEST1" })
    act(() => {
      buttonByText(SEND_LABEL).click()
    })
    typeMessagingId("psid-1")
    act(() => {
      buttonByText("metaConversions.testEvents.cancel").click()
    })

    act(() => {
      buttonByText(SEND_LABEL).click()
    })

    expect(dialogContent().querySelector("input")?.value).toBe("")
    expect(buttonByText(CONFIRM_LABEL).disabled).toBe(true)
  })

  test("confirm sends the typed messaging id for the card's channel", () => {
    render({ channel: "instagram", testEventCode: "TEST1" })
    act(() => {
      buttonByText(SEND_LABEL).click()
    })
    typeMessagingId(" igsid-1 ")

    act(() => {
      buttonByText(CONFIRM_LABEL).click()
    })

    const sendExecute = executes.at(-1)
    expect(sendExecute).toHaveBeenCalledWith({
      channel: "instagram",
      messagingId: "igsid-1",
    })
  })
})
