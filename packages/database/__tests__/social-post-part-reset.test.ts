import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { socialPostPartRepository } from "../src/repositories/social-post/parts"

type SetValues = Record<string, unknown>

const captureReset = async (): Promise<SetValues> => {
  let captured: SetValues = {}
  const chain = {
    returning: vi.fn(async () => [{ socialPostTargetId: "target-1" }]),
    set: vi.fn((values: SetValues) => {
      captured = values
      return chain
    }),
    where: vi.fn(() => chain),
  }
  const tx = { update: vi.fn(() => chain) } as unknown as DatabaseClient
  await socialPostPartRepository.resetForRetry(
    { id: "part-1", now: new Date(), workspaceId: "ws-1" },
    tx,
  )
  return captured
}

describe("socialPostPartRepository.resetForRetry", () => {
  test("resets both the attempt count and the rate-limit budget", async () => {
    const values = await captureReset()

    expect(values.attemptCount).toBe(0)
    expect(values.rateLimitAttempts).toBe(0)
    expect(values.status).toBe("pending")
  })
})
