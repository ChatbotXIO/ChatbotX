import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { DeleteBroadcastDialog } from "@/features/broadcasts/components/delete-broadcast-dialog"

/** Echoes the key back (with interpolated params appended) so assertions
 * never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))
vi.mock("sonner", () => ({ toast }))

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

type DeleteResult = { deletedCount: number; requestedCount: number }
type ActionOptions = {
  onSuccess?: (args: { data?: DeleteResult }) => void
  onError?: (args: { error: { serverError?: string } }) => void
}
type ActionCall = { options: ActionOptions; execute: ReturnType<typeof vi.fn> }
const actionCalls = vi.hoisted(() => [] as ActionCall[])

vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: ActionOptions) => {
    const execute = vi.fn()
    actionCalls.push({ options, execute })
    return { execute, isPending: false }
  },
}))

vi.mock("@/features/broadcasts/actions/delete-broadcast.action", () => ({
  deleteBroadcastAction: { bind: () => ({}) },
}))

vi.mock("@/features/broadcasts/actions/delete-broadcasts.action", () => ({
  deleteBroadcastsAction: { bind: () => ({}) },
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

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderDialog(broadcasts: { id: string; name: string | null }[]) {
  actionCalls.length = 0
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <DeleteBroadcastDialog
        broadcasts={broadcasts}
        onOpenChange={() => {
          // no-op — the test drives `open` directly via re-render
        }}
        open={true}
        workspaceId="ws-1"
      />,
    )
  })
  const [singleCall, bulkCall] = actionCalls
  return {
    // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
    el: container!,
    singleCall,
    bulkCall,
  }
}

function clickDelete(el: HTMLElement) {
  const button = Array.from(el.querySelectorAll("button")).find(
    (btn) => btn.textContent === "actions.delete",
  )
  act(() => {
    button?.click()
  })
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
  toast.error.mockClear()
  toast.success.mockClear()
  toast.warning.mockClear()
  refresh.mockClear()
})

describe("DeleteBroadcastDialog — single", () => {
  test("confirming a single broadcast calls the single delete action with no input", () => {
    const { el, singleCall, bulkCall } = renderDialog([
      { id: "bc-1", name: "Spring sale" },
    ])

    clickDelete(el)

    expect(singleCall.execute).toHaveBeenCalledWith()
    expect(bulkCall.execute).not.toHaveBeenCalled()
  })

  test("full success (deletedCount === requestedCount) shows the success toast and refreshes", () => {
    const { singleCall } = renderDialog([{ id: "bc-1", name: "Spring sale" }])

    act(() => {
      singleCall.options.onSuccess?.({
        data: { deletedCount: 1, requestedCount: 1 },
      })
    })

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.warning).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("a server error shows the server message and refreshes the stale row", () => {
    const { singleCall } = renderDialog([{ id: "bc-1", name: "Spring sale" }])

    act(() => {
      singleCall.options.onError?.({
        error: { serverError: "Broadcast is currently sending" },
      })
    })

    expect(toast.error).toHaveBeenCalledWith("Broadcast is currently sending")
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe("DeleteBroadcastDialog — bulk", () => {
  test("confirming multiple broadcasts calls the bulk delete action with every id", () => {
    const { el, singleCall, bulkCall } = renderDialog([
      { id: "bc-1", name: "A" },
      { id: "bc-2", name: "B" },
      { id: "bc-3", name: "C" },
    ])

    clickDelete(el)

    expect(bulkCall.execute).toHaveBeenCalledWith({
      ids: ["bc-1", "bc-2", "bc-3"],
    })
    expect(singleCall.execute).not.toHaveBeenCalled()
  })

  test("a partial delete (some rows raced to `sending`) shows the partial toast, not the full-success one", () => {
    const { bulkCall } = renderDialog([
      { id: "bc-1", name: "A" },
      { id: "bc-2", name: "B" },
      { id: "bc-3", name: "C" },
    ])

    act(() => {
      bulkCall.options.onSuccess?.({
        data: { deletedCount: 2, requestedCount: 3 },
      })
    })

    expect(toast.warning).toHaveBeenCalledWith(
      'broadcasts.deleteDialog.partial:{"deleted":2,"requested":3}',
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
