// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { selectAllState } from "@/features/channel-connect/lib/select-all"

describe("selectAllState", () => {
  test("disabled is true when there are zero ids", () => {
    const state = selectAllState({
      ids: [],
      max: 20,
      onChange: vi.fn(),
      selected: [],
    })
    expect(state.disabled).toBe(true)
    expect(state.allSelected).toBe(false)
  })

  test("allSelected is false until every id is selected", () => {
    const state = selectAllState({
      ids: ["a", "b", "c"],
      max: 20,
      onChange: vi.fn(),
      selected: ["a", "b"],
    })
    expect(state.allSelected).toBe(false)
    expect(state.disabled).toBe(false)
  })

  test("allSelected is true once every id is selected", () => {
    const state = selectAllState({
      ids: ["a", "b"],
      max: 20,
      onChange: vi.fn(),
      selected: ["a", "b"],
    })
    expect(state.allSelected).toBe(true)
  })

  test("allSelected reflects the max cap, not literally every id", () => {
    const state = selectAllState({
      ids: ["a", "b", "c"],
      max: 2,
      onChange: vi.fn(),
      selected: ["a", "b"],
    })
    expect(state.allSelected).toBe(true)
  })

  test("toggleAll(true) reports ids sliced to max", () => {
    const onChange = vi.fn()
    const state = selectAllState({
      ids: ["a", "b", "c"],
      max: 2,
      onChange,
      selected: [],
    })
    state.toggleAll(true)
    expect(onChange).toHaveBeenCalledWith(["a", "b"])
  })

  test("toggleAll(false) reports an empty selection", () => {
    const onChange = vi.fn()
    const state = selectAllState({
      ids: ["a", "b"],
      max: 20,
      onChange,
      selected: ["a", "b"],
    })
    state.toggleAll(false)
    expect(onChange).toHaveBeenCalledWith([])
  })
})
