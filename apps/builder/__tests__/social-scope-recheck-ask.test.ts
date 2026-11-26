// @vitest-environment node
import { describe, expect, test } from "vitest"
import { decideRecheckAsk } from "@/features/social-accounts/lib/scope-recheck-ask"

const MINUTE = 60_000
const NOW = 100 * MINUTE

describe("decideRecheckAsk", () => {
  test("asks with the shown ids and stamps the workspace", () => {
    const { ids, next } = decideRecheckAsk({
      askedAt: new Map(),
      ids: ["a", "b"],
      nowMs: NOW,
      workspaceId: "ws-1",
    })

    expect(ids).toEqual(["a", "b"])
    expect(next.get("ws-1")).toBe(NOW)
  })

  test("asks at most once per 10 minutes per workspace", () => {
    const askedAt = new Map([["ws-1", NOW - 9 * MINUTE]])

    expect(
      decideRecheckAsk({ askedAt, ids: ["a"], nowMs: NOW, workspaceId: "ws-1" })
        .ids,
    ).toEqual([])
    expect(
      decideRecheckAsk({
        askedAt,
        ids: ["a"],
        nowMs: NOW + 2 * MINUTE,
        workspaceId: "ws-1",
      }).ids,
    ).toEqual(["a"])
  })

  test("another workspace is asked independently", () => {
    const askedAt = new Map([["ws-1", NOW]])

    expect(
      decideRecheckAsk({ askedAt, ids: ["a"], nowMs: NOW, workspaceId: "ws-2" })
        .ids,
    ).toEqual(["a"])
  })

  test("nothing to ask for does not use up the window", () => {
    const { ids, next } = decideRecheckAsk({
      askedAt: new Map(),
      ids: [],
      nowMs: NOW,
      workspaceId: "ws-1",
    })

    expect(ids).toEqual([])
    expect(next.has("ws-1")).toBe(false)
  })

  test("never asks for more than 100 ids", () => {
    const many = Array.from({ length: 130 }, (_, index) => `d${index}`)

    expect(
      decideRecheckAsk({
        askedAt: new Map(),
        ids: many,
        nowMs: NOW,
        workspaceId: "ws-1",
      }).ids,
    ).toHaveLength(100)
  })
})
