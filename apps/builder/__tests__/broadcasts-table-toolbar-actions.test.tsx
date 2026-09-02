import type { Table } from "@tanstack/react-table"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastsTableToolbarActions } from "@/features/broadcasts/components/broadcasts-table-toolbar-actions"
import type { BroadcastResourceWithRelations } from "@/features/broadcasts/schema/resource"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// The dialog under test here is `DeleteBroadcastDialog` — stub it out so
// this test only asserts the toolbar's own selection/wiring behavior
// (count, visibility, dialog props, clearing selection on success).
vi.mock("@/features/broadcasts/components/delete-broadcast-dialog", () => ({
  DeleteBroadcastDialog: ({
    open,
    broadcasts,
    workspaceId,
    onSuccess,
  }: {
    open: boolean
    broadcasts: { id: string }[]
    workspaceId: string
    onSuccess?: () => void
  }) =>
    open ? (
      <div data-testid="delete-dialog" data-workspace-id={workspaceId}>
        {broadcasts.map((b) => (
          <span data-testid="delete-dialog-id" key={b.id}>
            {b.id}
          </span>
        ))}
        <button onClick={onSuccess} type="button">
          simulate-success
        </button>
      </div>
    ) : null,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

type Row = { original: BroadcastResourceWithRelations }

function makeTable(
  selectedRows: Row[],
  toggleAllRowsSelected: ReturnType<typeof vi.fn>,
): Table<BroadcastResourceWithRelations> {
  return {
    getFilteredSelectedRowModel: () => ({ rows: selectedRows }),
    toggleAllRowsSelected,
  } as unknown as Table<BroadcastResourceWithRelations>
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function render(
  selectedRows: Row[],
  toggleAllRowsSelected: ReturnType<typeof vi.fn> = vi.fn(),
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const table = makeTable(selectedRows, toggleAllRowsSelected)
  act(() => {
    root?.render(
      <BroadcastsTableToolbarActions table={table} workspaceId="ws-1" />,
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
})

const row = (id: string, name: string): Row => ({
  original: { id, name } as BroadcastResourceWithRelations,
})

describe("BroadcastsTableToolbarActions", () => {
  test("renders nothing when there is no selection", () => {
    const el = render([])

    expect(el.innerHTML).toBe("")
  })

  test("shows the selected count and passes every selected id to the delete dialog", () => {
    const el = render([row("bc-1", "A"), row("bc-2", "B")])

    const button = el.querySelector("button")
    expect(button?.textContent).toBe("actions.delete (2)")

    act(() => {
      button?.click()
    })

    const ids = Array.from(
      el.querySelectorAll('[data-testid="delete-dialog-id"]'),
    ).map((n) => n.textContent)
    expect(ids).toEqual(["bc-1", "bc-2"])

    const dialog = el.querySelector('[data-testid="delete-dialog"]')
    expect(dialog?.getAttribute("data-workspace-id")).toBe("ws-1")
  })

  test("clears the table selection when the delete dialog reports success", () => {
    const toggleAllRowsSelected = vi.fn()
    const el = render([row("bc-1", "A")], toggleAllRowsSelected)

    act(() => {
      el.querySelector("button")?.click()
    })
    act(() => {
      const simulateSuccess = Array.from(el.querySelectorAll("button")).find(
        (btn) => btn.textContent === "simulate-success",
      )
      simulateSuccess?.click()
    })

    expect(toggleAllRowsSelected).toHaveBeenCalledWith(false)
  })
})
