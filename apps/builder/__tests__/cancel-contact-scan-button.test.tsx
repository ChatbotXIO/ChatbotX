import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { CancelContactScanButton } from "@/features/contact-scan/components/cancel-contact-scan-button"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}))
vi.mock("sonner", () => ({ toast }))

const invalidateQueries = vi.hoisted(() => vi.fn())
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactScanAPIs: {
      getContactScanStatusAuthenticatedAPI: {
        key: (args: unknown) => ["contact-scan-status", args],
      },
    },
  },
}))

type ActionOptions = {
  onSuccess?: (args: { data?: { cancelled: boolean } }) => void
  onError?: (args: { error: { serverError?: string } }) => void
}
const execute = vi.hoisted(() => vi.fn())
const actionState = vi.hoisted(() => ({
  options: {} as ActionOptions,
  isPending: false,
}))
const bind = vi.hoisted(() => vi.fn(() => ({})))

vi.mock("@/features/contact-scan/actions/cancel-contact-scan.action", () => ({
  cancelContactScanAction: { bind },
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: ActionOptions) => {
    actionState.options = options
    return { execute, isPending: actionState.isPending }
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean
    children: React.ReactNode
  }) => <div data-open={String(open)}>{children}</div>,
  DialogTrigger: ({ render }: { render: React.ReactElement }) => render,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogClose: ({ render }: { render: React.ReactElement }) => render,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderButton() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <CancelContactScanButton inboxId="inbox-1" workspaceId="ws-1" />,
    )
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

const buttonWithText = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
  actionState.isPending = false
  vi.clearAllMocks()
})

describe("CancelContactScanButton", () => {
  test("binds the action to the workspace and asks for confirmation text", () => {
    const el = renderButton()

    expect(bind).toHaveBeenCalledWith(null, "ws-1")
    expect(el.textContent).toContain("contactScan.cancel.title")
    expect(el.textContent).toContain("contactScan.cancel.description")
    expect(buttonWithText(el, "contactScan.cancel.keep")).toBeDefined()
  })

  test("confirming executes the action for this inbox", () => {
    const el = renderButton()

    act(() => {
      buttonWithText(el, "contactScan.cancel.confirm")?.click()
    })

    expect(execute).toHaveBeenCalledWith({ inboxId: "inbox-1" })
  })

  test("the confirm button is disabled while the request is pending", () => {
    actionState.isPending = true
    const el = renderButton()

    expect(buttonWithText(el, "contactScan.cancel.confirm")?.disabled).toBe(
      true,
    )
  })

  test("a cancelled scan toasts success and refreshes the status query", () => {
    renderButton()

    act(() => {
      actionState.options.onSuccess?.({ data: { cancelled: true } })
    })

    expect(toast.success).toHaveBeenCalledWith("contactScan.cancel.success")
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        "contact-scan-status",
        { input: { workspaceId: "ws-1", inboxId: "inbox-1" } },
      ],
    })
  })

  test("nothing running is reported as info, not an error, and still refreshes", () => {
    renderButton()

    act(() => {
      actionState.options.onSuccess?.({ data: { cancelled: false } })
    })

    expect(toast.info).toHaveBeenCalledWith("contactScan.cancel.notRunning")
    expect(toast.error).not.toHaveBeenCalled()
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  test("a server error shows its message, else a generic one", () => {
    renderButton()

    act(() => {
      actionState.options.onError?.({ error: { serverError: "Forbidden" } })
    })
    act(() => {
      actionState.options.onError?.({ error: {} })
    })

    expect(toast.error).toHaveBeenNthCalledWith(1, "Forbidden")
    expect(toast.error).toHaveBeenNthCalledWith(2, "contactScan.cancel.failed")
  })
})
