import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest"
import { ConnectSelectionForm } from "@/features/channel-connect/components/connect-selection-form"
import { AhachatImportAvailability } from "@/features/channel-connect/lib/ahachat-import-availability"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {}
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

const coexist = { descriptionKey: "coexist.descriptionMessenger" }
const items: ConnectPickerItem[] = [
  { id: "a", name: "Page A" },
  { id: "b", name: "Page B" },
]

describe("ConnectSelectionForm — AhaChat import", () => {
  let container: HTMLDivElement
  let root: Root

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

  const render = (options: {
    ahachatPageIds: string[]
    channel: "messenger" | "instagram" | "whatsapp"
    onSubmit?: Mock<() => void>
  }) => {
    const onSubmit = options.onSubmit ?? vi.fn<() => void>()
    act(() => {
      root.render(
        <AhachatImportAvailability pageIds={options.ahachatPageIds}>
          <ConnectSelectionForm
            channel={options.channel}
            coexist={coexist}
            idsFieldName="pageIds"
            items={items}
            onSubmit={onSubmit}
          />
        </AhachatImportAvailability>,
      )
    })
    return onSubmit
  }

  const switchByLabel = (label: string, row: string) =>
    container.querySelector<HTMLElement>(
      `[role="switch"][aria-label="${label} — ${row}"]`,
    )
  const checkboxes = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="checkbox"]'))
  const continueButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("actions.continue"),
    )
  // The question dialog renders in a portal, outside the picker's container.
  const dialogTitle = () =>
    Array.from(document.body.querySelectorAll("[role=dialog] *")).find(
      (node) => node.textContent === "ahachatImport.dialogTitle",
    )
  const dialogButton = (text: string) =>
    Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === text,
    )
  const syncSwitch = (row: string) =>
    switchByLabel("channels.connectMany.stepCoexist", row)
  const click = async (element: HTMLElement | null | undefined) => {
    await act(async () => {
      element?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
  }
  const submit = async () => {
    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  const turnSyncOn = async (rowIndex = 1, row = "Page A") => {
    await click(checkboxes()[rowIndex])
    await click(syncSwitch(row))
  }

  test("asks nothing when AhaChat has none of the pages (or cannot be used)", async () => {
    render({ ahachatPageIds: [], channel: "messenger" })

    await turnSyncOn()

    expect(dialogTitle()).toBeUndefined()
  })

  test("asks nothing on WhatsApp even when AhaChat has the page", async () => {
    render({ ahachatPageIds: ["a", "b"], channel: "whatsapp" })

    await turnSyncOn()

    expect(dialogTitle()).toBeUndefined()
  })

  test("turning the sync on for an unticked page selects it and asks only when AhaChat has it", async () => {
    render({ ahachatPageIds: ["b"], channel: "messenger" })

    await click(syncSwitch("Page A"))
    expect(checkboxes()[1]?.getAttribute("aria-checked")).toBe("true")
    expect(dialogTitle()).toBeUndefined()

    await click(syncSwitch("Page B"))
    expect(checkboxes()[2]?.getAttribute("aria-checked")).toBe("true")
    expect(dialogTitle()).toBeDefined()
    expect(document.body.textContent).toContain('"page":"Page B"')
  })

  test("asks only for a page AhaChat has", async () => {
    render({ ahachatPageIds: ["b"], channel: "messenger" })

    await turnSyncOn()

    expect(dialogTitle()).toBeUndefined()
  })

  test("turning the history sync on asks whether to import from AhaChat first", async () => {
    render({ ahachatPageIds: ["a", "b"], channel: "messenger" })

    await turnSyncOn()

    expect(dialogTitle()).toBeDefined()
    expect(document.body.textContent).toContain('"page":"Page A"')
  })

  test("a row with the history sync off is never asked", async () => {
    render({ ahachatPageIds: ["a", "b"], channel: "messenger" })

    await click(checkboxes()[1])

    expect(dialogTitle()).toBeUndefined()
  })

  test("marks only the pages AhaChat has, and checks the mark once a row uses AhaChat", async () => {
    render({ ahachatPageIds: ["a"], channel: "messenger" })
    const badges = () =>
      Array.from(container.querySelectorAll('[role="img"]')).map((node) =>
        node.getAttribute("aria-label"),
      )

    expect(badges()).toEqual(["ahachatImport.badge.onAhachat"])

    await turnSyncOn()
    await click(dialogButton("ahachatImport.importFirst"))

    expect(badges()).toEqual(["ahachatImport.badge.selected"])
  })

  test("choosing import-first submits the row in both lists: the history sync follows the import", async () => {
    const onSubmit = render({
      ahachatPageIds: ["a", "b"],
      channel: "messenger",
    })

    await turnSyncOn()
    await click(dialogButton("ahachatImport.importFirst"))
    await submit()

    expect(onSubmit).toHaveBeenCalledWith({
      pageIds: ["a"],
      coexistIds: ["a"],
      ahachatIds: ["a"],
      aiReadsSyncedHistoryIds: [],
    })
  })

  test("choosing history-only, or closing the question, keeps the plain history sync", async () => {
    const onSubmit = render({
      ahachatPageIds: ["a", "b"],
      channel: "messenger",
    })

    await turnSyncOn()
    await click(dialogButton("ahachatImport.historyOnly"))
    await submit()

    expect(dialogTitle()).toBeUndefined()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ coexistIds: ["a"], ahachatIds: [] }),
    )
  })

  test("the import note shows under the list once a row chose import-first", async () => {
    render({ ahachatPageIds: ["a", "b"], channel: "messenger" })

    await turnSyncOn()
    await click(dialogButton("ahachatImport.importFirst"))

    expect(container.textContent).toContain("ahachatImport.panelDescription")
  })

  test("turning the sync off drops the choice, and turning it on asks again", async () => {
    const onSubmit = render({
      ahachatPageIds: ["a", "b"],
      channel: "messenger",
    })

    await turnSyncOn()
    await click(dialogButton("ahachatImport.importFirst"))
    await click(syncSwitch("Page A"))
    expect(container.textContent).not.toContain(
      "ahachatImport.panelDescription",
    )

    await click(syncSwitch("Page A"))
    expect(dialogTitle()).toBeDefined()
    await click(dialogButton("ahachatImport.historyOnly"))
    await submit()

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ coexistIds: ["a"], ahachatIds: [] }),
    )
  })

  test("unchecking the row drops both its history sync and its import-first choice", async () => {
    const onSubmit = render({
      ahachatPageIds: ["a", "b"],
      channel: "messenger",
    })

    await turnSyncOn()
    await click(dialogButton("ahachatImport.importFirst"))
    await click(checkboxes()[1])
    await click(checkboxes()[2])
    await submit()

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        pageIds: ["b"],
        coexistIds: [],
        ahachatIds: [],
      }),
    )
  })
})
