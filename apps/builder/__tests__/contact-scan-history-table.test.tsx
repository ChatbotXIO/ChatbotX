import { act, Suspense } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { ListContactScanHistoryItem } from "@/features/contact-scan/schema/query"

/**
 * `useDataTable` and `DataTable` are generic `@chatbotx.io/ui` infra with no
 * production test coverage in this repo (no `NuqsAdapter` is wired up for
 * builder tests) — stubbed here so this test exercises what
 * `ContactScanHistoryTable` actually owns: its column cell renderers
 * (channel/status/counts/dates/error) and the empty state, mirroring how
 * `contact-scan-form.test.tsx` stubs heavy form widgets to isolate the
 * component's own logic.
 */
const captured = vi.hoisted(() => ({
  columns: [] as unknown[],
  data: [] as unknown[],
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
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
  DataTable: ({ children }: { children?: React.ReactNode }) => (
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
                {col.cell ? col.cell({ row: { original: row } }) : null}
              </span>
            )
          })}
        </div>
      ))}
      {children}
    </div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/data-table/data-table-toolbar", () => ({
  DataTableToolbar: () => <div data-testid="toolbar" />,
}))

vi.mock(
  "@chatbotx.io/ui/components/data-table/data-table-column-header",
  () => ({
    DataTableColumnHeader: ({ title }: { title: string }) => (
      <span>{title}</span>
    ),
  }),
)

const { ContactScanHistoryTable } = await import(
  "@/features/contact-scan/components/contact-scan-history-table"
)

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderTable(
  promise: Promise<{ data: ListContactScanHistoryItem[]; pageCount: number }>,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    // Settle the promise before rendering so `use()` reads it as fulfilled
    // on the first pass instead of suspending.
    await promise
    root?.render(
      <Suspense fallback={<div data-testid="loading" />}>
        <ContactScanHistoryTable promises={Promise.all([promise])} />
      </Suspense>,
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
  captured.columns = []
  captured.data = []
})

const ROW: ListContactScanHistoryItem = {
  id: "scan-1",
  workspaceId: "ws-1",
  channel: "messenger",
  status: "succeeded",
  scanFromAt: new Date("2026-01-01T00:00:00Z"),
  importedContactCount: 12,
  currentScan: 40,
  startedAt: new Date("2026-01-01T00:00:00Z"),
  finishedAt: new Date("2026-01-01T01:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  requestedByUserId: "user-1",
  currentError: null,
}

describe("ContactScanHistoryTable", () => {
  test("renders the empty state when there is no history yet", async () => {
    const el = await renderTable(Promise.resolve({ data: [], pageCount: 0 }))

    expect(el.textContent).toContain("contactScan.histories.empty")
    expect(el.querySelector('[data-testid="data-table"]')).toBeNull()
  })

  test("renders a row with the channel, counts, and status label", async () => {
    const el = await renderTable(Promise.resolve({ data: [ROW], pageCount: 1 }))

    expect(el.querySelector('[data-testid="cell-channel"]')?.textContent).toBe(
      "fields.messenger.label",
    )
    expect(
      el.querySelector('[data-testid="cell-importedContactCount"]')
        ?.textContent,
    ).toBe("12")
    expect(
      el.querySelector('[data-testid="cell-currentScan"]')?.textContent,
    ).toBe("40")
    expect(el.querySelector('[data-testid="cell-status"]')?.textContent).toBe(
      "contactScan.histories.status.succeeded",
    )
  })

  test("truncates a long scan error and keeps the full text in the title attribute", async () => {
    const longError = "x".repeat(120)
    const el = await renderTable(
      Promise.resolve({
        data: [{ ...ROW, currentError: longError }],
        pageCount: 1,
      }),
    )

    const cell = el.querySelector('[data-testid="cell-currentError"] span')
    expect(cell?.getAttribute("title")).toBe(longError)
    expect(cell?.textContent?.length ?? 0).toBeLessThan(longError.length)
  })

  test("shows a dash for a run that has not finished yet", async () => {
    const el = await renderTable(
      Promise.resolve({
        data: [{ ...ROW, finishedAt: null }],
        pageCount: 1,
      }),
    )

    expect(
      el.querySelector('[data-testid="cell-finishedAt"]')?.textContent,
    ).toBe("—")
  })
})
