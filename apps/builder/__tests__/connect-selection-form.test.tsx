import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"
import { ConnectSelectionForm } from "@/features/channel-connect/components/connect-selection-form"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import {
  MAX_CONNECT_SELECTIONS,
  uniqueIds,
} from "@/features/channel-connect/schema"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
}
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

const RAW_ZOD_MESSAGE_REGEX = /Array must contain|too_small|duplicateSelection/i

function makeItems(count: number): ConnectPickerItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    name: `Item ${i}`,
  }))
}

describe("ConnectSelectionForm", () => {
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

  const continueButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("actions.continue"),
    )
  const checkboxes = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="checkbox"]'))
  const selectAllCheckbox = () =>
    container.querySelector<HTMLElement>(
      'form > div:first-child [role="checkbox"]',
    )

  test("Continue is disabled with nothing selected", () => {
    const onSubmit = vi.fn()
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="ids"
          items={makeItems(3)}
          onSubmit={onSubmit}
        />,
      )
    })

    expect(continueButton()?.disabled).toBe(true)
  })

  test("Continue is disabled while submitting", () => {
    const onSubmit = vi.fn()
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="ids"
          isSubmitting
          items={makeItems(3)}
          onSubmit={onSubmit}
        />,
      )
    })

    // The row checkboxes still work (namespaced via the id field, tested in
    // checkbox-group-field.test.tsx); Continue stays disabled regardless.
    expect(continueButton()?.disabled).toBe(true)
  })

  test("submits exactly `{ [idsFieldName]: ids }` with the picked ids, in selection order", async () => {
    const onSubmit = vi.fn()
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="pageIds"
          items={makeItems(3)}
          onSubmit={onSubmit}
        />,
      )
    })

    // Row checkboxes render after the select-all checkbox.
    const [, first, second] = checkboxes()
    await act(async () => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      second?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      pageIds: ["id-0", "id-1"],
      coexistIds: [],
      aiReadsSyncedHistoryIds: [],
    })
  })

  test("clicking the Select all text toggles select-all like its checkbox", () => {
    const items: ConnectPickerItem[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="ids"
          items={items}
          onSubmit={vi.fn()}
        />,
      )
    })
    const label = container.querySelector("#connect-select-all-label")
    expect(label).not.toBeNull()

    act(() => {
      label?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(selectAllCheckbox()?.getAttribute("aria-checked")).toBe("true")

    act(() => {
      label?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(selectAllCheckbox()?.getAttribute("aria-checked")).toBe("false")
  })

  test("select-all only picks enabled rows and caps at max", async () => {
    const items: ConnectPickerItem[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B", disabled: true },
      { id: "c", name: "C" },
    ]
    const onSubmit = vi.fn()
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="ids"
          items={items}
          max={2}
          onSubmit={onSubmit}
        />,
      )
    })

    await act(async () => {
      selectAllCheckbox()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
      await Promise.resolve()
    })

    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      ids: ["a", "c"],
      coexistIds: [],
      aiReadsSyncedHistoryIds: [],
    })
  })

  test("shows the selected/max counter", () => {
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="ids"
          items={makeItems(5)}
          max={20}
          onSubmit={vi.fn()}
        />,
      )
    })

    expect(container.textContent).toContain(
      'channels.connectMany.selected:{"count":0,"max":20}',
    )
  })

  test("deselecting back to zero shows the translated (not raw zod) validation message", async () => {
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="ids"
          items={makeItems(3)}
          onSubmit={vi.fn()}
        />,
      )
    })

    const [, first] = checkboxes()
    // Select then deselect the same row so the field becomes touched with an
    // empty array, which is what triggers the `min` validation message.
    await act(async () => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "channels.connectMany.validation.min",
    )
    expect(container.textContent).not.toMatch(RAW_ZOD_MESSAGE_REGEX)
  })

  test("select-all header checkbox shows checked when more rows are enabled than the cap allows", async () => {
    const items = makeItems(5)
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="ids"
          items={items}
          max={3}
          onSubmit={vi.fn()}
        />,
      )
    })

    await act(async () => {
      selectAllCheckbox()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
      await Promise.resolve()
    })

    expect(selectAllCheckbox()?.getAttribute("aria-checked")).toBe("true")
    expect(container.textContent).toContain(
      'channels.connectMany.selected:{"count":3,"max":3}',
    )
  })
})

