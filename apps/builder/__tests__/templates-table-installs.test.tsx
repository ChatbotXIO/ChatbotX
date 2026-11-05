// @vitest-environment jsdom

import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TemplatesTable } from "@/features/templates/components/templates-table"

type InstallColumn = {
  accessorKey?: string
  cell: (context: { row: { original: unknown } }) => ReactNode
}

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@chatbotx.io/ui/hooks/use-data-table", () => ({
  useDataTable: (table: unknown) => ({ table }),
}))
// Renders only the column under test, for every row.
vi.mock("@chatbotx.io/ui/components/data-table/data-table", () => ({
  DataTable: ({
    table,
  }: {
    table: { columns: InstallColumn[]; data: unknown[] }
  }) => {
    const column = table.columns.find(
      (candidate) => candidate.accessorKey === "installCount",
    )
    return (
      <div>
        {table.data.map((row) => column?.cell({ row: { original: row } }))}
      </div>
    )
  },
}))
vi.mock("@/features/templates/components/delete-template-dialog", () => ({
  DeleteTemplateDialog: () => null,
}))
vi.mock("@/features/templates/components/share-template-dialog", () => ({
  ShareTemplateDialog: () => null,
}))
vi.mock("@/features/templates/components/template-installers-dialog", () => ({
  TemplateInstallersDialog: (props: {
    open: boolean
    template: { name: string } | null
  }) => (props.open ? <p id="analytics">{props.template?.name}</p> : null),
}))

describe("templates table install count", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("clicking the count opens that template's analytics popup", () => {
    const templates = [{ id: "1", name: "Starter", installCount: 3 }] as never
    act(() =>
      root.render(<TemplatesTable templates={templates} workspaceId="9" />),
    )
    expect(container.querySelector("#analytics")).toBeNull()

    const count = container.querySelector("button")
    expect(count?.textContent).toBe("3")
    act(() => count?.click())

    expect(container.querySelector("#analytics")?.textContent).toBe("Starter")
  })
})
