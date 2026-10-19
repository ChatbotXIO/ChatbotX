// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString().slice(0, 10),
  }),
}))

const { DateOverrideTable } = await import(
  "@/features/working-hours/components/date-override-table"
)
const { DateOverrideDialog } = await import(
  "@/features/working-hours/components/date-override-dialog"
)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

const render = (node: React.ReactNode) => act(() => root.render(node))

describe("DateOverrideTable", () => {
  test("shows the empty state", () => {
    render(
      <DateOverrideTable
        disabled={false}
        emptyLabel="Nothing here"
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        rows={[]}
      />,
    )
    expect(container.textContent).toContain("Nothing here")
  })

  test("renders a closed day and custom hours, and disables the row actions", () => {
    render(
      <DateOverrideTable
        disabled
        emptyLabel="Nothing here"
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        rows={[
          { date: "2030-01-01", name: "New year", ranges: [] },
          {
            date: "2030-01-02",
            name: null,
            ranges: [{ startMinute: 540, endMinute: 720 }],
          },
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("New year")
    expect(text).toContain("workingHours.dateDialog.closed")
    expect(text).toContain("09:00–12:00")
    expect(
      Array.from(container.querySelectorAll("button")).every((b) => b.disabled),
    ).toBe(true)
  })

  test("edit and delete report the clicked row", () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const row = { date: "2030-01-01", name: null, ranges: [] }
    render(
      <DateOverrideTable
        disabled={false}
        emptyLabel=""
        onDelete={onDelete}
        onEdit={onEdit}
        rows={[row]}
      />,
    )
    const [edit, remove] = Array.from(container.querySelectorAll("button"))
    act(() => edit.click())
    act(() => remove.click())
    expect(onEdit).toHaveBeenCalledWith(row)
    expect(onDelete).toHaveBeenCalledWith(row)
  })
})

describe("DateOverrideDialog", () => {
  const dialog = (
    props: Partial<React.ComponentProps<typeof DateOverrideDialog>>,
  ) => (
    <DateOverrideDialog
      initial={null}
      onOpenChange={vi.fn()}
      onSubmit={vi.fn()}
      open
      pending={false}
      takenDates={["2030-01-01"]}
      title="Add date"
      {...props}
    />
  )
  const field = (id: string) =>
    document.body.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement
  const type = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      setter?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  const saveButton = () =>
    Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.type === "submit") as HTMLButtonElement

  test("save is disabled until a date is entered", () => {
    render(dialog({}))
    expect(saveButton().disabled).toBe(true)
    type(field("date-override-date"), "2030-02-02")
    expect(saveButton().disabled).toBe(false)
  })

  test("a date already in the list is rejected with a message", () => {
    render(dialog({}))
    type(field("date-override-date"), "2030-01-01")
    expect(document.body.textContent).toContain(
      "workingHours.dateDialog.duplicate",
    )
    expect(saveButton().disabled).toBe(true)
  })

  test("submits a closed day as an empty list", () => {
    const onSubmit = vi.fn()
    render(dialog({ onSubmit }))
    type(field("date-override-date"), "2030-02-02")
    act(() => saveButton().click())
    expect(onSubmit).toHaveBeenCalledWith({
      date: "2030-02-02",
      name: "",
      closed: true,
      ranges: [],
    })
  })

  test("editing keeps the date fixed and shows the existing ranges", () => {
    render(
      dialog({
        initial: {
          date: "2030-01-01",
          name: "New year",
          closed: false,
          ranges: [{ startMinute: 540, endMinute: 720 }],
        },
      }),
    )
    expect(field("date-override-date").disabled).toBe(true)
    expect(field("date-override-name").value).toBe("New year")
    expect(document.body.textContent).toContain("09:00")
  })

  test("while saving every control is disabled", () => {
    render(dialog({ pending: true }))
    expect(field("date-override-date").disabled).toBe(true)
    expect(field("date-override-name").disabled).toBe(true)
    expect(saveButton().disabled).toBe(true)
  })
})

describe("DateOverrideDialog re-render", () => {
  test("a parent re-render with a new initial object keeps what the user typed", () => {
    const base = {
      onOpenChange: vi.fn(),
      onSubmit: vi.fn(),
      open: true,
      pending: false,
      takenDates: [],
      title: "Edit",
    }
    const initial = () => ({
      date: "2030-01-01",
      name: "Old",
      closed: true,
      ranges: [],
    })
    act(() => root.render(<DateOverrideDialog {...base} initial={initial()} />))
    const input = document.body.querySelector<HTMLInputElement>(
      "#date-override-name",
    ) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      setter?.call(input, "Edited")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    act(() =>
      root.render(<DateOverrideDialog {...base} initial={initial()} pending />),
    )

    expect(
      (document.body.querySelector("#date-override-name") as HTMLInputElement)
        .value,
    ).toBe("Edited")
  })
})

describe("DateOverrideDialog inside another form", () => {
  test("saving the date does not submit the surrounding form", () => {
    const parentSubmit = vi.fn((event: React.FormEvent) =>
      event.preventDefault(),
    )
    const onSubmit = vi.fn()
    act(() =>
      root.render(
        <form onSubmit={parentSubmit}>
          <DateOverrideDialog
            initial={null}
            onOpenChange={vi.fn()}
            onSubmit={onSubmit}
            open
            pending={false}
            takenDates={[]}
            title="Add date"
          />
        </form>,
      ),
    )
    const date = document.body.querySelector<HTMLInputElement>(
      "#date-override-date",
    ) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      setter?.call(date, "2030-02-02")
      date.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const save = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.type === "submit") as HTMLButtonElement
    act(() => save.click())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(parentSubmit).not.toHaveBeenCalled()
  })
})
