import { describe, expect, test } from "vitest"
import { resolveMonthlyBotMessagesReset } from "../src/schedule/handlers/sync-user-quota"

const P1 = new Date("2026-06-01T00:00:00.000Z")
const P2 = new Date("2026-07-01T00:00:00.000Z")

describe("resolveMonthlyBotMessagesReset", () => {
  test("never resets a lifetime plan (periodEnd null), regardless of stamp state", () => {
    expect(resolveMonthlyBotMessagesReset(null, P1, true)).toEqual({
      reset: false,
      stamp: false,
    })
    expect(resolveMonthlyBotMessagesReset(P1, P2, true)).toEqual({
      reset: false,
      stamp: false,
    })
  })

  test("no-ops when there is no billing anchor (periodStart null)", () => {
    expect(resolveMonthlyBotMessagesReset(null, null, false)).toEqual({
      reset: false,
      stamp: false,
    })
    expect(resolveMonthlyBotMessagesReset(P1, null, false)).toEqual({
      reset: false,
      stamp: false,
    })
  })

  test("adopts an unstamped row into the current period WITHOUT zeroing usage", () => {
    // First run / a row that predates this column. Existing accumulated usage
    // must survive — zeroing here would hand every existing customer a free month.
    expect(resolveMonthlyBotMessagesReset(null, P1, false)).toEqual({
      reset: false,
      stamp: true,
    })
  })

  test("resets when the stamp is older than the current period (rollover)", () => {
    expect(resolveMonthlyBotMessagesReset(P1, P2, false)).toEqual({
      reset: true,
      stamp: true,
    })
  })

  test("is a no-op when the stamp already matches the current period", () => {
    expect(resolveMonthlyBotMessagesReset(P1, P1, false)).toEqual({
      reset: false,
      stamp: false,
    })
  })
})
