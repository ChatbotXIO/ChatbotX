// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const calls: string[] = []
const updatePipelineAction = vi.fn()
const setMemberAction = vi.fn()
const removeMemberAction = vi.fn()
const invalidate = vi.fn()
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("sonner", () => ({ toast }))
vi.mock("../../../actions/pipeline.action", () => ({
  updatePipelineAction: (...args: unknown[]) => updatePipelineAction(...args),
}))
vi.mock("../../../actions/field-member.action", () => ({
  setMemberAction: (...args: unknown[]) => setMemberAction(...args),
  removeMemberAction: (...args: unknown[]) => removeMemberAction(...args),
}))
vi.mock("../../../lib/use-invalidate-pipelines", () => ({
  useInvalidatePipelines: () => invalidate,
}))

import { NO_PERMISSIONS } from "../settings-draft"
import { useSaveSettings } from "../use-save-settings"

type SaveHook = ReturnType<typeof useSaveSettings>

const view = { ...NO_PERMISSIONS, canView: true }
const input = {
  pipelineId: "9",
  pipelineUpdate: { settings: { assignContactOnAssign: true } },
  permissionChanges: [
    { kind: "set" as const, workspaceMemberId: "1", flags: view },
    { kind: "remove" as const, workspaceMemberId: "2" },
    { kind: "set" as const, workspaceMemberId: "3", flags: view },
  ],
}

const resolveAfter = (name: string, result: unknown) => async () => {
  calls.push(`start:${name}`)
  await Promise.resolve()
  calls.push(`end:${name}`)
  return result
}

describe("useSaveSettings", () => {
  let container: HTMLDivElement
  let root: Root
  let hook: SaveHook

  function Probe() {
    hook = useSaveSettings("7")
    return null
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    calls.length = 0
    for (const mock of [
      updatePipelineAction,
      setMemberAction,
      removeMemberAction,
      invalidate,
      toast.success,
      toast.error,
    ]) {
      mock.mockReset()
    }
    container = document.createElement("div")
    root = createRoot(container)
    act(() => root.render(<Probe />))
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  test("writes one at a time, then refetches once and toasts once", async () => {
    updatePipelineAction.mockImplementation(
      resolveAfter("update", { data: {} }),
    )
    setMemberAction.mockImplementation((_ws: string, { workspaceMemberId }) =>
      resolveAfter(`set${workspaceMemberId}`, { data: {} })(),
    )
    removeMemberAction.mockImplementation(resolveAfter("remove", { data: {} }))

    let ok = false
    await act(async () => {
      ok = await hook.save(input)
    })

    expect(ok).toBe(true)
    expect(calls).toEqual([
      "start:update",
      "end:update",
      "start:set1",
      "end:set1",
      "start:remove",
      "end:remove",
      "start:set3",
      "end:set3",
    ])
    expect(setMemberAction).toHaveBeenCalledWith("7", {
      id: "9",
      workspaceMemberId: "1",
      ...view,
    })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith("settings.saved")
    expect(toast.error).not.toHaveBeenCalled()
    expect(hook.isSaving).toBe(false)
  })

  test("stops at the first failure and reports it once", async () => {
    updatePipelineAction.mockResolvedValue({ data: {} })
    setMemberAction.mockResolvedValueOnce({ serverError: "Member not found" })
    removeMemberAction.mockResolvedValue({ data: {} })

    let ok = true
    await act(async () => {
      ok = await hook.save(input)
    })

    expect(ok).toBe(false)
    expect(removeMemberAction).not.toHaveBeenCalled()
    expect(setMemberAction).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Member not found")
    expect(toast.success).not.toHaveBeenCalled()
    // The pipeline update did land, so the screen still refetches.
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["a rejected input", { validationErrors: { id: ["bad"] } }],
    ["no result", undefined],
  ])("treats %s as a failure with the generic message", async (_, result) => {
    updatePipelineAction.mockResolvedValue(result)

    await act(async () => {
      await hook.save({ ...input, permissionChanges: [] })
    })

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("saveFailed")
  })

  test("a dropped connection is reported, not thrown", async () => {
    updatePipelineAction.mockRejectedValue(new Error("fetch failed"))

    let ok = true
    await act(async () => {
      ok = await hook.save(input)
    })

    expect(ok).toBe(false)
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("saveFailed")
    expect(hook.isSaving).toBe(false)
  })
})
