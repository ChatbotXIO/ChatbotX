import { describe, expect, test, vi } from "vitest"
import { loadAllActionOptions } from "@/features/ai-agents/lib/load-action-options"

describe("AI action target options", () => {
  test("loads every page when a target list exceeds 100 records", async () => {
    const list = vi.fn(async (page: number) => ({
      data: page === 1 ? Array.from({ length: 100 }, (_, i) => i) : [100],
      pageCount: 2,
    }))
    await expect(loadAllActionOptions(list)).resolves.toHaveLength(101)
    expect(list).toHaveBeenCalledWith(1)
    expect(list).toHaveBeenCalledWith(2)
  })
})
