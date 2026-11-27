// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findManyByKeys: vi.fn() }))

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findManyByKeys: mocks.findManyByKeys },
}))

const { withTriggerFieldKeysAsIds } = await import(
  "../src/template/trigger-field-keys"
)

const setField = (customFieldId: string) => ({
  type: "setCustomField",
  customFieldId,
  value: "x",
})

beforeEach(() => {
  mocks.findManyByKeys.mockReset()
  mocks.findManyByKeys.mockResolvedValue(
    new Map([
      ["plan", { id: "501", name: "plan" }],
      ["score", { id: "502", name: "score" }],
    ]),
  )
})

describe("withTriggerFieldKeysAsIds", () => {
  test("ships a field named by name as its id, resolving every trigger in one query", async () => {
    const result = await withTriggerFieldKeysAsIds("ws-1", [
      [setField("plan")],
      [setField("score"), { type: "addTag", tagIds: ["9"] }],
    ])

    expect(result).toEqual([
      [setField("501")],
      [setField("502"), { type: "addTag", tagIds: ["9"] }],
    ])
    expect(mocks.findManyByKeys).toHaveBeenCalledTimes(1)
    expect(mocks.findManyByKeys).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      keys: ["plan", "score"],
    })
  })

  test("leaves ids, bot-field references and other actions alone, without a query", async () => {
    const actions = [
      setField("123"),
      setField("bot_field:77"),
      { type: "clearCustomField", customFieldId: "plan" },
    ]

    const [result] = await withTriggerFieldKeysAsIds("ws-1", [actions])

    expect(result).toEqual(actions)
    expect(mocks.findManyByKeys).not.toHaveBeenCalled()
  })

  test("keeps a name that matches no field as written", async () => {
    const [result] = await withTriggerFieldKeysAsIds("ws-1", [
      [setField("missing")],
    ])

    expect(result).toEqual([setField("missing")])
  })

  test("never mutates the stored actions", async () => {
    const stored = [setField("plan")]

    await withTriggerFieldKeysAsIds("ws-1", [stored])

    expect(stored).toEqual([setField("plan")])
  })
})
