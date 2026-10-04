import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { connectSessionRepository } from "../src/repositories/connect-session/repository"
import { connectSessionModel } from "../src/schema"
import type { ConnectSessionModel } from "../src/types"

const guardMocks = vi.hoisted(() => ({
  and: vi.fn((...conditions) => ({ conditions })),
  eq: vi.fn((column, value) => ({ column, value })),
  gt: vi.fn((column, value) => ({ column, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}))

vi.mock("../src/client", () => ({
  and: guardMocks.and,
  db: {},
  eq: guardMocks.eq,
  gt: guardMocks.gt,
  sql: guardMocks.sql,
}))

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

  test("completes reconnects only for the matching unexpired claimed session", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const tx = { update } as unknown as DatabaseClient

    await expect(
      connectSessionRepository.completeReconnect(
        {
          id: "session-1",
          workspaceId: "ws-1",
          result: {
            targetId: "target-1",
            status: "connected",
            connectionId: "connection-1",
          },
        },
        tx,
      ),
    ).resolves.toBeUndefined()

    expect(guardMocks.eq).toHaveBeenCalledWith(
      connectSessionModel.id,
      "session-1",
    )
    expect(guardMocks.eq).toHaveBeenCalledWith(
      connectSessionModel.workspaceId,
      "ws-1",
    )
    expect(guardMocks.eq).toHaveBeenCalledWith(
      connectSessionModel.status,
      "authorized",
    )
    expect(guardMocks.gt).toHaveBeenCalledWith(
      connectSessionModel.expiresAt,
      expect.anything(),
    )
  })
})
