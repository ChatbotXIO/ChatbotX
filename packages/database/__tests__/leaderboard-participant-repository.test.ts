import { describe, expect, test, vi } from "vitest"

vi.mock("../src/client", () => ({
  db: {},
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}))

const { leaderboardParticipantRepository } = await import(
  "../src/repositories/leaderboard/participant"
)

/** A transaction whose raw query returns rows the way node-postgres does: timestamps as text. */
const txReturning = (rows: Record<string, unknown>[]) =>
  ({ execute: vi.fn().mockResolvedValue({ rows }) }) as never

describe("leaderboardParticipantRepository.setBanned", () => {
  test("returns scoredAt as a Date, so unbanning can restore the ranking", async () => {
    const row = await leaderboardParticipantRepository.setBanned(
      { leaderboardId: "1", contactId: "2", isBanned: false },
      txReturning([
        { contactId: "2", score: "15", scoredAt: "2026-10-15 03:00:00.123+00" },
      ]),
    )
    expect(row).toEqual({
      contactId: "2",
      score: 15,
      scoredAt: new Date("2026-10-15T03:00:00.123Z"),
    })
  })

  test("returns null when the participant does not exist", async () => {
    await expect(
      leaderboardParticipantRepository.setBanned(
        { leaderboardId: "1", contactId: "2", isBanned: true },
        txReturning([]),
      ),
    ).resolves.toBeNull()
  })
})
