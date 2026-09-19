import { describe, expect, expectTypeOf, test } from "vitest"
import {
  resolveWhatsappCallOutcome,
  resolveWhatsappCallTerminalOutcomePair,
  type WhatsappCallTerminalStatus,
  type WhatsappCallTerminalStatusOutcomePair,
} from "../src/partials/whatsapp-call"

/**
 * Type-level coverage for the `{ status, outcome }` pairing contract.
 * `expectTypeOf` only asserts under a real type-checker; `packages/database/vitest.config.ts`
 * scopes `test.typecheck` to `**\/*.test-d.ts`, so `pnpm test` runs `tsc` over this file —
 * a plain `.test.ts` would never get type-checked, so keep this a `.test-d.ts` file.
 */
describe("finalize status/outcome pairing — type level", () => {
  test("WhatsappCallTerminalStatusOutcomePair only accepts a matched pair", () => {
    const valid: WhatsappCallTerminalStatusOutcomePair[] = [
      { status: "completed", outcome: "completed" },
      { status: "rejected", outcome: "rejected" },
      { status: "failed", outcome: "failed" },
      { status: "failed", outcome: "canceled" },
    ]
    expect(valid).toHaveLength(4)

    expectTypeOf<{
      status: "completed"
      outcome: "completed"
    }>().toMatchTypeOf<WhatsappCallTerminalStatusOutcomePair>()
    expectTypeOf<{
      status: "rejected"
      outcome: "rejected"
    }>().toMatchTypeOf<WhatsappCallTerminalStatusOutcomePair>()
    expectTypeOf<{
      status: "failed"
      outcome: "failed"
    }>().toMatchTypeOf<WhatsappCallTerminalStatusOutcomePair>()
    expectTypeOf<{
      status: "failed"
      outcome: "canceled"
    }>().toMatchTypeOf<WhatsappCallTerminalStatusOutcomePair>()

    // Mismatched literal pairs must not be assignable. TypeScript attaches a
    // "wrong outcome" error to the declaration line but a "status outside the
    // terminal set" error to that property's own line — directives below match each.

    // @ts-expect-error rejected can never pair with outcome "completed"
    const mismatched1: WhatsappCallTerminalStatusOutcomePair = {
      status: "rejected",
      outcome: "completed",
    }
    // @ts-expect-error completed can never pair with outcome "rejected"
    const mismatched2: WhatsappCallTerminalStatusOutcomePair = {
      status: "completed",
      outcome: "rejected",
    }
    const mismatched3: WhatsappCallTerminalStatusOutcomePair = {
      // @ts-expect-error a non-terminal status is never part of this pair type
      status: "ringing",
      outcome: "failed",
    }
    expect([mismatched1, mismatched2, mismatched3]).toHaveLength(3)
  })

  test("resolveWhatsappCallOutcome narrows its return type to the caller's literal status", () => {
    expectTypeOf(
      resolveWhatsappCallOutcome({ status: "completed" as const }),
    ).toEqualTypeOf<"completed">()
    expectTypeOf(
      resolveWhatsappCallOutcome({ status: "rejected" as const }),
    ).toEqualTypeOf<"rejected">()
    expectTypeOf(
      resolveWhatsappCallOutcome({ status: "failed" as const }),
    ).toEqualTypeOf<"failed" | "canceled">()
  })

  test("resolveWhatsappCallTerminalOutcomePair is safe for a BROAD (non-literal) status — the discriminant TypeScript itself cannot narrow", () => {
    // For a non-literal (union-typed) status, TypeScript can't pick a branch to
    // check against, so it rejects a hand-built pair object outright even when matched.
    // `endVoipCallAsAgent`'s wacid branch has exactly this shape, hence the exhaustive
    // runtime switch below instead of building the pair by hand.
    const broadStatus: WhatsappCallTerminalStatus = "failed"

    expectTypeOf(
      resolveWhatsappCallTerminalOutcomePair({ status: broadStatus }),
    ).toEqualTypeOf<WhatsappCallTerminalStatusOutcomePair>()
  })
})
