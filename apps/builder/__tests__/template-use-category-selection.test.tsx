// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { CategorySelectionState } from "@/features/templates/lib/selection"
import { useCategorySelection } from "@/features/templates/lib/use-category-selection"

const toastError = vi.fn()
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

type Handlers = ReturnType<typeof useCategorySelection>
type Props = {
  selection: CategorySelectionState
  onChange: (next: CategorySelectionState) => void
  fetchAllIds: () => Promise<string[]>
}

let root: Root | null = null
let handlers: Handlers | null = null

function Harness(props: Props) {
  handlers = useCategorySelection({ ...props, allIds: undefined, total: 3 })
  return null
}

const render = (props: Props) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  if (!root) {
    root = createRoot(document.createElement("div"))
  }
  act(() => root?.render(<Harness {...props} />))
}

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  handlers = null
  vi.clearAllMocks()
})

describe("category selection with an id list it must fetch", () => {
  test("a failed fetch tells the user and leaves the selection alone", async () => {
    const onChange = vi.fn()
    render({
      selection: { mode: "all" },
      onChange,
      fetchAllIds: () => Promise.reject(new Error("offline")),
    })

    await act(async () => {
      await handlers?.toggleRow("b", false)
    })

    expect(toastError).toHaveBeenCalledWith("messages.errorLoadingData")
    expect(onChange).not.toHaveBeenCalled()
  })

  // The fetch can take a while; a selection that changed meanwhile must not
  // be overwritten with the stale one the click started from.
  test("applies the change to the selection as it is when the fetch lands", async () => {
    const onChange = vi.fn()
    const ids = deferred<string[]>()
    const props: Props = {
      selection: { mode: "all" },
      onChange,
      fetchAllIds: () => ids.promise,
    }
    render(props)

    let pending: Promise<void> | undefined
    act(() => {
      pending = handlers?.toggleRow("b", false)
    })
    render({ ...props, selection: { mode: "all", lockAll: true } })
    await act(async () => {
      ids.resolve(["a", "b", "c"])
      await pending
    })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "ids", ids: ["a", "c"] }),
    )
    // The latest selection was all-locked, so the rows still selected stay
    // locked (a stale read would leave none locked).
    const [next] = onChange.mock.calls[0] as [
      { lockedIds?: string[] } | undefined,
    ]
    expect(next?.lockedIds).toEqual(["a", "c"])
  })

  test("a failed fetch while locking a row tells the user and changes nothing", async () => {
    const onChange = vi.fn()
    render({
      selection: { mode: "all" },
      onChange,
      fetchAllIds: () => Promise.reject(new Error("offline")),
    })

    await act(async () => {
      await handlers?.toggleRowLock("b", true)
    })

    expect(toastError).toHaveBeenCalledWith("messages.errorLoadingData")
    expect(onChange).not.toHaveBeenCalled()
  })

  test("locking a row applies to the selection as it is when the fetch lands", async () => {
    const onChange = vi.fn()
    const ids = deferred<string[]>()
    const props: Props = {
      selection: { mode: "all" },
      onChange,
      fetchAllIds: () => ids.promise,
    }
    render(props)

    let pending: Promise<void> | undefined
    act(() => {
      pending = handlers?.toggleRowLock("b", true)
    })
    // Meanwhile the user narrowed the selection to two rows.
    render({ ...props, selection: { mode: "ids", ids: ["a", "b"] } })
    await act(async () => {
      ids.resolve(["a", "b", "c"])
      await pending
    })

    // Built from the latest (two-row) selection, not the stale "all" one.
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      mode: "ids",
      ids: ["a", "b"],
      lockedIds: ["b"],
    })
  })

  test("locking one row of an all selection fetches the ids first", async () => {
    const onChange = vi.fn()
    render({
      selection: { mode: "all" },
      onChange,
      fetchAllIds: () => Promise.resolve(["a", "b", "c"]),
    })

    await act(async () => {
      await handlers?.toggleRowLock("b", true)
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ mode: "ids" })
  })
})
