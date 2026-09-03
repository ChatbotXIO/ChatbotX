import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { DataTable } from "../src/components/data-table/data-table"

type Contact = { id: string; name: string; email: string }

const ROWS: Contact[] = [
  { id: "1", name: "Ada", email: "ada@example.com" },
  { id: "2", name: "Grace", email: "grace@example.com" },
]

const helper = createColumnHelper<Contact>()
const COLUMNS = [
  helper.accessor("name", { header: "Name" }),
  helper.accessor("email", { header: "Email" }),
]

function Harness({
  data = ROWS,
  withCards = false,
}: {
  data?: Contact[]
  withCards?: boolean
}) {
  const table = useReactTable({
    data,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <DataTable
      labels={{ noResults: "Nothing here" }}
      mobileCard={
        withCards
          ? (row) => <span data-testid="card">{row.original.name}</span>
          : undefined
      }
      table={table}
    />
  )
}

describe("DataTable", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (props: Parameters<typeof Harness>[0] = {}) => {
    act(() => {
      root.render(<Harness {...props} />)
    })
  }

  const tableRegion = () =>
    container.querySelector<HTMLDivElement>("div.rounded-md.border")

  const cardList = () =>
    container.querySelector<HTMLDivElement>('[data-slot="data-table-cards"]')

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  test("scrolls horizontally instead of clipping columns", () => {
    render()

    expect(tableRegion()?.className).toContain("overflow-x-auto")
    expect(tableRegion()?.className).not.toContain("overflow-hidden")
  })

  test("renders only the table when no mobileCard is supplied", () => {
    render()

    expect(cardList()).toBeNull()
    expect(container.querySelector("table")).not.toBeNull()
    // Nothing hides the table, so existing consumers are untouched.
    expect(tableRegion()?.className).not.toContain("hidden")
  })

  test("renders a card per row and hides the table below md when supplied", () => {
    render({ withCards: true })

    const cards = Array.from(
      container.querySelectorAll('[data-testid="card"]'),
    ).map((node) => node.textContent)
    expect(cards).toEqual(["Ada", "Grace"])

    expect(cardList()?.className).toContain("md:hidden")
    expect(tableRegion()?.className).toContain("hidden")
    expect(tableRegion()?.className).toContain("md:block")
  })

  test("keeps the table rendered so it takes over from md up", () => {
    render({ withCards: true })

    const cells = Array.from(container.querySelectorAll("td")).map(
      (node) => node.textContent,
    )
    expect(cells).toContain("Ada")
  })

  test("shows the empty label in both views", () => {
    render({ data: [], withCards: true })

    expect(cardList()?.textContent).toBe("Nothing here")
    expect(container.querySelector("tbody")?.textContent).toBe("Nothing here")
  })
})
