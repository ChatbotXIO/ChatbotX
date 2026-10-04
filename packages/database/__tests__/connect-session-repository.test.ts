import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { connectSessionRepository } from "../src/repositories/connect-session/repository"
import type { ConnectSessionModel } from "../src/types"

const malformedSession = {
  nextAction: { type: "unknown" },
  results: [],
  targets: [],
} as unknown as ConnectSessionModel

describe("connectSessionRepository", () => {
  test("rejects malformed nextAction data read from the database", async () => {
    const findFirst = vi.fn().mockResolvedValue(malformedSession)
    const tx = {
      query: { connectSessionModel: { findFirst } },
    } as unknown as DatabaseClient

    await expect(
      connectSessionRepository.findById({ id: "session-1" }, tx),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ["type"] })],
    })
  })
})
