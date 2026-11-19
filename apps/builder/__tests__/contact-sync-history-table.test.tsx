import { act, Suspense } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"

/**
 * `useDataTable` / `DataTable` are stubbed as in
 * `contact-scan-history-table.test.tsx`, so this exercises what the table
 * owns: its cells (pages link, status, summed counters, dates) and the empty
 * state.
 */
const captured = vi.hoisted(() => ({
  columns: [] as unknown[],
  data: [] as unknown[],
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

vi.mock("@/features/contact-sync/hooks/use-contact-sync-labels", () => ({
  useContactSyncLabels: () => ({
    status: (status: string) => `status:${status}`,
  }),
}))

vi.mock("@chatbotx.io/ui/hooks/use-data-table", () => ({
  useDataTable: (props: { columns: unknown[]; data: unknown[] }) => {
    captured.columns = props.columns
    captured.data = props.data
    return { table: {} }
  },
}))

vi.mock("@chatbotx.io/ui/components/data-table/data-table", () => ({
  DataTable: () => (
    <div data-testid="data-table">
      {captured.data.map((row) => (
        <div data-testid="row" key={(row as { id: string }).id}>
          {captured.columns.map((column) => {
            const col = column as {
              id?: string
              accessorKey?: string
              cell?: (ctx: { row: { original: unknown } }) => React.ReactNode
            }
            const key = col.id ?? col.accessorKey ?? ""
            return (
              <span data-testid={`cell-${key}`} key={key}>
                {col.cell?.({ row: { original: row } })}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/data-table/data-table-toolbar", () => ({
  DataTableToolbar: () => null,
}))

const { ContactSyncHistoryTable } = await import(
  "@/features/contact-sync/components/contact-sync-history-table"
)

const item = (overrides: Record<string, unknown>) => ({
  id: "item",
  sourceAccountName: "Shop Page",
  createdCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  ...overrides,
})

const RUN = {
  id: "77",
  status: "partial",
  createdAt: new Date("2030-01-01T08:00:00.000Z"),
  finishedAt: null,
  items: [
    item({
      id: "a",
      sourceAccountName: "Page A",
      createdCount: 3,
      failedCount: 1,
    }),
    item({
      id: "b",
      sourceAccountName: null,
      createdCount: 2,
      updatedCount: 5,
    }),
  ],
}

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderTable(data: unknown[], total = data.length) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const promise = Promise.resolve({ data, total, pageCount: 1 })
  await act(async () => {
    await promise
    root?.render(
      <Suspense fallback={null}>
        <ContactSyncHistoryTable
          promise={promise as never}
          workspaceId="ws-1"
        />
      </Suspense>,
    )
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

const cell = (el: HTMLElement, key: string) =>
  el.querySelector(`[data-testid="cell-${key}"]`)

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
})

describe("ContactSyncHistoryTable", () => {
  test("a run links to its progress and names every page", async () => {
    const el = await renderTable([RUN])

    const link = cell(el, "pages")?.querySelector("a")
    expect(link?.getAttribute("href")).toBe(
      "/space/ws-1/contacts/sync/histories/77",
    )
    expect(link?.textContent).toBe("Page A, contactSync.progress.source")
  })

  test("counters are summed over the run's pages", async () => {
    const el = await renderTable([RUN])

    expect(cell(el, "createdCount")?.textContent).toBe("5")
    expect(cell(el, "updatedCount")?.textContent).toBe("5")
    expect(cell(el, "skippedCount")?.textContent).toBe("0")
    expect(cell(el, "failedCount")?.textContent).toBe("1")
  })

  test("shows the status and a dash for a run not finished yet", async () => {
    const el = await renderTable([RUN])

    expect(cell(el, "status")?.textContent).toBe("status:partial")
    expect(cell(el, "createdAt")?.textContent).toBe("2030-01-01T08:00:00.000Z")
    expect(cell(el, "finishedAt")?.textContent).toBe("—")
  })

  test("a page past the last one keeps the table, not the empty state", async () => {
    const el = await renderTable([], 12)

    expect(el.textContent).not.toContain("contactSync.history.empty")
    expect(el.querySelector('[data-testid="data-table"]')).not.toBeNull()
  })

  test("no run yet shows the empty state, not a table", async () => {
    const el = await renderTable([])

    expect(el.textContent).toContain("contactSync.history.empty")
    expect(el.querySelector('[data-testid="data-table"]')).toBeNull()
  })
})
