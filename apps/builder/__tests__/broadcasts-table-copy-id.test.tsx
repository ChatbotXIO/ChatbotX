import {
  flexRender,
  getCoreRowModel,
  type Table,
  useReactTable,
} from "@tanstack/react-table"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { BroadcastResourceWithRelations } from "@/features/broadcasts/schema/resource"

const { mockCopy, mockToastError, mockToastSuccess, stubModule } = vi.hoisted(
  () => ({
    mockCopy: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
    /** A module whose every named export is a component rendering nothing. */
    stubModule: () =>
      new Proxy(
        {},
        {
          has: (_target, name) => name !== "then",
          get: (_target, name) =>
            name === "__esModule" || name === "then" ? undefined : () => null,
        },
      ),
  }),
)

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (value: number) => String(value) }),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}))
vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}))
vi.mock("usehooks-ts", () => ({
  useCopyToClipboard: () => [null, mockCopy],
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/hooks/use-interval-router-refresh", () => ({
  useIntervalRouterRefresh: vi.fn(),
}))

const passthrough = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
)
const nothing = () => null

// A real tanstack table, so the column definitions of the component run as-is.
vi.mock("@chatbotx.io/ui/hooks/use-data-table", () => ({
  useDataTable: ({
    data,
    columns,
    getRowId,
  }: {
    data: unknown[]
    columns: never[]
    getRowId: (row: never) => string
  }) => ({
    table: useReactTable({
      data,
      columns,
      getRowId,
      getCoreRowModel: getCoreRowModel(),
    } as never),
  }),
}))
vi.mock("@chatbotx.io/ui/components/data-table/data-table", () => ({
  DataTable: ({ table }: { table: Table<BroadcastResourceWithRelations> }) => (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th data-column={header.column.id} key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td data-column={cell.column.id} key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}))
vi.mock(
  "@chatbotx.io/ui/components/data-table/data-table-column-header",
  () => ({
    DataTableColumnHeader: ({ title }: { title: string }) => (
      <span>{title}</span>
    ),
  }),
)
vi.mock("@chatbotx.io/ui/components/data-table/data-table-row-card", () => ({
  DataTableRowCard: nothing,
}))
vi.mock("@chatbotx.io/ui/components/ui/checkbox", () => ({ Checkbox: nothing }))
vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: passthrough,
  TooltipContent: passthrough,
  TooltipTrigger: passthrough,
}))
// The menu renders inline so its items are reachable without a popover.
vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: passthrough,
  DropdownMenuContent: passthrough,
  DropdownMenuTrigger: nothing,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children?: ReactNode
    onClick?: () => void
  }) => (
    <button data-menu-item onClick={onClick} type="button">
      {children}
    </button>
  ),
}))

// Every child component is stubbed: this test is about the id column and menu.
vi.mock("@/features/broadcasts/broadcast-detail-dialog", () => stubModule())
vi.mock("@/features/broadcasts/clone-broadcast-dialog", () => stubModule())
vi.mock("@/features/broadcasts/rename-broadcast-dialog", () => stubModule())
vi.mock("@/features/broadcasts/resend-broadcast-dialog", () => stubModule())
vi.mock("@/features/broadcasts/components/broadcast-series-summary", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/broadcast-stats-cell", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/broadcast-status-badge", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/broadcast-status-reason", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/broadcasts-empty-state", () =>
  stubModule(),
)
vi.mock(
  "@/features/broadcasts/components/broadcasts-table-toolbar-actions",
  () => stubModule(),
)
vi.mock("@/features/broadcasts/components/delete-broadcast-dialog", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/move-broadcast-to-draft-dialog", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/resume-broadcast-dialog", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/schedule-broadcast-dialog", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/components/stop-broadcast-dialog", () =>
  stubModule(),
)
vi.mock("@/features/broadcasts/provider/broadcast-stats-store-context", () => ({
  BroadcastStatsStoreProvider: passthrough,
}))

const { BroadcastsTable } = await import(
  "@/features/broadcasts/broadcasts-table"
)

const broadcast = {
  id: "11790000000000066",
  name: "Black Friday",
  status: "sent",
  channel: "webchat",
  schedulesType: "now",
  schedulesAt: new Date("2026-11-18T10:00:00Z"),
  createdAt: new Date("2026-11-18T10:00:00Z"),
  recurrence: null,
  occurrenceAt: null,
} as unknown as BroadcastResourceWithRelations

let container: HTMLDivElement | null = null
let root: Root | null = null

function render() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const value = [{ data: [broadcast], pageCount: 1 }]
  // An already-settled thenable, so React.use() does not suspend.
  const promises = Object.assign(Promise.resolve(value), {
    status: "fulfilled",
    value,
  }) as never
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<BroadcastsTable filtered={false} promises={promises} />)
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCopy.mockResolvedValue(true)
})

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

describe("BroadcastsTable id", () => {
  test("has no ID column", () => {
    const view = render()

    expect(view.querySelector('th[data-column="id"]')).toBeNull()
    expect(view.textContent).not.toContain("broadcasts.fields.id")
    expect(view.textContent).not.toContain(broadcast.id)
  })

  test("the row actions menu has a Copy ID item that copies the id and confirms", async () => {
    const view = render()

    const item = Array.from(
      view.querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
    ).find((button) => button.textContent?.includes("actions.copyId"))
    expect(item).toBeTruthy()

    await act(async () => {
      item?.click()
      await Promise.resolve()
    })

    expect(mockCopy).toHaveBeenCalledWith(broadcast.id)
    expect(mockToastSuccess).toHaveBeenCalledWith("messages.copiedToClipboard")
  })

  test("a refused clipboard shows the failure toast, not the success one", async () => {
    mockCopy.mockResolvedValue(false)
    const view = render()

    const item = Array.from(
      view.querySelectorAll<HTMLButtonElement>("[data-menu-item]"),
    ).find((button) => button.textContent?.includes("actions.copyId"))
    await act(async () => {
      item?.click()
      await Promise.resolve()
    })

    expect(mockToastError).toHaveBeenCalledWith("messages.copyFailed")
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })
})
