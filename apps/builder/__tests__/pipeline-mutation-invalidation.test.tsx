import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const invalidateQueries = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const invalidateInboxes = vi.hoisted(() => vi.fn())
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInvalidateInboxes: () => invalidateInboxes,
}))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: { pipelinesAPI: { key: () => ["pipelines"] } },
}))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }))
const toastError = vi.hoisted(() => vi.fn())
vi.mock("@/lib/errors/safe-action-error-handler", () => ({
  toastActionError: (fallback: string) => () => toastError(fallback),
}))

import { usePipelineAction } from "@/features/pipelines/lib/use-pipeline-action"

const FEATURE_DIR = join(import.meta.dirname, "../src/features/pipelines")

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return sourceFiles(path)
    }
    return SOURCE_FILE.test(name) ? [path] : []
  })

/** The balanced `open … close` block starting at `from`, or "" if none. */
const balancedBlock = (
  source: string,
  from: number,
  open: string,
  close: string,
): string => {
  const start = source.indexOf(open, from)
  if (start === -1) {
    return ""
  }
  let depth = 0
  for (let end = start; end < source.length; end += 1) {
    if (source[end] === open) {
      depth += 1
    } else if (source[end] === close) {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, end + 1)
      }
    }
  }
  return ""
}

const INVALIDATES = /usePipelineAction\(|\binvalidate\(\)/
const SOURCE_FILE = /\.tsx?$/
const TRAILING_OPTIONS_ARG = /,\s*([A-Za-z_$][\w$]*)\s*,?\s*\)$/

/**
 * Whether a `useAction(…)` call's callbacks invalidate: inline, or through an
 * options object declared in the same file and passed by name.
 */
const callInvalidates = (source: string, call: string): boolean => {
  if (INVALIDATES.test(call)) {
    return true
  }
  const optionsName = TRAILING_OPTIONS_ARG.exec(call)?.[1]
  if (!optionsName) {
    return false
  }
  const declaration = source.indexOf(`const ${optionsName} =`)
  return (
    declaration !== -1 &&
    INVALIDATES.test(balancedBlock(source, declaration, "{", "}"))
  )
}

/** Each `useAction(…)` call with its argument list. */
const useActionCalls = (source: string): string[] => {
  const calls: string[] = []
  let from = source.indexOf("useAction(")
  while (from !== -1) {
    const args = balancedBlock(source, from, "(", ")")
    calls.push(`useAction${args}`)
    from = source.indexOf("useAction(", from + args.length)
  }
  return calls
}

describe("pipeline mutations refetch every pipeline query", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    invalidateQueries.mockReset()
    toastSuccess.mockReset()
    invalidateInboxes.mockReset()
    toastError.mockReset()
  })

  test("a failed pipeline action refetches (the screen was likely stale) and toasts its message", () => {
    let callbacks: ReturnType<typeof usePipelineAction> | undefined
    function Probe() {
      callbacks = usePipelineAction({ errorMessage: "board.moveFailed" })
      return null
    }
    const root = createRoot(document.createElement("div"))
    act(() => {
      root.render(<Probe />)
    })

    callbacks?.onError({ error: { serverError: undefined } } as Parameters<
      NonNullable<typeof callbacks>["onError"]
    >[0])

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["pipelines"] })
    expect(toastError).toHaveBeenCalledWith("board.moveFailed")
    act(() => {
      root.unmount()
    })
  })

  test.each([
    { mayAssignContact: true, expected: 1 },
    { mayAssignContact: false, expected: 0 },
  ])("usePipelineAction invalidates inboxes only when an assignment may have run ($mayAssignContact)", ({
    mayAssignContact,
    expected,
  }) => {
    let callbacks: ReturnType<typeof usePipelineAction> | undefined
    function Probe() {
      callbacks = usePipelineAction({ mayAssignContact })
      return null
    }
    const root = createRoot(document.createElement("div"))
    act(() => {
      root.render(<Probe />)
    })

    callbacks?.onSuccess()

    expect(invalidateInboxes).toHaveBeenCalledTimes(expected)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["pipelines"],
    })
    act(() => {
      root.unmount()
    })
  })

  test("usePipelineAction invalidates the whole pipelines key, then toasts and finishes", () => {
    const onDone = vi.fn()
    let callbacks: ReturnType<typeof usePipelineAction> | undefined
    function Probe() {
      callbacks = usePipelineAction({ successMessage: "saved", onDone })
      return null
    }
    const root = createRoot(document.createElement("div"))
    act(() => {
      root.render(<Probe />)
    })

    callbacks?.onSuccess()

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["pipelines"] })
    expect(toastSuccess).toHaveBeenCalledWith("saved")
    expect(onDone).toHaveBeenCalled()
    act(() => {
      root.unmount()
    })
  })

  // AGENTS.md invariant 21: a mutation that refetches only part of the cache
  // leaves open drawers and other readers stale (a move once refetched only
  // the board).
  test("every useAction in the feature goes through the shared invalidation", () => {
    const offenders = sourceFiles(FEATURE_DIR).flatMap((file) => {
      const source = readFileSync(file, "utf8")
      return useActionCalls(source)
        .filter((call) => !callInvalidates(source, call))
        .map((call) => `${file}: ${call.slice(0, 120)}`)
    })

    expect(useActionCalls("useAction(a, b) x useAction(c)")).toHaveLength(2)

    expect(offenders).toEqual([])
  })
})