describe("uniqueIds schema (selection validation)", () => {
  test("accepts exactly the max count", () => {
    const ids = Array.from(
      { length: MAX_CONNECT_SELECTIONS },
      (_, i) => `id-${i}`,
    )
    expect(uniqueIds().safeParse(ids).success).toBe(true)
  })

  test("rejects one more than the max count", () => {
    const ids = Array.from(
      { length: MAX_CONNECT_SELECTIONS + 1 },
      (_, i) => `id-${i}`,
    )
    expect(uniqueIds().safeParse(ids).success).toBe(false)
  })

  test("rejects duplicate ids", () => {
    expect(uniqueIds().safeParse(["a", "a"]).success).toBe(false)
  })

  test("rejects an empty selection", () => {
    expect(uniqueIds().safeParse([]).success).toBe(false)
  })

  test("respects a custom max", () => {
    const schema = z.object({ ids: uniqueIds(5) })
    expect(schema.safeParse({ ids: ["a", "b", "c", "d", "e"] }).success).toBe(
      true,
    )
    expect(
      schema.safeParse({ ids: ["a", "b", "c", "d", "e", "f"] }).success,
    ).toBe(false)
  })

  test("uses the caller's translated messages instead of zod's defaults", () => {
    const schema = uniqueIds(2, {
      min: "translated-min",
      max: "translated-max",
      duplicate: "translated-duplicate",
    })

    const minResult = schema.safeParse([])
    expect(minResult.success).toBe(false)
    expect(minResult.error?.issues[0]?.message).toBe("translated-min")

    const maxResult = schema.safeParse(["a", "b", "c"])
    expect(maxResult.success).toBe(false)
    expect(maxResult.error?.issues[0]?.message).toBe("translated-max")

    const duplicateResult = schema.safeParse(["a", "a"])
    expect(duplicateResult.success).toBe(false)
    expect(duplicateResult.error?.issues[0]?.message).toBe(
      "translated-duplicate",
    )
  })
})

