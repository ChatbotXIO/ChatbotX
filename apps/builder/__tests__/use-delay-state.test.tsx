import { act, useEffect, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { useDelayState } from "@/features/sequences/hooks/use-delay-state"
import type { Step } from "@/features/sequences/hooks/use-sequence-step"
import { stepToDelayView } from "@/features/sequences/lib/delay"

type HookApi = ReturnType<typeof useDelayState>
type OnSave = Parameters<typeof useDelayState>[1]

type ViewSnapshot = {
  unit: HookApi["delayUnit"]
  value: HookApi["delayValue"]
  specificDateTime: HookApi["specificDateTime"]
}

const holder: { current: HookApi | null } = { current: null }
const historyRef: { current: ViewSnapshot[] } = { current: [] }
let container: HTMLDivElement | null = null
let root: Root | null = null

/** Reads the hook's latest return value, failing fast if the probe has not
 * mounted yet — avoids non-null assertions at every call site. */
function getApi(): HookApi {
  if (!holder.current) {
    throw new Error("useDelayState probe has not rendered yet")
  }
  return holder.current
}

function Probe({ step, onSave }: { step: Step | undefined; onSave: OnSave }) {
  const api = useDelayState(step, onSave)
  const history = useRef(historyRef.current)

  useEffect(() => {
    holder.current = api
  })

  // Only fires when the derived view's primitive fields actually change —
  // used to detect whether a rerender clobbered/updated the view.
  useEffect(() => {
    history.current.push({
      unit: api.delayUnit,
      value: api.delayValue,
      specificDateTime: api.specificDateTime,
    })
  }, [api.delayUnit, api.delayValue, api.specificDateTime])

  return null
}

function renderProbe(step: Step | undefined, onSave: OnSave) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<Probe onSave={onSave} step={step} />)
  })
}

function rerenderProbe(step: Step | undefined, onSave: OnSave) {
  act(() => {
    root?.render(<Probe onSave={onSave} step={step} />)
  })
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  holder.current = null
  historyRef.current = []
})

function makeStep(overrides: Partial<Step>): Step {
  return {
    id: "step-1",
    order: 0,
    delayDays: 0,
    delayMinutes: 120,
    delayUnit: "hours",
    specificDateTime: null,
    flowId: "flow-1",
    flow: { id: "flow-1", name: "Flow" },
    isActive: true,
    anytime: true,
    sendTimeStart: null,
    sendTimeEnd: null,
    sendDays: null,
    ...overrides,
  }
}

describe("useDelayState", () => {
  test("initial view is derived from stepToDelayView(step)", () => {
    const step = makeStep({
      delayDays: 0,
      delayMinutes: 120,
      delayUnit: "hours",
    })
    const onSave = vi.fn(() => Promise.resolve(true))

    renderProbe(step, onSave)

    const expected = stepToDelayView(step)
    expect(getApi().delayUnit).toBe(expected.unit)
    expect(getApi().delayValue).toBe(expected.value)
    expect(getApi().specificDateTime).toBe(expected.specificDateTime)
  })

  test("handleDelayUnitChange saves the exact payload the hook builds and updates the view optimistically", async () => {
    const step = makeStep({
      delayDays: 0,
      delayMinutes: 120,
      delayUnit: "hours",
    })
    let resolveSave!: (value: boolean) => void
    const deferred = new Promise<boolean>((resolve) => {
      resolveSave = resolve
    })
    const onSave = vi.fn(() => deferred)

    renderProbe(step, onSave)

    act(() => {
      getApi().handleDelayUnitChange("minutes")
    })

    // Optimistic update happens synchronously, before onSave resolves.
    expect(getApi().delayUnit).toBe("minutes")
    expect(getApi().delayValue).toBe(2)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      delay: { unit: "minutes", value: 2, specificDateTime: undefined },
    })

    await act(async () => {
      resolveSave(true)
      await deferred
    })
  })

  test("view reverts to the last persisted view when onSave resolves false", async () => {
    const step = makeStep({
      delayDays: 0,
      delayMinutes: 120,
      delayUnit: "hours",
    })
    let resolveSave!: (value: boolean) => void
    const deferred = new Promise<boolean>((resolve) => {
      resolveSave = resolve
    })
    const onSave = vi.fn(() => deferred)

    renderProbe(step, onSave)

    act(() => {
      getApi().handleDelayUnitChange("minutes")
    })
    expect(getApi().delayUnit).toBe("minutes")

    await act(async () => {
      resolveSave(false)
      await deferred.catch(() => undefined)
    })

    expect(getApi().delayUnit).toBe("hours")
    expect(getApi().delayValue).toBe(2)
  })

  test("rerender with a step whose stored delay differs re-derives the view; rerender with identical fields leaves it unchanged", async () => {
    const step = makeStep({
      delayDays: 0,
      delayMinutes: 120,
      delayUnit: "hours",
    })
    const onSave = vi.fn(() => Promise.resolve(true))

    renderProbe(step, onSave)
    await act(async () => {
      await Promise.resolve()
    })

    const historyAfterMount = historyRef.current.length
    expect(historyAfterMount).toBeGreaterThan(0)

    // Different stored delay -> view must re-derive.
    const changedStep = makeStep({
      delayDays: 0,
      delayMinutes: 30,
      delayUnit: "minutes",
    })
    rerenderProbe(changedStep, onSave)
    await act(async () => {
      await Promise.resolve()
    })

    expect(getApi().delayUnit).toBe("minutes")
    expect(getApi().delayValue).toBe(30)
    const historyAfterChange = historyRef.current.length
    expect(historyAfterChange).toBeGreaterThan(historyAfterMount)

    // Identical stored fields (new object, same primitive values) -> no clobber.
    const sameStep = makeStep({
      delayDays: 0,
      delayMinutes: 30,
      delayUnit: "minutes",
    })
    rerenderProbe(sameStep, onSave)
    await act(async () => {
      await Promise.resolve()
    })

    expect(getApi().delayUnit).toBe("minutes")
    expect(getApi().delayValue).toBe(30)
    expect(historyRef.current.length).toBe(historyAfterChange)
  })

  test("handleSpecificDateTimeChange('') does not call onSave", () => {
    const step = makeStep({
      delayDays: 0,
      delayMinutes: 0,
      delayUnit: "specificTime",
      specificDateTime: new Date(2026, 5, 15, 9, 30),
    })
    const onSave = vi.fn(() => Promise.resolve(true))

    renderProbe(step, onSave)

    act(() => {
      getApi().handleSpecificDateTimeChange("")
    })

    expect(onSave).not.toHaveBeenCalled()
    expect(getApi().specificDateTime).toBe("")
  })
})
