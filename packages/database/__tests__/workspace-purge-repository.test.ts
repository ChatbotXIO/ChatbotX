import { describe, expect, test, vi } from "vitest"
import { workspacePurgeRepository } from "../src/repositories/workspace-purge"

describe("workspace purge repository", () => {
  test("decodes an analytics timestamp returned by the postgres driver", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ occurredAt: "2026-10-24T10:00:00.000Z" }],
    })

    const occurredAt = await workspacePurgeRepository.findNextAnalyticsRowAt(
      "AnalyticsAgentResponseEvent",
      "1",
      { execute } as never,
    )

    expect(occurredAt).toEqual(new Date("2026-10-24T10:00:00.000Z"))
  })
})