describe("ConnectSelectionForm (coexist switches)", () => {
  const coexist = { descriptionKey: "coexist.descriptionMessenger" }
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

  const switches = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="switch"]'))
  const checkboxes = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[role="checkbox"]'))
  const selectAllCheckbox = () =>
    container.querySelector<HTMLElement>(
      'form > div:first-child [role="checkbox"]',
    )
  const continueButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("actions.continue"),
    )
  const click = async (element: HTMLElement | null | undefined) => {
    await act(async () => {
      element?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })
  }

  const render = (onSubmit = vi.fn()) => {
    act(() => {
      root.render(
        <ConnectSelectionForm
          coexist={coexist}
          idsFieldName="pageIds"
          items={makeItems(3)}
          onSubmit={onSubmit}
        />,
      )
    })
    return onSubmit
  }

  test("renders no per-row coexist switch when the coexist prop is absent", () => {
    act(() => {
      root.render(
        <ConnectSelectionForm
          idsFieldName="pageIds"
          items={makeItems(3)}
          onSubmit={vi.fn()}
        />,
      )
    })

    expect(switches()).toHaveLength(0)
  })

  test("every row switch defaults off and stays disabled until its row is checked", async () => {
    render()

    expect(switches()).toHaveLength(3)
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("false")
    expect(switches()[0]?.getAttribute("aria-disabled")).toBe("true")

    const [, first] = checkboxes()
    await click(first)

    // Base UI drops `aria-disabled` entirely once the switch is enabled.
    expect(switches()[0]?.getAttribute("aria-disabled")).toBeNull()
    expect(switches()[1]?.getAttribute("aria-disabled")).toBe("true")
  })

  test("turning a row switch on reveals the coexist panel with the channel description and the AI switch", async () => {
    render()

    const [, first] = checkboxes()
    await click(first)
    expect(container.textContent).not.toContain("coexist.descriptionMessenger")

    await click(switches()[0])

    expect(container.textContent).toContain("coexist.descriptionMessenger")
    expect(container.textContent).toContain("coexist.billingNote")
    expect(container.textContent).toContain("coexist.aiReadsSyncedHistoryLabel")
    // One switch per row plus the panel's global AI switch.
    expect(switches()).toHaveLength(4)
  })

  test("unchecking a row drops it from the coexist selection and hides the panel", async () => {
    render()

    const [, first] = checkboxes()
    await click(first)
    await click(switches()[0])
    expect(container.textContent).toContain("coexist.descriptionMessenger")

    await click(first)
    expect(container.textContent).not.toContain("coexist.descriptionMessenger")

    // Re-checking the same row starts from a fresh, OFF switch.
    await click(first)
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("false")
  })

  test("select-all never turns on a coexist switch", async () => {
    render()

    await click(selectAllCheckbox())

    expect(
      switches().every(
        (element) => element.getAttribute("aria-checked") === "false",
      ),
    ).toBe(true)
    expect(container.textContent).not.toContain("coexist.descriptionMessenger")
  })

  test("a row's coexist switch names its row and its label text is a click target", async () => {
    render()

    const [, first] = checkboxes()
    await click(first)

    // Twenty rows must not all announce the same bare "Sync history".
    expect(switches()[0]?.getAttribute("aria-label")).toBe(
      "channels.connectMany.stepCoexist — Item 0",
    )

    const rowLabel = switches()[0]?.closest("label")
    expect(rowLabel).not.toBeNull()
    expect(rowLabel?.textContent).toContain("channels.connectMany.stepCoexist")

    await click(
      rowLabel?.querySelector<HTMLElement>("span:first-child") ?? undefined,
    )
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("true")
  })

  test("a row's coexist switch is keyboard-focusable and toggles with Enter and Space", async () => {
    render()

    const [, first] = checkboxes()
    await click(first)

    const rowSwitch = switches()[0]
    expect(rowSwitch?.getAttribute("tabindex")).not.toBe("-1")
    act(() => {
      rowSwitch?.focus()
    })
    expect(document.activeElement).toBe(rowSwitch)

    // Base UI's non-native `useButton` (Switch renders a `<span
    // role="switch">`, not a real `<button>`) converts an Enter keydown
    // directly into a click.
    await act(async () => {
      rowSwitch?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      )
      await Promise.resolve()
    })
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("true")

    // ...and a Space keyup does the same, toggling it back off.
    await act(async () => {
      rowSwitch?.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      )
      await Promise.resolve()
    })
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("false")
  })

  test("a row that cannot be selected carries no coexist switch at all", () => {
    const items: ConnectPickerItem[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B", disabled: true, disabledReason: "already" },
      { id: "c", name: "C" },
    ]
    act(() => {
      root.render(
        <ConnectSelectionForm
          coexist={coexist}
          idsFieldName="pageIds"
          items={items}
          onSubmit={vi.fn()}
        />,
      )
    })

    // Two switches for the two selectable rows, none for the disabled one —
    // not a disabled switch, nothing.
    expect(switches()).toHaveLength(2)
    const labels = switches().map((element) =>
      element.getAttribute("aria-label"),
    )
    expect(labels).toEqual([
      "channels.connectMany.stepCoexist — A",
      "channels.connectMany.stepCoexist — C",
    ])
  })

  test("select-all skips the disabled row and adds nothing to the coexist selection", async () => {
    const items: ConnectPickerItem[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B", disabled: true },
    ]
    const onSubmit = vi.fn()
    act(() => {
      root.render(
        <ConnectSelectionForm
          coexist={coexist}
          idsFieldName="pageIds"
          items={items}
          onSubmit={onSubmit}
        />,
      )
    })

    await click(selectAllCheckbox())

    expect(switches()).toHaveLength(1)
    expect(switches()[0]?.getAttribute("aria-checked")).toBe("false")

    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      pageIds: ["a"],
      coexistIds: [],
      aiReadsSyncedHistoryIds: [],
    })
  })

  test("a row's AI switch only appears while that row is syncing, and its name identifies the row", async () => {
    render()

    const [, first] = checkboxes()
    await click(first)
    // Three rows, three sync switches, no AI switch yet.
    expect(switches()).toHaveLength(3)

    await click(switches()[0])

    expect(switches()).toHaveLength(4)
    expect(switches()[1]?.getAttribute("aria-label")).toBe(
      "coexist.aiReadsSyncedHistoryLabel — Item 0",
    )
    // The helper copy rides along as a tooltip rather than a second line.
    expect(switches()[1]?.closest("label")?.getAttribute("title")).toBe(
      "coexist.aiReadsSyncedHistoryHelper",
    )

    // Turning sync back off hides it again.
    await click(switches()[0])
    expect(switches()).toHaveLength(3)
  })

  test("turning a row's sync off drops its AI opt-in, so turning sync back on starts from OFF", async () => {
    const onSubmit = render()

    const [, first] = checkboxes()
    await click(first)
    await click(switches()[0])
    await click(switches()[1])
    expect(switches()[1]?.getAttribute("aria-checked")).toBe("true")

    // Sync off → AI opt-in dropped; sync on again → fresh OFF switch.
    await click(switches()[0])
    await click(switches()[0])
    expect(switches()[1]?.getAttribute("aria-checked")).toBe("false")

    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      pageIds: ["id-0"],
      coexistIds: ["id-0"],
      aiReadsSyncedHistoryIds: [],
    })
  })

  test("unchecking a row drops both of its opt-ins", async () => {
    const onSubmit = render()

    const [, first, second] = checkboxes()
    await click(first)
    await click(second)
    await click(switches()[0])
    await click(switches()[1])

    // Uncheck the row that had both switches on.
    await click(first)
    await click(second)
    await click(second)

    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      pageIds: ["id-1"],
      coexistIds: [],
      aiReadsSyncedHistoryIds: [],
    })
  })

  test("the panel carries the channel copy and no global switch of its own", async () => {
    render()

    const [, first] = checkboxes()
    await click(first)
    await click(switches()[0])

    expect(container.textContent).toContain("coexist.descriptionMessenger")
    expect(container.textContent).toContain("coexist.billingNote")
    // One sync + one AI switch for the syncing row, two sync switches for the
    // others — nothing global.
    expect(switches()).toHaveLength(4)
  })

  test("submit carries the picked ids, the coexist ids and the per-row AI ids", async () => {
    const onSubmit = render()

    const [, first, second] = checkboxes()
    await click(first)
    await click(second)
    // Row 2's sync switch, then the AI switch it reveals directly under it.
    await click(switches()[1])
    await click(switches()[2])

    await act(async () => {
      continueButton()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      pageIds: ["id-0", "id-1"],
      coexistIds: ["id-1"],
      aiReadsSyncedHistoryIds: ["id-1"],
    })
  })
})
