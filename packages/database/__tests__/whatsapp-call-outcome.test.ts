import { describe, expect, test } from "vitest"
import {
  OUTCOME_BY_TERMINAL_STATUS,
  resolveWhatsappCallOutcome,
  resolveWhatsappCallTerminalOutcomePair,
} from "../src/partials/whatsapp-call"

describe("resolveWhatsappCallOutcome", () => {
  test("completed always resolves to completed", () => {
    expect(resolveWhatsappCallOutcome({ status: "completed" })).toBe(
      "completed",
    )
    expect(
      resolveWhatsappCallOutcome({
        status: "completed",
        canceledByBusiness: true,
      }),
    ).toBe("completed")
  })

  test("rejected always resolves to rejected", () => {
    expect(resolveWhatsappCallOutcome({ status: "rejected" })).toBe("rejected")
  })

  test("failed resolves to failed when not a business cancel", () => {
    expect(resolveWhatsappCallOutcome({ status: "failed" })).toBe("failed")
    expect(
      resolveWhatsappCallOutcome({
        status: "failed",
        canceledByBusiness: false,
      }),
    ).toBe("failed")
  })

  test("failed resolves to canceled only when canceledByBusiness is true — the single place the cancel rule lives", () => {
    expect(
      resolveWhatsappCallOutcome({
        status: "failed",
        canceledByBusiness: true,
      }),
    ).toBe("canceled")
  })

  test("OUTCOME_BY_TERMINAL_STATUS mirrors every terminal status 1:1 (the non-cancel default)", () => {
    expect(OUTCOME_BY_TERMINAL_STATUS).toEqual({
      completed: "completed",
      rejected: "rejected",
      failed: "failed",
    })
  })
})

describe("resolveWhatsappCallTerminalOutcomePair", () => {
  test("returns the matching status/outcome pair for completed and rejected", () => {
    expect(
      resolveWhatsappCallTerminalOutcomePair({ status: "completed" }),
    ).toEqual({
      status: "completed",
      outcome: "completed",
    })
    expect(
      resolveWhatsappCallTerminalOutcomePair({ status: "rejected" }),
    ).toEqual({
      status: "rejected",
      outcome: "rejected",
    })
  })

  test("failed without a business cancel pairs with outcome failed", () => {
    expect(
      resolveWhatsappCallTerminalOutcomePair({ status: "failed" }),
    ).toEqual({ status: "failed", outcome: "failed" })
  })

  test("failed with a business cancel pairs with outcome canceled, status still failed", () => {
    expect(
      resolveWhatsappCallTerminalOutcomePair({
        status: "failed",
        canceledByBusiness: true,
      }),
    ).toEqual({ status: "failed", outcome: "canceled" })
  })
})
