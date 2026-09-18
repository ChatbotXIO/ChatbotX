import { describe, expect, expectTypeOf, test } from "vitest"
import {
  resolveWhatsappCallOutcome,
  resolveWhatsappCallTerminalOutcomePair,
  type WhatsappCallTerminalStatus,
  type WhatsappCallTerminalStatusOutcomePair,
} from "../src/partials/whatsapp-call"

/**
 * Type-level coverage for the `{ status, outcome }` pairing contract
 * (design item 2, P5). `expectTypeOf` runs as a real (near) no-op at test
 * runtime — its assertions are only enforced under a real type-checker.
 * Unlike a plain `.test.ts` file, THIS file (`*.test-d.ts`) IS wired into an
 * automated gate: `packages/database/vitest.config.ts` enables
 * `test.typecheck` scoped to `**\/*.test-d.ts`, so `pnpm test` here runs
 * `tsc` over this file as part of the normal run — a regression in the
 * status/outcome pairing contract fails CI, not just a manual `tsc --noEmit`
 * someone has to remember to run (review A3: the describe block used to live
 * in `whatsapp-call-outcome.test.ts`, an ordinary `.test.ts` file vitest
 * never type-checks, so this exact coverage was previously silent).
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

    // Mismatched pairs (both properties given as LITERALS, so TypeScript can
    // discriminate on `status` and reject an incompatible `outcome`) must NOT
    // be assignable — asserted via @ts-expect-error below (compile-time only;
    // see the doc comment above this describe). Verified directly against
    // this repo's tsconfig: TypeScript attaches a "wrong outcome for this
    // status" error to the `const … = {` declaration line, but a "status
    // outside the terminal set" error to that property's OWN line — the
    // comment placement below matches each, one directive per case.

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
    // `WhatsappCallTerminalStatusOutcomePair`'s compile-time guarantee only
    // holds when `status` is a LITERAL at the call site: TypeScript picks a
    // discriminated-union branch from a literal discriminant, but for a
    // non-literal (union-typed) discriminant it is STRICTER, not looser — it
    // cannot pick a single branch to structurally check against, so it
    // REJECTS assigning a hand-built `{ status: <broad>, outcome: <literal> }`
    // object to the union outright, even for a matched pair (verified
    // directly against this repo's tsconfig while writing this test — see
    // the sibling assertion above). `endVoipCallAsAgent`'s wacid branch has
    // exactly this shape — `EndVoipCallResult.terminalStatus` is only known
    // as the broad `WhatsappCallTerminalStatus` — which is why it must go
    // through this helper's exhaustive runtime switch instead of building
    // the pair by hand. This test pins that the helper's RETURN type is the
    // correctly narrowed pair, so a caller can safely spread it into a
    // `WhatsappCallTerminalStatusOutcomePair`-typed parameter.
    const broadStatus: WhatsappCallTerminalStatus = "failed"

    expectTypeOf(
      resolveWhatsappCallTerminalOutcomePair({ status: broadStatus }),
    ).toEqualTypeOf<WhatsappCallTerminalStatusOutcomePair>()
  })
})
