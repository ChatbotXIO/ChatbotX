import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AhachatImportAvailability } from "@/features/channel-connect/lib/ahachat-import-availability"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/features/channel-connect/lib/connect-client", () => ({
  connectViaApi: vi.fn(),
}))
vi.mock("@/features/channel-connect/lib/coexist-client", () => ({
  setCoexist: vi.fn(),
  coexistUnavailable: () => ({ ok: false, text: "", reported: false }),
}))
vi.mock("@/features/channel-connect/components/connect-many-dialog", () => ({
  ConnectManyDialog: () => null,
}))

Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {}
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}

const { InstagramAccounts } = await import(
  "@/features/integration-instagram/components/instagram-accounts"
)

describe("InstagramAccounts — AhaChat import", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  const render = (ahachatPageIds: string[]) => {
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <AhachatImportAvailability pageIds={ahachatPageIds}>
            <InstagramAccounts
              account={{ id: "ig-1", name: "IG Account" }}
              sessionId="session-1"
              workspaceId="ws-1"
            />
          </AhachatImportAvailability>
        </QueryClientProvider>,
      )
    })
  }
  const historySwitch = () =>
    container.querySelector<HTMLElement>(
      '[role="switch"][aria-label="channels.connectMany.stepCoexist — IG Account"]',
    )
  const dialogButton = (text: string) =>
    Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === text,
    )
  const dialogOpen = () =>
    dialogButton("ahachatImport.importFirst") !== undefined
  const click = async (element: HTMLElement | null | undefined) => {
    await act(async () => {
      element?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
  }

  test("asks nothing when AhaChat does not have the account", async () => {
    render([])

    await click(historySwitch())

    expect(dialogOpen()).toBe(false)
  })

  test("turning the history sync on asks whether to import from AhaChat first", async () => {
    render(["ig-1"])

    await click(historySwitch())

    expect(dialogOpen()).toBe(true)
  })

  test("choosing import-first shows the import note and closes the question", async () => {
    render(["ig-1"])

    await click(historySwitch())
    await click(dialogButton("ahachatImport.importFirst"))

    expect(dialogOpen()).toBe(false)
    expect(container.textContent).toContain("ahachatImport.panelDescription")
  })

  test("choosing history-only keeps the sync without the import note", async () => {
    render(["ig-1"])

    await click(historySwitch())
    await click(dialogButton("ahachatImport.historyOnly"))

    expect(dialogOpen()).toBe(false)
    expect(historySwitch()?.getAttribute("aria-checked")).toBe("true")
    expect(container.textContent).not.toContain(
      "ahachatImport.panelDescription",
    )
  })

  test("turning the sync off forgets the choice and the next time asks again", async () => {
    render(["ig-1"])

    await click(historySwitch())
    await click(dialogButton("ahachatImport.importFirst"))
    await click(historySwitch())
    expect(container.textContent).not.toContain(
      "ahachatImport.panelDescription",
    )

    await click(historySwitch())
    expect(dialogOpen()).toBe(true)
  })
})
