import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { socialPostTargetSetRepository } from "../src/repositories/social-post-target-set/repository"

describe("socialPostTargetSetRepository.replaceDestinations", () => {
  test("locks the target-set row before it deletes the old selection", async () => {
    const calls: string[] = []
    const select = {
      for: vi.fn((mode: string) => {
        calls.push(`lock:${mode}`)
        return Promise.resolve([{ id: "set-1" }])
      }),
      from: vi.fn(() => select),
      limit: vi.fn(() => select),
      where: vi.fn(() => select),
    }
    const tx = {
      delete: vi.fn(() => ({
        where: vi.fn(() => {
          calls.push("delete")
          return Promise.resolve()
        }),
      })),
      select: vi.fn(() => select),
    } as unknown as DatabaseClient

    await socialPostTargetSetRepository.replaceDestinations(
      { destinationIds: [], targetSetId: "set-1", workspaceId: "ws-1" },
      tx,
    )

    expect(calls).toEqual(["lock:update", "delete"])
  })
})
