// @vitest-environment node
import {
  type ColumnDef,
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type TableOptionsResolved,
} from "@tanstack/react-table"
import { describe, expect, test } from "vitest"

type Row = { id: string; seconds: number | null }

const columns: ColumnDef<Row>[] = [
  {
    id: "seconds",
    accessorFn: (row) => row.seconds ?? undefined,
    enableSorting: true,
    sortUndefined: "last",
  },
]

const data: Row[] = [
  { id: "a", seconds: 300 },
  { id: "none", seconds: null },
  { id: "b", seconds: 60 },
  { id: "c", seconds: 900 },
]

function sortedIds(desc: boolean, manualSorting: boolean): string[] {
  const table = createTable<Row>({
    data,
    columns,
    manualSorting,
    state: { sorting: [{ id: "seconds", desc }] },
    onStateChange: () => undefined,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  } as TableOptionsResolved<Row>)
  return table.getRowModel().rows.map((row) => row.original.id)
}

describe("client sorting with sortUndefined", () => {
  test("ascending puts null rows last", () => {
    expect(sortedIds(false, false)).toEqual(["b", "a", "c", "none"])
  })

  test("descending still puts null rows last", () => {
    expect(sortedIds(true, false)).toEqual(["c", "a", "b", "none"])
  })

  test("manualSorting leaves the server order untouched", () => {
    expect(sortedIds(false, true)).toEqual(["a", "none", "b", "c"])
  })
})
