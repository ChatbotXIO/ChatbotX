import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Step } from "@/features/sequences/hooks/use-sequence-step"
import { useSequenceStep } from "@/features/sequences/hooks/use-sequence-step"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

const upsertSequenceStepAction = vi.hoisted(() => vi.fn())
vi.mock("@/features/sequences/actions/upsert-sequence-step.action", () => ({
  upsertSequenceStepAction,
}))

const deleteSequenceStepAction = vi.hoisted(() => vi.fn())
vi.mock("@/features/sequences/actions/delete-sequence-step.action", () => ({
  deleteSequenceStepAction,
}))

type HookApi = ReturnType<typeof useSequenceStep>
type HookProps = Parameters<typeof useSequenceStep>[0]

const holder: { current: HookApi | null } = { current: null }
let container: HTMLDivElement | null = null
let root: Root | null = null

/** Reads the hook's latest return value, failing fast if the probe has not
 * mounted yet — avoids non-null assertions at every call site. */
function getApi(): HookApi {
  if (!holder.current) {
    throw new Error("useSequenceStep probe has not rendered yet")
  }
  return holder.current
}

function Probe({ props }: { props: HookProps }) {
  const api = useSequenceStep(props)
  useEffect(() => {
    holder.current = api
  })
  return null
}

function renderHook(props: HookProps) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<Probe props={props} />)
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
  toast.error.mockClear()
  toast.success.mockClear()
  refresh.mockClear()
  upsertSequenceStepAction.mockReset()
  deleteSequenceStepAction.mockReset()
})

const BASE_STEP: Step = {
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
}

const BASE_PROPS: HookProps = {
  step: BASE_STEP,
  stepNumber: 1,
  sequenceId: "seq-1",
  workspaceId: "ws-1",
}

describe("useSequenceStep", () => {
  test("queues saves FIFO: second call is not invoked until the first resolves; isSaving stays true until drained; router.refresh runs once", async () => {
    let resolveFirst!: (value: unknown) => void
    const firstDeferred = new Promise((resolve) => {
      resolveFirst = resolve
    })
    upsertSequenceStepAction
      .mockImplementationOnce(() => firstDeferred)
      .mockImplementationOnce(() =>
        Promise.resolve({ data: { stepId: "step-1" } }),
      )

    renderHook(BASE_PROPS)

    let p1: Promise<boolean> = Promise.resolve(false)
    let p2: Promise<boolean> = Promise.resolve(false)
    act(() => {
      p1 = getApi().handleSave({ isActive: true })
      p2 = getApi().handleSave({ isActive: false })
    })

    expect(getApi().isSaving).toBe(true)

    // Flush the microtask that starts the first queued save. The second
    // save must not have been dispatched yet — this is the FIFO guarantee.
    await act(async () => {
      await Promise.resolve()
    })
    expect(upsertSequenceStepAction).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => {
      resolveFirst({ data: { stepId: "step-1" } })
      await Promise.all([p1, p2])
    })

    expect(upsertSequenceStepAction).toHaveBeenCalledTimes(2)
    expect(getApi().isSaving).toBe(false)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("resolves false and toasts once when the action returns no data", async () => {
    upsertSequenceStepAction.mockResolvedValueOnce({ data: undefined })
    renderHook(BASE_PROPS)

    let result: boolean | undefined
    await act(async () => {
      result = await getApi().handleSave({ isActive: true })
    })

    expect(result).toBe(false)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith("messages.unknownError")
  })

  test("resolves false and toasts once (no unhandled rejection) when the action rejects", async () => {
    upsertSequenceStepAction.mockRejectedValueOnce(new Error("boom"))
    renderHook(BASE_PROPS)

    let result: boolean | undefined
    await act(async () => {
      result = await getApi().handleSave({ isActive: true })
    })

    expect(result).toBe(false)
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  test("delay hours/2 payload maps to delayDays:0, delayMinutes:120, delayUnit:hours, specificDateTime:null", async () => {
    upsertSequenceStepAction.mockResolvedValueOnce({
      data: { stepId: "step-1" },
    })
    renderHook(BASE_PROPS)

    await act(async () => {
      await getApi().handleSave({ delay: { unit: "hours", value: 2 } })
    })

    expect(upsertSequenceStepAction).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        delayDays: 0,
        delayMinutes: 120,
        delayUnit: "hours",
        specificDateTime: null,
      }),
    )
  })

  test("a specificTime delay in the past resolves false, toasts once, and never calls the action", async () => {
    renderHook(BASE_PROPS)

    const past = "2020-01-01T00:00"
    let result: boolean | undefined
    await act(async () => {
      result = await getApi().handleSave({
        delay: { unit: "specificTime", value: 1, specificDateTime: past },
      })
    })

    expect(result).toBe(false)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(upsertSequenceStepAction).not.toHaveBeenCalled()
  })

  test("F1: a step with no id threads the id returned by the first queued create into the second queued save", async () => {
    upsertSequenceStepAction
      .mockResolvedValueOnce({ data: { stepId: "new-step-1" } })
      .mockResolvedValueOnce({ data: { stepId: "new-step-1" } })

    renderHook({ ...BASE_PROPS, step: undefined })

    let p1: Promise<boolean> = Promise.resolve(false)
    let p2: Promise<boolean> = Promise.resolve(false)
    act(() => {
      p1 = getApi().handleSave({ isActive: true })
      p2 = getApi().handleSave({ isActive: false })
    })

    await act(async () => {
      await Promise.all([p1, p2])
    })

    expect(upsertSequenceStepAction).toHaveBeenNthCalledWith(
      1,
      "ws-1",
      expect.objectContaining({ stepId: undefined }),
    )
    expect(upsertSequenceStepAction).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      expect.objectContaining({ stepId: "new-step-1" }),
    )
  })
})
