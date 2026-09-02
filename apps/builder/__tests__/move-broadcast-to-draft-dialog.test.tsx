import type { BroadcastModel } from "@chatbotx.io/database/types"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { MoveBroadcastToDraftDialog } from "@/features/broadcasts/components/move-broadcast-to-draft-dialog"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

type ActionOptions = {
  onSuccess?: () => void
  onError?: (args: { error: { serverError?: string } }) => void
}
const execute = vi.hoisted(() => vi.fn())
const actionState = vi.hoisted(() => ({
  options: {} as ActionOptions,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: ActionOptions) => {
    actionState.options = options
    return { execute, isPending: false }
  },
}))

const bind = vi.hoisted(() => vi.fn(() => ({})))
vi.mock("@/features/broadcasts/actions/move-broadcast-to-draft.action", () => ({
  moveBroadcastToDraftAction: { bind },
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogClose: ({ render }: { render: React.ReactElement }) => render,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

const BROADCAST = {
  id: "bc-1",
  workspaceId: "ws-1",
  name: "Spring sale",
} as BroadcastModel

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderDialog() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <MoveBroadcastToDraftDialog
        broadcast={BROADCAST}
        onOpenChange={() => {
          // no-op — the test drives `open` directly via re-render
        }}
        open={true}
      />,
    )
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  execute.mockClear()
  refresh.mockClear()
  toast.error.mockClear()
  toast.success.mockClear()
  bind.mockClear()
})

describe("MoveBroadcastToDraftDialog", () => {
  test("binds moveBroadcastToDraftAction to (null, workspaceId, broadcastId)", () => {
    renderDialog()

    expect(bind).toHaveBeenCalledWith(null, "ws-1", "bc-1")
  })

  test("confirming calls the bound moveBroadcastToDraft action", () => {
    const el = renderDialog()
    const confirmButton = Array.from(el.querySelectorAll("button")).find(
      (btn) => btn.textContent === "actions.moveToDraft",
    )

    act(() => {
      confirmButton?.click()
    })

    expect(execute).toHaveBeenCalledTimes(1)
  })

  test("success shows a toast and refreshes so the row moves out of scheduled", () => {
    renderDialog()

    act(() => {
      actionState.options.onSuccess?.()
    })

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("a race error (e.g. broadcast already started sending) shows the server message and refreshes the stale row", () => {
    renderDialog()

    act(() => {
      actionState.options.onError?.({
        error: { serverError: "Broadcast is no longer scheduled" },
      })
    })

    expect(toast.error).toHaveBeenCalledWith("Broadcast is no longer scheduled")
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
