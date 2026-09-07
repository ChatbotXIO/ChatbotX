import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import {
  buttonByText,
  connected,
  controllableConnectOne,
  EXTRA_STEP_TITLE,
  fakeExtraStep,
  flush,
  installDomPolyfills,
  items2,
  itemsOverConcurrency,
  renderConnectManyDialog,
} from "./connect-many-dialog.test-utils"

/**
 * `ConnectManyDialog`'s dialog lifecycle: title/progress, footer button sets
 * (Cancel remaining / Retry failed / Close / Continue), the stepper over the
 * connecting step plus any channel-supplied extra step, and session-error
 * handling. Row-level rendering lives in
 * `connect-many-dialog.rows.test.tsx`; focus and keyboard-accessibility
 * behavior lives in `connect-many-dialog.a11y.test.tsx`.
 */

/** Echoes the key back (with interpolated values as JSON) so assertions never depend on English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

installDomPolyfills()

describe("ConnectManyDialog — footer and steps", () => {
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

  test("Cancel remaining is shown only while a row is still queued (never as a disabled button)", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    // One row more than CONNECT_CONCURRENCY, so one is queued to begin with.
    render({ items: itemsOverConcurrency, connectOne })
    await act(async () => {
      await flush()
    })

    // "a"/"b"/"c" are in flight, "d" is queued behind them.
    const cancel = buttonByText("channels.connectMany.cancelRemaining")
    expect(cancel).toBeDefined()
    expect(cancel?.disabled).toBe(false)

    await act(async () => {
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })

    // "d" started as soon as a slot freed — every remaining row is in
    // flight, so there is nothing left to cancel and the button is gone.
    expect(buttonByText("channels.connectMany.cancelRemaining")).toBeUndefined()
  })

  test("a batch no larger than the concurrency never shows Cancel remaining", async () => {
    const { connectOne } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    expect(buttonByText("channels.connectMany.cancelRemaining")).toBeUndefined()
  })

  test("title, progress counter, and aria-live region update as rows settle", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    expect(document.body.textContent).toContain(
      'channels.connectMany.progress:{"done":0,"total":2}',
    )
    const live = document.body.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toContain(
      'channels.connectMany.progressAnnouncement:{"done":0,"total":2}',
    )

    await act(async () => {
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
      controllers.get("b")?.resolve(connected({ sourceId: "b", name: "B" }))
      await flush()
    })

    expect(document.body.textContent).toContain(
      'channels.connectMany.dialogTitleDone:{"connected":2,"total":2}',
    )
  })

  test("finished with nothing connected shows Retry failed + Close, no Continue", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const onClose = vi.fn()
    render({ items: [{ id: "a", name: "A" }], connectOne, onClose })
    await act(async () => {
      await flush()
    })

    await act(async () => {
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

    expect(buttonByText("channels.connectMany.retryFailed")).not.toBeUndefined()
    expect(buttonByText("channels.connectMany.close")).not.toBeUndefined()
    expect(buttonByText("actions.continue")).toBeUndefined()
    expect(buttonByText("channels.connectMany.goToChannels")).toBeUndefined()

    act(() => {
      buttonByText("channels.connectMany.close")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test("finished with some failures shows Retry failed and Continue; retrying failed rows re-runs only them", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    await act(async () => {
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
      controllers.get("b")?.resolve(connected({ sourceId: "b", name: "B" }))
      await flush()
    })

    expect(
      buttonByText("channels.connectMany.retryFailed:"),
    ).not.toBeUndefined()
    // Neither remaining row is coexist-eligible, so this is the last step.
    expect(
      buttonByText("channels.connectMany.goToChannels"),
    ).not.toBeUndefined()

    connectOne.mockClear()
    act(() => {
      buttonByText("channels.connectMany.retryFailed:")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    await act(async () => {
      await flush()
    })

    expect(connectOne).toHaveBeenCalledTimes(1)
    expect(connectOne).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    )
  })

  test("finished with no failures shows Continue only", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: items2, connectOne, channel: "whatsapp" })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
      controllers.get("b")?.resolve(connected({ sourceId: "b", name: "B" }))
      await flush()
    })

    expect(buttonByText("channels.connectMany.retryFailed:")).toBeUndefined()
    expect(buttonByText("channels.connectMany.close")).toBeUndefined()
    // Nothing coexist-eligible → this is the last step → "goToChannels" label.
    expect(
      buttonByText("channels.connectMany.goToChannels"),
    ).not.toBeUndefined()
  })

  test("Continue label is actions.continue when an extra step follows, goToChannels when it is the last step", async () => {
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

    expect(buttonByText("actions.continue")).not.toBeUndefined()
    expect(buttonByText("channels.connectMany.goToChannels")).toBeUndefined()
  })

  test("a connected, coexist-eligible row no longer opens a coexist step — coexist runs per row during connecting", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const onFinished = vi.fn()
    render({ items: [{ id: "a", name: "A" }], connectOne, onFinished })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(
        connected({
          sourceId: "a",
          name: "A",
          coexistEligible: true,
          integrationId: "int-1",
        }),
      )
      await flush()
    })

    expect(document.body.textContent).not.toContain("coexist.title")
    expect(
      document.body.querySelector('[data-slot="connect-dialog-stepper"]'),
    ).toBeNull()
    expect(
      buttonByText("channels.connectMany.goToChannels"),
    ).not.toBeUndefined()

    act(() => {
      buttonByText("channels.connectMany.goToChannels")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("a session error stops the batch: remaining rows cancel, footer shows Close + Continue when something connected", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const items3: ConnectPickerItem[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]
    render({ items: items3, connectOne, channel: "whatsapp" })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })
    await act(async () => {
      controllers
        .get("b")
        ?.resolve({ kind: "sessionError", code: "sessionExpired" })
      await flush()
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.sessionError.sessionExpired",
    )
    expect(buttonByText("channels.connectMany.close")).not.toBeUndefined()
    expect(
      buttonByText("channels.connectMany.goToChannels"),
    ).not.toBeUndefined()
  })

  test("Progress carries the motion-reduce class and the connecting spinner carries motion-safe:animate-spin", async () => {
    const { connectOne } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    const progress = document.body.querySelector('[data-slot="progress"]')
    expect(progress?.className).toContain(
      "motion-reduce:[&_[data-slot=progress-indicator]]:transition-none",
    )

    const spinnerIcon = Array.from(document.body.querySelectorAll("svg")).find(
      (svg) => svg.getAttribute("class")?.includes("motion-safe:animate-spin"),
    )
    expect(spinnerIcon).not.toBeUndefined()
  })

  test("a session error with zero connected rows shows Retry failed + Close, no Continue", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: [{ id: "a", name: "A" }], connectOne, channel: "whatsapp" })
    await act(async () => {
      await flush()
      controllers
        .get("a")
        ?.resolve({ kind: "sessionError", code: "sessionExpired" })
      await flush()
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.sessionError.sessionExpired",
    )
    expect(
      buttonByText("channels.connectMany.retryFailed:"),
    ).not.toBeUndefined()
    expect(buttonByText("channels.connectMany.close")).not.toBeUndefined()
    expect(buttonByText("actions.continue")).toBeUndefined()
    expect(buttonByText("channels.connectMany.goToChannels")).toBeUndefined()
  })

  test("the SESSION_ERRORS_SKIPPING_EXTRA_STEPS bypass: a notMember error finishes from Continue instead of entering an extra step", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const onFinished = vi.fn()
    render({
      items: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      connectOne,
      extraSteps: [fakeExtraStep()],
      onFinished,
    })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })
    await act(async () => {
      controllers.get("b")?.resolve({ kind: "sessionError", code: "notMember" })
      await flush()
    })

    // An extra step IS applicable, but notMember must still skip it — its
    // routes sit behind the same workspace authorization the batch just lost.
    expect(
      buttonByText("channels.connectMany.goToChannels"),
    ).not.toBeUndefined()
    expect(buttonByText("actions.continue")).toBeUndefined()

    act(() => {
      buttonByText("channels.connectMany.goToChannels")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain(EXTRA_STEP_TITLE)
  })

  test("a session error outside that set still leads into a following extra step", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const onFinished = vi.fn()
    render({
      items: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      connectOne,
      extraSteps: [fakeExtraStep()],
      onFinished,
    })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })
    await act(async () => {
      controllers
        .get("b")
        ?.resolve({ kind: "sessionError", code: "sessionExpired" })
      await flush()
    })

    act(() => {
      buttonByText("actions.continue")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    expect(document.body.textContent).toContain(EXTRA_STEP_TITLE)
    expect(onFinished).not.toHaveBeenCalled()
  })

  test("the stepper renders the applicable steps with the current one highlighted", async () => {
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

    const stepper = document.body.querySelector(
      '[data-slot="connect-dialog-stepper"]',
    )
    expect(stepper).not.toBeNull()
    // The stepper's aria-label is a translated key, not a hard-coded string.
    expect(stepper?.getAttribute("aria-label")).toBe(
      "channels.connectMany.progressLabel",
    )
    const items = Array.from(stepper?.querySelectorAll("li") ?? [])
    expect(items.map((li) => li.textContent)).toEqual([
      "channels.connectMany.stepConnecting",
      "extra.step.label",
    ])
    expect(items[0]?.getAttribute("aria-current")).toBe("step")
    expect(items[1]?.getAttribute("aria-current")).toBeNull()

    act(() => {
      buttonByText("actions.continue")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    const stepperAfter = document.body.querySelector(
      '[data-slot="connect-dialog-stepper"]',
    )
    const itemsAfter = Array.from(stepperAfter?.querySelectorAll("li") ?? [])
    expect(itemsAfter[0]?.getAttribute("aria-current")).toBeNull()
    expect(itemsAfter[1]?.getAttribute("aria-current")).toBe("step")
  })

  test("the stepper is omitted entirely when there is only one step", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: [{ id: "a", name: "A" }], connectOne, channel: "whatsapp" })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })

    expect(
      document.body.querySelector('[data-slot="connect-dialog-stepper"]'),
    ).toBeNull()
  })

  test("Go to channels spends itself on the first click — a second click cannot redirect twice", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const onFinished = vi.fn()
    render({ items: [{ id: "a", name: "A" }], connectOne, onFinished })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })

    const goToChannels = buttonByText("channels.connectMany.goToChannels")
    expect(goToChannels?.disabled).toBe(false)

    act(() => {
      goToChannels?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(buttonByText("channels.connectMany.goToChannels")?.disabled).toBe(
      true,
    )

    // Even a click that lands before the re-render is a no-op.
    act(() => {
      goToChannels?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      goToChannels?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  test("Close spends itself the same way", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const onClose = vi.fn()
    render({ items: [{ id: "a", name: "A" }], connectOne, onClose })
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

    const closeButton = buttonByText("channels.connectMany.close")
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(buttonByText("channels.connectMany.close")?.disabled).toBe(true)
  })

  test("Continue into an extra step does not spend the dialog — only leaving does", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    const onFinished = vi.fn()
    render({
      items: [{ id: "a", name: "A" }],
      connectOne,
      extraSteps: [fakeExtraStep()],
      onFinished,
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
    expect(onFinished).not.toHaveBeenCalled()

    // The extra step's own Done still finishes — once.
    const done = buttonByText("extra.step.done")
    act(() => {
      done?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      done?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(onFinished).toHaveBeenCalledTimes(1)
  })
})
