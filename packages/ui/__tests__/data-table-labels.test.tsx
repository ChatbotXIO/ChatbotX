import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { DataTable } from "../src/components/data-table/data-table"
import {
  type DataTableLabels,
  DataTableLabelsProvider,
} from "../src/components/data-table/data-table-labels"

type Contact = { id: string; name: string }

const helper = createColumnHelper<Contact>()
const COLUMNS = [helper.accessor("name", { header: "Name" })]

const PT_BR: DataTableLabels = {
  noResults: "Nenhum resultado.",
  selectedRows: (selected, total) =>
    `${selected} de ${total} linha(s) selecionada(s).`,
  rowsPerPage: "Linhas por página",
  pageOf: (page, pageCount) => `Página ${page} de ${pageCount}`,
  nextPage: "Ir para a próxima página",
}

function Harness({
  data,
  labels,
}: {
  data: Contact[]
  labels?: DataTableLabels
}) {
  const table = useReactTable({
    data,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })
  return <DataTable labels={labels} table={table} />
}

describe("DataTable labels", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
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

  test("keeps the English labels when no provider is mounted", () => {
    act(() => {
      root.render(<Harness data={[{ id: "1", name: "Ada" }]} />)
    })

    expect(container.textContent).toContain("0 of 1 row(s) selected.")
    expect(container.textContent).toContain("Rows per page")
    expect(container.textContent).toContain("Page 1 of 1")
  })

  test("uses the labels given by DataTableLabelsProvider", () => {
    act(() => {
      root.render(
        <DataTableLabelsProvider value={PT_BR}>
          <Harness data={[]} />
        </DataTableLabelsProvider>,
      )
    })

    expect(container.textContent).toContain("Nenhum resultado.")
    expect(container.textContent).toContain("0 de 0 linha(s) selecionada(s).")
    expect(container.textContent).toContain("Linhas por página")
    expect(container.textContent).toContain("Página 1 de 0")
    expect(
      container.querySelector('[aria-label="Ir para a próxima página"]'),
    ).not.toBeNull()
    expect(container.textContent).not.toContain("Rows per page")
  })

  test("lets a table's own labels win key by key over the provider", () => {
    act(() => {
      root.render(
        <DataTableLabelsProvider value={PT_BR}>
          <Harness data={[]} labels={{ noResults: "Sem contatos" }} />
        </DataTableLabelsProvider>,
      )
    })

    expect(container.textContent).toContain("Sem contatos")
    expect(container.textContent).not.toContain("Nenhum resultado.")
    expect(container.textContent).toContain("Linhas por página")
  })
})
