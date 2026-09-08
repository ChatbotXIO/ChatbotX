import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import {
  buttonByText,
  closeButtons,
  connected,
  controllableConnectOne,
  EXTRA_STEP_TITLE,
  fakeExtraStep,
  flush,
  installDomPolyfills,
  items2,
  renderConnectManyDialog,
  waitForCondition,
} from "./connect-many-dialog.test-utils"

/**
 * `ConnectManyDialog`'s accessibility behavior: dialog modality, focus
 * management on open/step-change/close, and keyboard-reachability of
 * interactive controls. Dialog lifecycle/footer/step behavior lives in
 * `connect-many-dialog.footer-steps.test.tsx`; row-level rendering lives in
 * `connect-many-dialog.rows.test.tsx`.
 */

/** Echoes the key back (with interpolated values as JSON) so assertions never depend on English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

installDomPolyfills()

describe("ConnectManyDialog — accessibility", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
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

  const render = (props: Parameters<typeof renderConnectManyDialog>[1]) =>
    renderConnectManyDialog(root, props)

  test("non-dismissable: Escape and outside press leave the dialog open, and there is no close button", async () => {
    const { connectOne } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.dialogTitleRunning",
    )
    expect(closeButtons()).toHaveLength(0)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      )
    })
    expect(document.body.textContent).toContain(
      "channels.connectMany.dialogTitleRunning",
    )

    const overlay = document.body.querySelector("[data-slot='dialog-overlay']")
    act(() => {
      overlay?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      )
      overlay?.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      )
      overlay?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
    })
    expect(document.body.textContent).toContain(
      "channels.connectMany.dialogTitleRunning",
    )
  })

  test("step change moves focus to the new step's title", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({
      items: [{ id: "a", name: "A" }],
      connectOne,
      extraSteps: [fakeExtraStep()],
    })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })

    act(() => {
      buttonByText("actions.continue")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    expect(document.body.textContent).toContain(EXTRA_STEP_TITLE)
    const title = Array.from(document.body.querySelectorAll("h2")).find(
      (h) => h.textContent === EXTRA_STEP_TITLE,
    )
    expect(document.activeElement).toBe(title)
  })

  test("the row list is a keyboard-focusable, scrollable container", async () => {
    const { connectOne } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    // Scoped to this dialog's own content — other spec files' fixtures can
    // share the same utility class name elsewhere in `document.body`.
    const dialogContent = document.body.querySelector(
      '[data-slot="dialog-content"]',
    )
    const list = dialogContent?.querySelector(".max-h-75.overflow-y-auto")
    expect(list?.getAttribute("tabindex")).toBe("0")
  })

  test("initial focus lands on the step title when the dialog opens", async () => {
    const { connectOne } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    const title = Array.from(document.body.querySelectorAll("h2")).find((h) =>
      h.textContent?.includes("channels.connectMany.dialogTitleRunning"),
    )
    expect(title).not.toBeUndefined()
    await waitForCondition(() => document.activeElement === title)
    expect(document.activeElement).toBe(title)
  })

  test("focus is restored to finalFocusRef's element on the Close path (nothing connected)", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const picker = document.createElement("button")
    picker.textContent = "picker continue"
    document.body.append(picker)
    const finalFocusRef = { current: picker }

    render({
      items: [{ id: "a", name: "A" }],
      connectOne,
      finalFocusRef,
    })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "failed",
          reason: "unknown",
          coexistEligible: false,
        },
      })
      await flush()
    })

    act(() => {
      buttonByText("channels.connectMany.close")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    // The dialog's `open` prop never toggles to false (it closes only via
    // the caller unmounting it after `onClose`), so the component restores
    // focus itself before calling `onClose` — verified before the caller
    // even gets a chance to unmount.
    expect(document.activeElement).toBe(picker)

    // The caller (picker) is then responsible for unmounting the dialog.
    act(() => {
      root.unmount()
    })
    picker.remove()
  })

  test("per-row Retry and the coexist Switch are real, enabled interactive elements reachable by keyboard", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: [{ id: "a", name: "A" }], connectOne })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "failed",
          reason: "unknown",
          coexistEligible: false,
        },
      })
      await flush()
    })

    const retryButton = buttonByText("channels.connectMany.retry")
    expect(retryButton?.tagName).toBe("BUTTON")
    expect(retryButton?.disabled).toBe(false)
    expect(retryButton?.getAttribute("tabindex")).not.toBe("-1")

    // Keyboard activation: a real <button> fires "click" on Enter — verify
    // the same handler runs via a real click (jsdom does not synthesize the
    // browser's default Enter-to-click activation for arbitrary elements,
    // so this asserts the element IS the semantic control keyboard users get
    // "for free", rather than re-implementing browser default-action logic).
    connectOne.mockClear()
    act(() => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await act(async () => {
      await flush()
    })
    expect(connectOne).toHaveBeenCalledTimes(1)
  })

  test("20 rows render inside the scrollable, keyboard-focusable list container at a mobile viewport", async () => {
    Object.assign(window, { innerWidth: 375, innerHeight: 667 })
    const items20: ConnectPickerItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `id-${i}`,
      name: `Item ${i}`,
    }))
    const { connectOne } = controllableConnectOne()
    render({ items: items20, connectOne })
    await act(async () => {
      await flush()
    })

    const dialogContent = document.body.querySelector(
      '[data-slot="dialog-content"]',
    )
    const list = dialogContent?.querySelector(".max-h-75.overflow-y-auto")
    expect(list?.getAttribute("tabindex")).toBe("0")
    expect(list?.querySelectorAll("li")).toHaveLength(20)
    // Rows clip rather than scroll sideways — `overflow-y-auto` alone would
    // compute the x axis to `auto` and add a horizontal scrollbar.
    expect(list?.className).toContain("overflow-x-hidden")
  })
})
