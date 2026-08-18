import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { DataTableRowCard } from "../src/components/data-table/data-table-row-card"

type Flow = { id: string; name: string; status: string }

const helper = createColumnHelper<Flow>()
const COLUMNS = [
  helper.display({
    id: "select",
    cell: () => <input aria-label="Select row" type="checkbox" />,
  }),
  helper.accessor("name", {
    header: "Name",
    cell: (info) => <span data-testid="name-cell">{info.getValue()}</span>,
    meta: { label: "Name" },
  }),
  helper.accessor("status", {
    header: "Status",
    cell: (info) => info.getValue(),
    meta: { label: "Status" },
  }),
  helper.display({
    id: "actions",
    cell: () => <button type="button">Menu</button>,
  }),
]

function Harness() {
  const table = useReactTable({
    data: [{ id: "1", name: "Welcome flow", status: "active" }],
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })
  const row = table.getRowModel().rows[0]
  if (!row) {
    throw new Error("fixture produced no row")
  }
  return <DataTableRowCard row={row} />
}

describe("DataTableRowCard", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(<Harness />)
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("reuses each column's own cell renderer", () => {
    // The card must not carry a second copy of a cell that could drift from
    // the table's.
    expect(
      container.querySelector('[data-testid="name-cell"]')?.textContent,
    ).toBe("Welcome flow")
  })

  test("labels fields from column meta", () => {
    const labels = Array.from(container.querySelectorAll("dt")).map(
      (node) => node.textContent,
    )
    expect(labels).toEqual(["Name", "Status"])
  })

  test("lifts select and actions out of the field list", () => {
    const values = Array.from(container.querySelectorAll("dd")).map(
      (node) => node.textContent,
    )
    expect(values).toEqual(["Welcome flow", "active"])

    // Both still render, just as chrome above the fields.
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull()
    expect(container.querySelector("button")?.textContent).toBe("Menu")
  })
})
